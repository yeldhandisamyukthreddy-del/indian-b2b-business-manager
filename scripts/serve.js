// Minimal static file server for local development and tests: `npm run serve` -> http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'app');
const port = parseInt(process.env.PORT, 10) || 8080;
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
    });
}).listen(port, () => console.log(`VyaparEasy running at http://localhost:${port}`));
