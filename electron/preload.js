// The only bridge between the page and the desktop app: make an invoice PDF and save it.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vyaparDesktop', {
    // { html, pageSize } → PDF bytes (Uint8Array)
    renderPdf: request => ipcRenderer.invoke('invoice:render-pdf', { html: request.html, pageSize: request.pageSize }),
    // { bytes, fileName } → { saved, fileName } after a Save dialog
    savePdf: request => ipcRenderer.invoke('invoice:save-pdf', { bytes: request.bytes, fileName: request.fileName })
});
