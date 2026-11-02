import { installAi } from './ai';
import { FolderWatcher } from './watcher';
import { installMaintenance } from './maintenance';
import { readBounds, rememberBounds } from './windowState';
import { installCatalog } from './catalog';
import { installImports, photoResource } from './imports';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, session } from 'electron';
import { join, resolve } from 'node:path';
import { Backend } from './backend';
import { APP_URL, assertSender, secureSession, serveAsset } from './security';

app.setName('Memory Lane');
app.setAppUserModelId('com.thingsorted.desktop');
app.setPath(
  'userData',
  app.commandLine.hasSwitch('user-data-dir')
    ? resolve(app.commandLine.getSwitchValue('user-data-dir'))
    : !app.isPackaged && process.env.THING_TEST_DATA
      ? resolve(process.env.THING_TEST_DATA)
      : join(app.getPath('appData'), 'ThingSorted'),
);
protocol.registerSchemesAsPrivileged([
  { scheme: 'thing', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let window: BrowserWindow | null = null;
let backend: Backend | null = null;
let quitting = false;
let watcher: FolderWatcher | null = null;
let lastRetry = 0;
let ai: ReturnType<typeof installAi> | null = null;
const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    watcher?.stop();
    ai?.stop();
    void (backend?.stop() ?? Promise.resolve()).finally(() => app.quit());
  });

  void app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      secureSession(session.defaultSession);
      const desktopRoot = resolve(__dirname, '../..');
      backend = new Backend(
        resolve(desktopRoot, '..'),
        join(app.getPath('userData'), 'catalog'),
        app.isPackaged ? join(process.resourcesPath, 'backend', 'thing-backend.exe') : undefined,
      );
      protocol.handle(
        'thing',
        async (request) =>
          (await photoResource(request, backend!)) ??
          serveAsset(request, join(desktopRoot, 'dist')),
      );
      window = new BrowserWindow({
        title: 'Memory Lane',
        width: 1320,
        height: 900,
        ...readBounds(app.getPath('userData')),
        minWidth: 820,
        minHeight: 640,
        backgroundColor: '#171416',
        show: false,
        icon: join(desktopRoot, 'public', 'brand', 'logo.png'),
        webPreferences: {
          preload: join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          webviewTag: false,
          allowRunningInsecureContent: false,
          spellcheck: false,
        },
      });
      const importer = installImports(window, backend);
      watcher = new FolderWatcher(window, backend, app.getPath('userData'), importer);
      await watcher.start();
      installCatalog(window, backend);
      installMaintenance(window, backend);
      ai = installAi(window, app.getPath('userData'), backend);
      rememberBounds(window, app.getPath('userData'));
      const contents = window.webContents;
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      contents.on('will-navigate', (event) => event.preventDefault());
      contents.on('will-attach-webview', (event) => event.preventDefault());
      ipcMain.handle('thing:status', (event, ...args: unknown[]) => {
        assertSender(event, contents, args);
        return backend!.probe();
      });
      ipcMain.handle('thing:retry', async (event, ...args: unknown[]) => {
        assertSender(event, contents, args);
        if (backend!.status().phase !== 'failed' || Date.now() - lastRetry < 3000 || quitting) {
          return backend!.status();
        }
        lastRetry = Date.now();
        await backend!.start();
        return backend!.status();
      });
      ipcMain.handle('thing:copy-diagnostics', (event, ...args: unknown[]) => {
        assertSender(event, contents, args);
        clipboard.writeText(
          JSON.stringify(
            {
              app: 'Memory Lane',
              ...backend!.status(),
              electron: process.versions.electron,
              platform: process.platform,
              architecture: process.arch,
            },
            null,
            2,
          ),
        );
      });
      window.once('ready-to-show', () => window?.show());
      window.on('closed', () => {
        window = null;
      });
      void backend.start();
      await window.loadURL(APP_URL);
    })
    .catch(() => {
      dialog.showErrorBox(
        'Memory Lane could not open',
        'The application files could not be loaded. Reinstall Memory Lane from your saved installer, then try again. Your collection is kept separately.',
      );
      app.quit();
    });
}
