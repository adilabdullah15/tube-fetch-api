/**
 * routes/api.js
 *
 *   GET /api/info?url=<youtube-url>
 *   GET /api/download?url=<youtube-url>&quality=best|720p|480p|360p
 *
 * Every route validates the `url` param (http/https + YouTube host) and
 * translates yt-dlp failures into 502 JSON errors.
 */
const express = require('express');
const { getInfo, downloadStream, sanitizeFilename, VALID_QUALITIES } = require('../lib/ytdlp');

const router = express.Router();

// Hostnames we accept as YouTube sources.
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
]);

/**
 * Validate the `url` query param.
 * @param {*} raw - req.query.url
 * @returns {{ok: true, url: string} | {ok: false, message: string}}
 */
function validateYoutubeUrl(raw) {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, message: 'Missing required query parameter: url' };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_e) {
    return { ok: false, message: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'URL must use http or https' };
  }

  // Exact or subdomain match against the allowlist (e.g. "music.youtube.com").
  const host = parsed.hostname.toLowerCase();
  const allowed = [...ALLOWED_HOSTS].some(
    (h) => host === h || host.endsWith(`.${h}`)
  );
  if (!allowed) {
    return { ok: false, message: 'URL must be a YouTube URL (youtube.com or youtu.be)' };
  }

  return { ok: true, url: parsed.toString() };
}

/**
 * Validate the `quality` query param for /api/download.
 * Defaults to "best" when omitted.
 */
function validateQuality(raw) {
  const q = (raw || 'best').toString().toLowerCase();
  if (!VALID_QUALITIES.includes(q)) {
    return {
      ok: false,
      message: `Invalid quality "${raw}". Must be one of: ${VALID_QUALITIES.join(', ')}`,
    };
  }
  return { ok: true, quality: q };
}

// ---------------------------------------------------------------------------
// GET /api/info?url=<youtube-url>
// Returns JSON metadata: title, duration, thumbnail, uploader, qualities[].
// ---------------------------------------------------------------------------
router.get('/info', async (req, res, next) => {
  const urlCheck = validateYoutubeUrl(req.query.url);
  if (!urlCheck.ok) {
    return res.status(400).json({ error: urlCheck.message });
  }

  try {
    const info = await getInfo(urlCheck.url);
    res.json(info);
  } catch (err) {
    // yt-dlp failures (network, removed video, blocked) → 502.
    next(Object.assign(err, { statusCode: 502 }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/download?url=<youtube-url>&quality=...
// Streams the merged mp4 as a download attachment.
// ---------------------------------------------------------------------------
router.get('/download', async (req, res, next) => {
  const urlCheck = validateYoutubeUrl(req.query.url);
  if (!urlCheck.ok) {
    return res.status(400).json({ error: urlCheck.message });
  }

  const qualityCheck = validateQuality(req.query.quality);
  if (!qualityCheck.ok) {
    return res.status(400).json({ error: qualityCheck.message });
  }

  // We need the title first so the download gets a meaningful filename.
  let title = 'video';
  try {
    const info = await getInfo(urlCheck.url);
    title = info.title || 'video';
  } catch (err) {
    return next(Object.assign(err, { statusCode: 502 }));
  }

  const filename = sanitizeFilename(title);
  const child = downloadStream(urlCheck.url, qualityCheck.quality);

  // Catch a failed spawn (e.g. yt-dlp not installed) before piping.
  child.once('spawnFailure', (err) => {
    if (!res.headersSent) {
      next(Object.assign(err, { statusCode: 502 }));
    }
    child.kill('SIGKILL');
  });

  // Catch a mid-stream yt-dlp failure (stderr holds the reason).
  let stderrTail = '';
  if (child.stderr) {
    child.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-500);
    });
  }
  child.once('close', (code) => {
    if (code !== 0 && !res.headersSent) {
      next(Object.assign(
        new Error(`Download failed: ${stderrTail.trim() || 'yt-dlp exited with code ' + code}`),
        { statusCode: 502 }
      ));
    }
  });

  // If the client disconnects mid-download, stop the child process.
  res.on('close', () => {
    if (!child.killed) child.kill('SIGKILL');
  });

  res.setHeader('Content-Type', 'video/mp4');
  // RFC 5987 filename* keeps non-ASCII titles intact in most browsers.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );

  child.stdout.pipe(res);
});

module.exports = router;
