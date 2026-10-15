// Hardened preload — the ONLY bridge between the hosted web app and the native side.
// Exposes a tiny, explicit API on window.qrDinesDesktop; nothing else (no Node, no raw ipcRenderer)
// leaks to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qrDinesDesktop', {
  isDesktop: true,
  platform: process.platform,

  // Printing (C2): route ESC/POS to the Windows spooler instead of WebUSB.
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printRaw: (printerName, base64) => ipcRenderer.invoke('print:raw', { printerName, base64 }),

  // Reload the hosted app — used by the offline screen's Retry button (C4).
  retryConnection: () => ipcRenderer.invoke('app:retry'),

  // OS-encrypted (DPAPI via safeStorage) key/value — for the auth token, so it isn't left in plain
  // localStorage on the till (C4). Returns null / { ok:false } where encryption is unavailable.
  secureStore: {
    set: (key, value) => ipcRenderer.invoke('secure:set', key, value),
    get: (key) => ipcRenderer.invoke('secure:get', key),
    remove: (key) => ipcRenderer.invoke('secure:remove', key)
  }
});
