import type { AiRequests } from '../shared/ai';
import { contextBridge, ipcRenderer } from 'electron';
import type { ArchiveAction, WatchAction } from '../shared/maintenance';
import type { DesktopApi } from '../shared/contracts';

import type { CatalogRequests } from '../shared/catalog';
const api: DesktopApi = Object.freeze({
  ai: <K extends keyof AiRequests>(action: K, payload: AiRequests[K]) =>
    ipcRenderer.invoke('thing:ai', action, payload),
  archive: (action: ArchiveAction) => ipcRenderer.invoke('thing:archive', action),
  watch: (action: WatchAction) => ipcRenderer.invoke('thing:watch', action),
  catalog: <K extends keyof CatalogRequests>(action: K, payload: CatalogRequests[K]) =>
    ipcRenderer.invoke('thing:catalog', action, payload),
  status: () => ipcRenderer.invoke('thing:status'),
  retry: () => ipcRenderer.invoke('thing:retry'),
  copyDiagnostics: () => ipcRenderer.invoke('thing:copy-diagnostics'),
  importPhotos: () => ipcRenderer.invoke('thing:import-photos'),
  photos: (page: number) => ipcRenderer.invoke('thing:photos', page),
  latestImport: () => ipcRenderer.invoke('thing:latest-import'),
  cancelImport: (id: string) => ipcRenderer.invoke('thing:cancel-import', id),
  retryImport: (id: string) => ipcRenderer.invoke('thing:retry-import', id),
});
contextBridge.exposeInMainWorld('thingSorted', api);
