/**
 * tube-fetch-api — YouTube Video Downloader API (HD)
 * Main entry point. Wires up Express, CORS, JSON parsing, routes,
 * and a global error handler.
 */
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware -------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- Health check -----------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- API routes -------------------------------------------------------------
app.use('/api', apiRoutes);

// --- 404 handler (no route matched) ------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Global error handler ---------------------------------------------------
// Express routes call next(err) on failures; this catches them last.
app.use((err, req, res, _next) => {
  console.error('[error]', err && err.message ? err.message : err);
  const status = err && err.statusCode ? err.statusCode : 500;
  res.status(status).json({
    error: err && err.message ? err.message : 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`tube-fetch-api listening on port ${PORT}`);
});
