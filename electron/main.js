const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { checkSetup, setupPython } = require('./setup');

let mainWindow;
let setupWindow;
let serverProcess;
let tray = null;
let isQuitting = false;
const LOG_FILE = require("path").join(require("os").tmpdir(), "lexicona-debug.log");
function debug(m){try{require("fs").appendFileSync(LOG_FILE,new Date().toISOString()+" "+m+"\n")}catch(e){}}

const PREF_FILE = path.join(app.getPath('userData'), 'close-preference.json');
// Load icon from buffer (asar-safe)
let APP_ICON = null;
try {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  APP_ICON = nativeImage.createFromBuffer(fs.readFileSync(iconPath));
} catch (e) {
  APP_ICON = nativeImage.createEmpty();
}

function getPort() {
  return parseInt(process.env.LEXICONA_PORT || '5678');
}

function getClosePreference() {
  try { return JSON.parse(fs.readFileSync(PREF_FILE, 'utf8')); }
  catch { return null; }
}

function saveClosePreference(action) {
  fs.writeFileSync(PREF_FILE, JSON.stringify({ action }), 'utf8');
}

function createTray() {
  if (tray) return;
  const icon = APP_ICON;
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('辞谱 Lexicona');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开窗口', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

function startServer() {
  return new Promise((resolve) => {
    const port = getPort();
   if (!app.isPackaged) {
     resolve(port);
     return;
   }
   // Load the Express server directly in the main process
   // Electron's require() handles asar paths natively
   // Pass dist path via env var so server.cjs can find static files inside asar
   process.env.LEXICONA_DIST = path.join(__dirname, '..', 'dist');
   const serverPath = path.join(__dirname, '..', 'dist', 'server.cjs');
   process.env.PORT = String(port);
     process.env.NODE_ENV = "production";
   // Set project root for depth map and other resource paths
   if (app.isPackaged) {
     const exeDir = path.dirname(app.getPath('exe'));
     const projectRoot = path.resolve(exeDir, '..', '..');
     if (fs.existsSync(path.join(projectRoot, 'gpu_env'))) {
       process.env.LEXICONA_ROOT = projectRoot;
       console.log('[Server] Derived project root from exe path:', projectRoot);
     }
   }

    try {
      delete require.cache[require.resolve(serverPath)];
    } catch (e) {}
    require(serverPath);
    console.log('[Server] Started on port ' + port);debug('Server started on port ' + port);
    resolve(port);
  });
}

function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    title: '辞谱 Lexicona',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = app.isPackaged ? `http://localhost:${port}` : 'http://localhost:5176';debug('Loading URL: ' + url);
  mainWindow.loadURL(url);
  mainWindow.webContents.on("did-fail-load", (e, code, desc) => debug("Fail load: " + code + " " + desc));
  mainWindow.on("unresponsive", () => debug("Window unresponsive"));

  mainWindow.on('close', (event) => {
    if (isQuitting) return;

    const pref = getClosePreference();
    if (pref && pref.action === 'quit') {
      isQuitting = true;
      app.quit();
      return;
    }
    if (pref && pref.action === 'tray') {
      event.preventDefault();
      createTray();
      mainWindow.hide();
      return;
    }

    event.preventDefault();
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['关闭程序', '最小化到后台', '取消'],
      defaultId: 0, cancelId: 2,
      title: '辞谱 Lexicona',
      message: '关闭窗口时您希望执行什么操作？',
      detail: '您可以在以后通过任务栏图标重新打开窗口。此选项仅询问一次。\n如需重新设置，请删除配置文件：' + PREF_FILE,
    }).then(({ response }) => {
      if (response === 0) {
        saveClosePreference('quit');
        isQuitting = true;
        app.quit();
      } else if (response === 1) {
        saveClosePreference('tray');
        createTray();
        mainWindow.hide();
      }
    });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('before-quit', () => { isQuitting = true; });

// IPC
ipcMain.handle('check-setup', () => checkSetup());
ipcMain.handle('run-setup', async () => {
  try {
    await setupPython((p) => {
      if (setupWindow && !setupWindow.isDestroyed()) setupWindow.webContents.send('setup-progress', p);
    });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('start-app', async () => {
  const port = getPort();
  if (app.isPackaged) await startServer();
  createMainWindow(port);
  return { port };
});
ipcMain.handle('quit-app', () => { isQuitting = true; app.quit(); });

app.setAppUserModelId('com.lexicona.app');

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {debug('App started, isPackaged=' + app.isPackaged);
  const port = getPort();
  if (app.isPackaged) await startServer();
  createMainWindow(port);
});

app.on('before-quit', () => {
  // Server runs in-process, no need to kill
});
