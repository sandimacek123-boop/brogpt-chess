import { contextBridge, ipcRenderer } from 'electron';

// Narrow, validated bridge. The renderer (and especially user-written algorithm code, which runs
// in a separate Worker) never gets Node.js or Electron objects — only these four functions.
contextBridge.exposeInMainWorld('sortclaude', {
  isDesktop: true,
  saveFile: (name: string, data: Uint8Array) => ipcRenderer.invoke('sortclaude:save-file', String(name), data),
  chooseFolder: () => ipcRenderer.invoke('sortclaude:choose-folder'),
  saveFileTo: (folder: string, name: string, data: Uint8Array) => ipcRenderer.invoke('sortclaude:save-file-to', String(folder), String(name), data),
  info: () => ipcRenderer.invoke('sortclaude:info'),
});
