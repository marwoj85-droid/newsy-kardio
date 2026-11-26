// Lokalny serwer do testów na komputerze: node server.mjs  ->  http://localhost:3017
// Na telefonie aplikacja działa z GitHub Pages (dane odświeża GitHub Actions).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFetch, loadStore } from './lib/fetch.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = process.env.PORT || config.port;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let running = null;

function refresh() {
  if (!running) running = runFetch(m => console.log(new Date().toLocaleTimeString('pl-PL'), m)).finally(() => { running = null; });
  return running;
}
function maybeRefresh() {
  const { lastFetch } = loadStore();
  if (!lastFetch || Date.now() - Date.parse(lastFetch) > config.refreshHours * 36e5) refresh().catch(e => console.error(e));
}
const send = (res, code, body, type = TYPES['.json']) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/refresh' && req.method === 'POST') return send(res, 200, JSON.stringify(await refresh()));
    const file = url.pathname.startsWith('/data/')
      ? path.join(ROOT, 'data', path.basename(url.pathname))
      : path.join(PUBLIC, path.normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, '{"error":"not found"}');
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  } catch (e) { console.error(e); send(res, 500, JSON.stringify({ error: e.message })); }
}).listen(PORT, () => {
  console.log(`Newsy Kardio: http://localhost:${PORT}`);
  maybeRefresh();
  setInterval(maybeRefresh, 30 * 60e3);
});
