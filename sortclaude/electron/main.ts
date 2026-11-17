import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell, net } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_NAME = 'SortClaude 5.5';
const SCHEME = 'app';
const HOST = 'sortclaude';
const isDev = !!process.env.SORTCLAUDE_DEV_URL;

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.sortclaude.app');

// Privileged custom scheme: gives the bundled app a stable secure origin so module workers,
// fetch, WebCodecs and localStorage behave exactly like the website — no dev server required.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function distDir() {
  return path.join(__dirname, '..', 'dist');
}

// ------------------------------------------------------------------ window state
interface WinState { width: number; height: number; x?: number; y?: number; maximized?: boolean }
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
async function loadState(): Promise<WinState> {
  try {
    const s = JSON.parse(await fs.readFile(statePath(), 'utf8'));
    if (typeof s.width === 'number' && typeof s.height === 'number') return s;
  } catch {
    /* first run */
  }
  return { width: 1480, height: 920 };
}
async function saveState(win: BrowserWindow) {
  try {
    const b = win.getNormalBounds();
    await fs.writeFile(statePath(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ export folders the user granted
const grantedFolders = new Set<string>();
const MAX_FILE = 4 * 1024 * 1024 * 1024;

function safeName(name: string): string {
  const base = path.basename(String(name)).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180);
  return base || 'sortclaude-export';
}

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  const st = await loadState();
  const win = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: st.x,
    y: st.y,
    minWidth: 960,
    minHeight: 620,
    title: APP_NAME,
    backgroundColor: '#050509',
    show: false,
    icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  mainWindow = win;
  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => void saveState(win));
  win.on('closed', () => (mainWindow = null));

  // Navigation lockdown: the app never navigates away or opens new windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`) && !(isDev && url.startsWith(process.env.SORTCLAUDE_DEV_URL!))) e.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'));

  if (isDev) await win.loadURL(process.env.SORTCLAUDE_DEV_URL!);
  else await win.loadURL(`${SCHEME}://${HOST}/index.html`);
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: `Quit ${APP_NAME}` }],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen', accelerator: 'F11' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------ IPC (narrow API)
ipcMain.handle('sortclaude:save-file', async (e, name: unknown, data: unknown) => {
  if (!(data instanceof Uint8Array) || data.byteLength > MAX_FILE) throw new Error('Invalid data');
  const win = BrowserWindow.fromWebContents(e.sender);
  const ext = path.extname(safeName(String(name))).slice(1).toLowerCase();
  const filters = ext ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : undefined;
  const res = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath(ext === 'mp4' || ext === 'webm' ? 'videos' : 'documents'), safeName(String(name))), filters });
  if (res.canceled || !res.filePath) return { path: null };
  await fs.writeFile(res.filePath, data);
  return { path: res.filePath };
});

ipcMain.handle('sortclaude:choose-folder', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], defaultPath: app.getPath('videos') });
  if (res.canceled || !res.filePaths[0]) return null;
  grantedFolders.add(path.resolve(res.filePaths[0]));
  return res.filePaths[0];
});

ipcMain.handle('sortclaude:save-file-to', async (_e, folder: unknown, name: unknown, data: unknown) => {
  const dir = path.resolve(String(folder));
  if (!grantedFolders.has(dir)) throw new Error('Folder was not chosen by the user');
  if (!(data instanceof Uint8Array) || data.byteLength > MAX_FILE) throw new Error('Invalid data');
  let target = path.join(dir, safeName(String(name)));
  // never overwrite silently
  for (let i = 1; ; i++) {
    try {
      await fs.access(target);
      const p = path.parse(path.join(dir, safeName(String(name))));
      target = path.join(dir, `${p.name} (${i})${p.ext}`);
    } catch {
      break;
    }
  }
  await fs.writeFile(target, data);
  return { path: target };
});

ipcMain.handle('sortclaude:info', () => ({ version: app.getVersion(), platform: process.platform, electron: process.versions.electron, chrome: process.versions.chrome }));

// ------------------------------------------------------------------ lifecycle
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    protocol.handle(SCHEME, async (req) => {
      const url = new URL(req.url);
      if (url.host !== HOST) return new Response('Not found', { status: 404 });
      const root = distDir();
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root + path.sep) && file !== root) return new Response('Forbidden', { status: 403 });
      try {
        const res = await net.fetch(pathToFileURL(file).toString());
        const headers = new Headers(res.headers);
        headers.set('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(res.body, { status: res.status, headers });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    buildMenu();
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });
  app.on('window-all-closed', () => app.quit());
}
