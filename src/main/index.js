const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const qrcode = require('qrcode');
const input = require('./input');
const config = require('./config');
const { createServer } = require('./server');
const { createRelayClient } = require('./relayClient');

// Public relay this host dials out to. Point this at YOUR deployed relay.
const RELAY_URL = process.env.MOVEMOTE_RELAY || 'ws://localhost:9000';

const LAN_PORT = 8787;
const LAN_TOKEN = crypto.randomBytes(8).toString('hex');

let win = null;
let tray = null;
let lanServer = null;
let relay = null;
let cfg = null;

function lanAddress() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name]) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return '127.0.0.1';
}

function lanUrl() {
  return `http://${lanAddress()}:${LAN_PORT}/?token=${LAN_TOKEN}`;
}

function sessionCount() {
  return (relay ? relay.count : 0) + (lanServer ? lanServer.clientCount : 0);
}

function pushStatus() {
  if (!win) return;
  win.webContents.send('status', { clients: sessionCount() });
  setTray(sessionCount() > 0);
}

function setTray(active) {
  if (tray) tray.setToolTip(active ? 'Movemote — session ACTIVE' : 'Movemote — idle');
}

function createWindow() {
  win = new BrowserWindow({
    width: 480, height: 720, resizable: false, title: 'Movemote',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'host.html'));
  win.webContents.once('did-finish-load', async () => {
    const url = lanUrl();
    const qr = await qrcode.toDataURL(url, { margin: 1, width: 200 });
    win.webContents.send('boot', {
      id: cfg.idPretty(),
      password: cfg.getPassword(),
      relay: RELAY_URL,
      lanUrl: url,
      lanQr: qr,
    });
    pushStatus();
  });
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Movemote', enabled: false },
    { type: 'separator' },
    { label: 'Show window', click: () => win?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  setTray(false);
}

app.whenReady().then(async () => {
  cfg = config.load(app.getPath('userData'));
  const size = screen.getPrimaryDisplay().size;
  input.setBounds(size.width, size.height);

  const onSession = (e) => { if (win) win.webContents.send('event', e); pushStatus(); };

  // Relay path: reachable from anywhere by ID + password.
  relay = createRelayClient({
    relayUrl: RELAY_URL,
    id: cfg.id,
    getPassword: cfg.getPassword,
    getScreen: () => ({ w: size.width, h: size.height }),
    onSession,
    onStatus: (s) => { if (win) win.webContents.send('relay', s); },
  });

  // LAN path (optional, same-network convenience): also serves a local page.
  lanServer = createServer({
    port: LAN_PORT, token: LAN_TOKEN,
    onEvent: (e) => { if (e.type === 'allow') setTray(e.allowControl); onSession(e); },
  });
  await lanServer.listen();
  lanServer.setAllowControl(true); // LAN page is gated by the token in its URL

  createWindow();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

ipcMain.handle('set-password', (_e, p) => { if (p && cfg) cfg.setPassword(p); return cfg ? cfg.getPassword() : ''; });

app.on('window-all-closed', () => { /* stay in tray; quit explicitly */ });
