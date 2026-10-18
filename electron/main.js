// Desktop app: wraps app/index.html in a window. All data stays in the app's local storage (IndexedDB).
const { app, BrowserWindow, shell, protocol, net, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { renderInvoicePdf, checkPdfBytes, safeFileName } = require('./pdf');

const APP_DIR = path.join(__dirname, '..', 'app');
const ORIGIN = 'app://vyapareasy/';

// Serve the app from app://vyapareasy/ so its data has a fixed origin, wherever the app is installed
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// One window only: two copies would compete for the same database
if (!app.requestSingleInstanceLock()) app.quit();

const isWeb = url => /^https?:\/\//i.test(url);

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 360,
        minHeight: 500,
        title: 'VyaparEasy',
        backgroundColor: '#020617',
        icon: path.join(APP_DIR, 'icons', 'icon-512.png'),
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') }
    });
    // Links such as WhatsApp share open in the normal browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isWeb(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith(ORIGIN)) return;
        event.preventDefault();
        if (isWeb(url)) shell.openExternal(url);
    });
    win.loadURL(ORIGIN + 'index.html');
}

// Invoice PDFs (see pdf.js). Only the app's own page may ask.
const fromApp = event => event.senderFrame && event.senderFrame.url.startsWith(ORIGIN);
ipcMain.handle('invoice:render-pdf', async (event, request) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return renderInvoicePdf(request || {});
});
ipcMain.handle('invoice:save-pdf', async (event, request) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    const pdf = checkPdfBytes(request && request.bytes);
    const fileName = safeFileName(request && request.fileName);
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('documents'), fileName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { saved: false };
    await fs.promises.writeFile(filePath, pdf);
    return { saved: true, fileName: path.basename(filePath) };
});

app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

app.whenReady().then(() => {
    protocol.handle('app', request => {
        const { pathname } = new URL(request.url);
        const file = path.normalize(path.join(APP_DIR, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
        if (!file.startsWith(APP_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
        return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
