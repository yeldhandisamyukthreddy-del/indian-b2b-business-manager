// Rewrites the FILES list in app/sw.js from what is on disk (app shell, scripts, templates) and bumps CACHE,
// so the installed web app works offline after scripts or templates are added: `npm run sync-offline-files`
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');
const SW = path.join(APP, 'sw.js');
const SHELL = ['./', 'index.html', 'manifest.webmanifest'];

const walk = dir =>
    fs
        .readdirSync(path.join(APP, dir), { withFileTypes: true })
        .flatMap(e => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
        .sort();
const files = [
    ...SHELL,
    ...walk('icons').filter(f => /\.(svg|png)$/.test(f)),
    ...walk('fonts').filter(f => f.endsWith('.woff2')),
    ...walk('js'),
    ...walk('templates')
];

const src = fs.readFileSync(SW, 'utf8');
const list = `const FILES = [\n${files.map(f => `    '${f}'`).join(',\n')}\n];`;
let next = src.replace(/const FILES = \[[\s\S]*?\];/, list);
if (next !== src) next = next.replace(/const CACHE = 'vyapareasy-v(\d+)';/, (m, n) => `const CACHE = 'vyapareasy-v${Number(n) + 1}';`);
fs.writeFileSync(SW, next);
console.log(next === src ? 'app/sw.js is up to date' : `app/sw.js lists ${files.length} files`);
