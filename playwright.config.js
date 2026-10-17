// End-to-end tests run the real app in Chromium: `npm test`
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: 'tests',
    timeout: 60000,
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://localhost:8123',
        timezoneId: 'Asia/Kolkata',
        locale: 'en-IN',
        acceptDownloads: true,
        // Use a preinstalled Chromium when PLAYWRIGHT_CHROMIUM is set (e.g. in sandboxed environments)
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
    },
    webServer: {
        command: 'node scripts/serve.js',
        env: { PORT: '8123' },
        url: 'http://localhost:8123',
        reuseExistingServer: !process.env.CI
    }
});
