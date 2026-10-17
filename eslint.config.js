// Lint config: `npm run lint`. Also checks the JavaScript inside app/index.html.
const js = require('@eslint/js');
const globals = require('globals');
const html = require('eslint-plugin-html');

module.exports = [
    { ignores: ['node_modules/', 'dist/', 'test-results/', 'playwright-report/'] },
    js.configs.recommended,
    {
        files: ['app/**/*.html'],
        plugins: { html },
        languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: globals.browser },
        rules: {
            // Top-level functions are called from onclick="..." attributes, which ESLint can't see
            'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }]
        }
    },
    { files: ['app/sw.js'], languageOptions: { globals: globals.serviceworker } },
    {
        files: ['electron/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*.config.js'],
        languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: globals.node },
        rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] }
    }
];
