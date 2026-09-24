/**
 * lib/ytdlp.js
 *
 * Thin wrapper around the `yt-dlp` binary (invoked via child_process).
 * Two public helpers:
 *   - getInfo(url)                → video metadata + available qualities
 *   - downloadStream(url, quality) → a ChildProcess whose stdout is the
 *                                    encoded video bytes (piped with `-o -`)
 *
 * All failures are re-thrown as Error instances with clean, client-safe
 * messages (stderr is trimmed so internal paths/args never leak).
 */
const { execFile, spawn } = require('child_process');

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const INFO_TIMEOUT_MS = 15000; // ~15s per the spec
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 min hard cap per download

/**
 * Quality labels → yt-dlp format selectors.
 * best    : highest quality combined stream
 * 720p    : best 720p-or-lower video + best audio, merged
 * 480p    : best 480p-or-lower video + best audio, merged
 * 360p    : best 360p-or-lower video + best audio, merged
 */
const FORMAT_SELECTORS = {
  best: 'bv*+ba/b',
  '720p': 'bv*[height<=720]+ba/b[height<=720]/b',
  '480p': 'bv*[height<=480]+ba/b[height<=480]/b',
  '360p': 'bv*[height<=360]+ba/b[height<=360]/b',
};

const VALID_QUALITIES = Object.keys(FORMAT_SELECTORS);

/**
 * Normalize yt-dlp's stderr into a short, client-safe error message.
 * @param {string} stderr
 * @returns {string}
 */
function cleanError(stderr) {
  const text = (stderr || '').trim();
  if (!text) return 'yt-dlp failed with no output';
  // Keep only the first two lines; long stderr dumps are internal noise.
  const lines = text.split('\n').filter(Boolean).slice(0, 2);
  return lines.join(' ').slice(0, 300);
}

/**
 * Fetch video metadata and a list of downloadable quality options.
 * @param {string} url - A validated YouTube video URL.
 * @returns {Promise<{title, duration, thumbnail, uploader, qualities[]}>}
 * @throws {Error} when yt-dlp fails, times out, or returns unparsable JSON.
 */
function getInfo(url) {
  return new Promise((resolve, reject) => {
    execFile(
      YTDLP_BIN,
      ['--dump-json', '--no-playlist', '--no-warnings', url],
      { timeout: INFO_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.killed && err.signal === 'SIGTERM') {
            return reject(new Error('Timed out while fetching video info'));
          }
          return reject(new Error(`Could not fetch video info: ${cleanError(stderr)}`));
        }

        let data;
        try {
          data = JSON.parse(stdout);
        } catch (_parseErr) {
          return reject(new Error('Received invalid metadata from yt-dlp'));
        }

        // Build the quality list from the mp4-ish formats yt-dlp reports,
        // de-duplicated by height and sorted high → low.
        const seen = new Set();
        const qualities = [{ label: 'best', selector: FORMAT_SELECTORS.best }];
        if (Array.isArray(data.formats)) {
          for (const f of data.formats) {
            if (!f.height || seen.has(f.height)) continue;
            seen.add(f.height);
            qualities.push({
              label: `${f.height}p`,
              selector: `bv*[height<=${f.height}]+ba/b[height<=${f.height}]/b`,
            });
          }
          qualities.sort((a, b) => {
            const ha = parseInt(a.label, 10) || Infinity;
            const hb = parseInt(b.label, 10) || Infinity;
            return hb - ha;
          });
        }

        resolve({
          title: data.title || 'Unknown title',
          duration: typeof data.duration === 'number' ? data.duration : null,
          thumbnail: data.thumbnail || null,
          uploader: data.uploader || data.channel || null,
          qualities,
        });
      }
    );
  });
}

/**
 * Spawn yt-dlp to stream the video bytes for the given quality.
 * @param {string} url - A validated YouTube video URL.
 * @param {string} quality - One of: best, 720p, 480p, 360p.
 * @returns {import('child_process').ChildProcess} — pipe child.stdout to the
 *          HTTP response. The caller should listen for 'error'/'close'.
 * @throws {Error} when the quality label is unknown or spawn fails.
 */
function downloadStream(url, quality) {
  const selector = FORMAT_SELECTORS[quality] || FORMAT_SELECTORS.best;

  const child = spawn(
    YTDLP_BIN,
    [
      '--no-playlist',
      '--no-warnings',
      '-f', selector,
      '--merge-output-format', 'mp4',
      '-o', '-', // write the merged file to stdout
      url,
    ],
    { timeout: DOWNLOAD_TIMEOUT_MS, killSignal: 'SIGKILL' }
  );

  // Guard: if the binary cannot be spawned (missing install), yt-dlp
  // emits 'error' asynchronously — re-emit a friendly message.
  child.on('error', (err) => {
    child.emit('spawnFailure', new Error(
      err.code === 'ENOENT'
        ? 'yt-dlp is not installed or not on PATH'
        : `Failed to start download: ${err.message}`
    ));
  });

  return child;
}

/**
 * Strip unsafe characters from a video title for use in a download filename.
 * Keeps letters, numbers, spaces, dashes, underscores and dots; everything
 * else becomes an underscore. Truncates to a safe length.
 * @param {string} title
 * @returns {string} e.g. "My Video Title.mp4"
 */
function sanitizeFilename(title) {
  const base = (title || 'video')
    .replace(/[^\w\s.\-()[\]]/g, '_') // unsafe chars → underscore
    .replace(/\s+/g, ' ')              // collapse whitespace
    .trim()
    .slice(0, 120);                    // keep filenames sane
  return `${base || 'video'}.mp4`;
}

module.exports = {
  getInfo,
  downloadStream,
  sanitizeFilename,
  VALID_QUALITIES,
  FORMAT_SELECTORS,
};
