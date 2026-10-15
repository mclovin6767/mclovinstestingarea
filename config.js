// Central runtime config for the desktop shell, read from env (set per-till via a shortcut, a
// .env, or the OS). Keeps main.js declarative.
const { app } = require('electron');

function flag(name) {
  const v = (process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

const config = {
  // Which deployment the shell loads.
  appUrl: process.env.QR_DINES_APP_URL || 'https://qr-dines-frontend.vercel.app',
  // Dev tools / dev menu.
  isDev: process.argv.includes('--dev') || !app.isPackaged,
  // Till lockdown (C4): fullscreen kiosk that resists accidental close.
  kiosk: flag('QR_DINES_KIOSK'),
  // Launch on Windows login (C4).
  autoStart: flag('QR_DINES_AUTOSTART'),
  // Auto-update (C3): on by default in a packaged build; never in dev.
  autoUpdate: !flag('QR_DINES_DISABLE_UPDATES'),
  // Crash reporting (no-op without a DSN).
  sentryDsn: process.env.QR_DINES_DESKTOP_SENTRY_DSN || process.env.SENTRY_DSN || ''
};

module.exports = { config };
