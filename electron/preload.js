const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkSetup: () => ipcRenderer.invoke('check-setup'),
  runSetup: () => ipcRenderer.invoke('run-setup'),
  startApp: () => ipcRenderer.invoke('start-app'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onSetupProgress: (callback) => {
    ipcRenderer.on('setup-progress', (_event, progress) => callback(progress));
  },
});