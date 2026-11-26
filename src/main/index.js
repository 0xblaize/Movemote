const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const qrcode = require('qrcode');
const input = require('./input');
const { createServer } = require('./server');

const PORT = 8787;
const TOKEN = crypto.randomBytes(8).toString('hex');

let win = null;
let tray = null;
let server = null;

function lanAddress() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name]) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

function controllerUrl() {
  return `http://${lanAddress()}:${PORT}/?token=${TOKEN}`;
}

function pushStatus() {
  if (!win) return;
  win.webContents.send('status', {
    url: controllerUrl(),
    clients: server ? server.clientCount : 0,
  });
}

function setTray(active) {
  if (!tray) return;
  tray.setToolTip(active ? 'Movemote — session ACTIVE' : 'Movemote — idle');
}

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: false,
    title: 'Movemote',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'host.html'));
  win.webContents.once('did-finish-load', async () => {
    const url = controllerUrl();
    const qr = await qrcode.toDataURL(url, { margin: 1, width: 240 });
    win.webContents.send('boot', { url, qr });
    pushStatus();
  });
}

function createTray() {
  // 1x1 transparent placeholder; drop a real icon at build time.
  const img = nativeImage.createEmpty();
  tray = new Tray(img);
  const menu = Menu.buildFromTemplate([
    { label: 'Movemote', enabled: false },
    { type: 'separator' },
    { label: 'Show window', click: () => win?.show() },
    { label: 'Stop all control', click: () => server?.setAllowControl(false) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  setTray(false);
}

app.whenReady().then(async () => {
  const size = screen.getPrimaryDisplay().size;
  input.setBounds(size.width, size.height);

  server = createServer({
    port: PORT,
    token: TOKEN,
    onEvent: (e) => {
      if (e.type === 'allow') setTray(e.allowControl);
      pushStatus();
      if (win) win.webContents.send('event', e);
    },
  });
  await server.listen();

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Host accepts/denies control from the window UI.
ipcMain.handle('allow-control', (_e, v) => {
  server?.setAllowControl(!!v);
  return true;
});

app.on('window-all-closed', () => {
  // Keep running in the tray; quit explicitly.
});
