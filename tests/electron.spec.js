// Desktop app smoke test: the window opens, data is saved and survives a restart.
// On Linux run it under a display, e.g. `xvfb-run npx playwright test tests/electron.spec.js`.
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
let electronAvailable = true;
try { require('electron'); } catch { electronAvailable = false; }

test.skip(!electronAvailable, 'Electron binary not installed');

async function launch(userDataDir) {
    const args = [root, `--user-data-dir=${userDataDir}`];
    if (process.getuid && process.getuid() === 0) args.push('--no-sandbox'); // e.g. CI containers running as root
    const app = await electron.launch({ args, cwd: root });
    const win = await app.firstWindow();
    await win.waitForURL('app://vyapareasy/index.html');
    const errors = [];
    win.on('pageerror', e => errors.push(e.message));
    win.on('dialog', d => d.accept());
    return { app, win, errors };
}

test('desktop app saves data across restarts', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyapareasy-'));
    let { app, win, errors } = await launch(userDataDir);
    await expect(win.locator('.page-title')).toHaveText('Welcome to VyaparEasy');
    await win.getByRole('button', { name: '+ Create your company' }).click();
    await win.locator('#companyForm [name=name]').fill('Desktop Traders');
    await win.locator('#companyForm [name=stateCode]').selectOption('27');
    await win.locator('.modal-overlay.active .modal-footer .btn-primary').click();
    await expect(win.locator('#currentCompanyName')).toHaveText('Desktop Traders');
    // The bundled font loads from the app itself (no internet needed)
    expect(await win.evaluate(() => document.fonts.check('16px "Plus Jakarta Sans"'))).toBe(true);
    expect(errors).toEqual([]);
    await app.close();

    ({ app, win, errors } = await launch(userDataDir));
    await expect(win.locator('#currentCompanyName')).toHaveText('Desktop Traders');
    expect(errors).toEqual([]);
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
});
