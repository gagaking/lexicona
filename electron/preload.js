const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 取本地文件的真实路径（Electron 30+），用于"链接式"引用本地图片而不读进内存
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch (error) {
      return '';
    }
  },
  checkSetup: () => ipcRenderer.invoke('check-setup'),
  diagnoseEnvironment: () => ipcRenderer.invoke('diagnose-environment'),
  runSetup: () => ipcRenderer.invoke('run-setup'),
  startApp: () => ipcRenderer.invoke('start-app'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onSetupProgress: (callback) => {
    ipcRenderer.on('setup-progress', (_event, progress) => callback(progress));
  },
  onDiagnoseResult: (callback) => {
    ipcRenderer.on('diagnose-result', (_event, report) => callback(report));
  },
  // 下载完成通知（打包版默认静默保存到系统下载文件夹）
  onDownloadFinished: (callback) => {
    ipcRenderer.on('download-finished', (_event, payload) => callback(payload));
  },
});
