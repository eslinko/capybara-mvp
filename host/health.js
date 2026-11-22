'use strict';

/**
 * Minimal health payload (AC-H02). Must not include secrets or env dumps.
 * @returns {{ ok: true }}
 */
function healthPayload() {
  return { ok: true };
}

/**
 * @param {import('http').ServerResponse} res
 */
function writeHealthResponse(res) {
  const body = JSON.stringify(healthPayload());
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Thin host fallback router — `GET /health` open (AC-I05 / AC-H02).
 * Identity `/auth/*` is handled by `authHttp.js` before this fallback (EDGE-01).
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function handleHostRequest(req, res) {
  const url = typeof req.url === 'string' ? req.url.split('?')[0] : '';
  if (req.method === 'GET' && (url === '/health' || url === '/health/')) {
    writeHealthResponse(res);
    return;
  }

  const body = JSON.stringify({ ok: false, error: 'not_found' });
  res.writeHead(404, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

module.exports = {
  healthPayload,
  writeHealthResponse,
  handleHostRequest,
};
