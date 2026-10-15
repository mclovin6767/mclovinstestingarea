// Auto-update (C3). Uses electron-updater against the GitHub Releases feed configured in
// package.json `build.publish`. A packaged till checks on launch + hourly, downloads in the
// background, and installs on next quit — so fixes reach every till without a manual reinstall.
// No-op in dev or when QR_DINES_DISABLE_UPDATES is set.
const { autoUpdater } = require('electron-updater');

function initAutoUpdates({ isDev, autoUpdate, logger = console } = {}) {
  if (isDev || !autoUpdate) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => logger.warn('[updater] error:', err && err.message));
  autoUpdater.on('update-available', (info) => logger.log('[updater] update available:', info && info.version));
  autoUpdater.on('update-downloaded', (info) =>
    logger.log('[updater] downloaded', info && info.version, '— installs on quit')
  );

  const check = () => autoUpdater.checkForUpdatesAndNotify().catch((e) => logger.warn('[updater] check failed:', e && e.message));
  check();
  // Re-check hourly; unref so it never keeps the process alive on its own.
  const timer = setInterval(check, 60 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = { initAutoUpdates };
