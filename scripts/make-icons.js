// Renders app/icons/icon.svg to the PNG sizes used by the web app manifest and the desktop installers.
// Run after changing the icon: `npm run icons` (needs `npx playwright install chromium` once).
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'app/icons/icon.svg'), 'utf8');
// Maskable icons must fill the whole square; launchers apply their own rounded mask
const maskable = svg.replace('rx="112"', 'rx="0"').replace('<path', '<g transform="translate(51 51) scale(0.8)"><path').replace('</svg>', '</g></svg>');

const outputs = [
    ['app/icons/icon-192.png', 192, svg],
    ['app/icons/icon-512.png', 512, svg],
    ['app/icons/maskable-512.png', 512, maskable],
    ['app/icons/apple-touch-icon.png', 180, maskable],
    ['build/icon.png', 1024, svg]
];

(async () => {
    const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
    const page = await browser.newPage();
    for (const [file, size, source] of outputs) {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(
            `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
        );
        await page.screenshot({ path: path.join(root, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
        console.log('wrote', file);
    }
    await browser.close();
})();
