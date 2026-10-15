// Encrypted key/value store for the till (C4). Values are encrypted with the OS keychain
// (DPAPI on Windows) via Electron safeStorage and persisted to userData/secure-store.json, then
// exposed to the renderer — so the web app can keep its auth token in OS-encrypted storage instead
// of plain localStorage when running inside the shell. Falls back gracefully (returns null / ok:false)
// where OS encryption isn't available.
const { app, ipcMain, safeStorage } = require('electron');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');

let cache = null;

function storePath() {
  return path.join(app.getPath('userData'), 'secure-store.json');
}

function load() {
  if (cache) return cache;
  try {
    cache = existsSync(storePath()) ? JSON.parse(readFileSync(storePath(), 'utf8')) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  try {
    writeFileSync(storePath(), JSON.stringify(cache || {}), { mode: 0o600 });
  } catch {
    /* best-effort */
  }
}

function registerSecureStoreIpc() {
  ipcMain.handle('secure:set', (_event, key, value) => {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'OS encryption unavailable' };
    const data = load();
    data[String(key)] = safeStorage.encryptString(String(value)).toString('base64');
    persist();
    return { ok: true };
  });

  ipcMain.handle('secure:get', (_event, key) => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const enc = load()[String(key)];
    if (!enc) return null;
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('secure:remove', (_event, key) => {
    const data = load();
    delete data[String(key)];
    persist();
    return { ok: true };
  });
}

module.exports = { registerSecureStoreIpc };
