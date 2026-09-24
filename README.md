# tube-fetch-api 🎬

![license](https://img.shields.io/badge/license-MIT-blue.svg)
![node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![yt-dlp](https://img.shields.io/badge/engine-yt--dlp-red.svg)
[![GitHub](https://img.shields.io/badge/github-adilabdullah15-black.svg)](https://github.com/adilabdullah15)

**A lightweight YouTube Video Downloader API (HD)** — fetch video metadata and stream HD downloads straight through a simple REST API, powered by the `yt-dlp` engine.

## ✨ Features

- 📄 **Video metadata** — title, duration, thumbnail, uploader and available qualities
- ⬇️ **HD downloads** — stream videos as MP4 attachments (best, 720p, 480p, 360p)
- 🔒 **Input validation** — only YouTube URLs accepted; invalid input returns clean 400 JSON errors
- 🧹 **Filename sanitization** — downloads arrive with a safe, human-readable filename
- 🩺 **Health endpoint** for uptime checks
- 🐳 **Docker-ready** — one image ships Node, ffmpeg and yt-dlp together

## 🚀 Quick Start

```bash
npm install
npm start
```

The API is now running at `http://localhost:3000`. Health check:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## 📡 API Reference

| Method | Endpoint | Query params | Description |
|---|---|---|---|
| `GET` | `/health` | — | Service status |
| `GET` | `/api/info` | `url` (YouTube URL) | Video metadata as JSON |
| `GET` | `/api/download` | `url` (YouTube URL), `quality` (`best`\|`720p`\|`480p`\|`360p`, default `best`) | Stream video as an MP4 download attachment |

### Get video info

```bash
curl "http://localhost:3000/api/info?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Response:

```json
{
  "title": "Example Video",
  "duration": 213,
  "thumbnail": "https://i.ytimg.com/vi/.../hqdefault.jpg",
  "uploader": "SomeChannel",
  "qualities": [
    { "label": "best", "selector": "bv*+ba/b" },
    { "label": "1080p", "selector": "bv*[height<=1080]+ba/b[height<=1080]/b" },
    { "label": "720p", "selector": "bv*[height<=720]+ba/b[height<=720]/b" }
  ]
}
```

### Download a video

```bash
# Save a 720p MP4 straight to disk
curl -L -o video.mp4 "http://localhost:3000/api/download?url=https://youtu.be/dQw4w9WgXcQ&quality=720p"
```

The response carries `Content-Type: video/mp4` and `Content-Disposition: attachment` with the video's sanitized title as the filename.

### Error responses

| Status | Meaning |
|---|---|
| `400` | Missing/invalid `url` or `quality` — `{ "error": "..." }` |
| `404` | Unknown route — `{ "error": "Not found" }` |
| `502` | yt-dlp failed (bad link, removed video, network issue) — `{ "error": "..." }` |

## 🗂️ Project Structure

```
tube-fetch-api/
├── server.js        # Express app: CORS, JSON, routes, error handler
├── routes/
│   └── api.js       # /api/info and /api/download endpoints + URL validation
├── lib/
│   └── ytdlp.js     # yt-dlp helpers: getInfo(), downloadStream(), filename sanitize
├── Dockerfile       # node:20-slim + python3/pip + yt-dlp + ffmpeg
├── package.json
├── .gitignore
└── LICENSE
```

## 🛠️ Tech Stack

- **Node.js 20 + Express 4** — HTTP server & routing
- **yt-dlp** (via `child_process`) — download/metadata engine
- **ffmpeg** — audio/video merging for HD qualities
- **cors** — cross-origin access
- **Docker** — one-command deployment

## 🐳 Deploy with Docker

```bash
docker build -t tube-fetch-api .
docker run -p 3000:3000 tube-fetch-api
```

The container exposes port **3000**; override the port with `-e PORT=8080 -p 8080:8080`.

## ⚠️ Responsible use

Please **use responsibly** — only download content you have rights to (your own uploads, Creative Commons / public-domain videos, or anything covered by the platform's terms and your local law). Respect creators and copyright.

## 👤 Author

**Adil Abdullah Khan** — BS Information Technology, Thal University Bhakkar, Pakistan

- 📧 adilabdullahkhan35@gmail.com
- 🐙 https://github.com/adilabdullah15

## 📄 License

MIT — see [LICENSE](./LICENSE).
