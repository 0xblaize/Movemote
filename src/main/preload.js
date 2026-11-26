const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('movemote', {
  onBoot: (cb) => ipcRenderer.on('boot', (_e, d) => cb(d)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, d) => cb(d)),
  onEvent: (cb) => ipcRenderer.on('event', (_e, d) => cb(d)),
  allowControl: (v) => ipcRenderer.invoke('allow-control', v),
});
