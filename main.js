// QR Dines desktop shell (Electron). A thin, hardened native window over the hosted frontend —
// the app is a multi-tenant SSR SaaS, so there's nothing to bundle locally. The native side gives
// the till a real window (C1), a native ESC/POS print bridge (C2), and till hardening: encrypted
// token storage, kiosk/auto-start, auto-update, and an offline screen (C3/C4).
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');
const { config } = require('./config');
const { registerPrintingIpc } = require('./printing');
const { registerSecureStoreIpc } = require('./secure-store');
const { initAutoUpdates } = require('./updater');

// Optional crash reporting — no-op without a DSN (boot-safe, matches the backend/frontend pattern).
if (config.sentryDsn) {
  try {
    require('@sentry/electron/main').init({ dsn: config.sentryDsn, tracesSampleRate: 0 });
  } catch (error) {
    console.warn('[qr-dines-desktop] Sentry init skipped:', error && error.message);
  }
}

let APP_ORIGIN = '';
try {
  APP_ORIGIN = new URL(config.appUrl).origin;
} catch {
  APP_ORIGIN = '';
}

let mainWindow = null;
let retryTimer = null;

function isSameOrigin(target) {
  try {
    return new URL(target).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

/** Load the hosted app, cancelling any pending offline retry. */
function loadApp() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (mainWindow) void mainWindow.loadURL(config.appUrl);
}

/** Show the local offline screen and auto-retry the app shortly after. */
function showOffline() {
  if (!mainWindow) return;
  void mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    loadApp();
  }, 5000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0f14',
    show: false,
    title: 'QR Dines',
    // Till lockdown (C4): fullscreen kiosk that resists accidental exit.
    fullscreen: config.kiosk,
    kiosk: config.kiosk,
    autoHideMenuBar: config.kiosk,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webviewTag: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  loadApp();

  // A real main-frame network failure (offline, DNS, timeout) → show the offline screen + auto-retry.
  // Ignore user-aborted navigations (-3) and subresource failures.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      showOffline();
    }
  });

  // Keep in-app navigation on our origin; send external links to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isSameOrigin(url)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow the app origin and the local offline file; anything else opens externally.
    if (!isSameOrigin(url) && !url.startsWith('file://')) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(config.isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Single instance — a till must never run two copies fighting over the same printer/session.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Launch on Windows login when configured (packaged builds only — never register the dev binary).
    if (config.autoStart && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    buildMenu();
    registerPrintingIpc(() => mainWindow);
    registerSecureStoreIpc();
    ipcMain.handle('app:retry', () => loadApp());
    initAutoUpdates({ isDev: config.isDev, autoUpdate: config.autoUpdate });

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
