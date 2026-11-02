import type { AiRequests, AiResponses } from './ai';
import type { ArchiveAction, ArchiveStatus, WatchAction, WatchStatus } from './maintenance';
import type { CatalogRequests, CatalogResponses } from './catalog';

export type BackendPhase = 'starting' | 'ready' | 'failed';
export interface AppStatus {
  phase: BackendPhase;
  appVersion: string;
  backendVersion: string | null;
  diagnosticCode: string | null;
}
export interface Photo {
  tags?: string[];
  personReference?: string;
  id: string;
  name: string;
  width: number;
  height: number;
  format: string;
  tripId?: string | null;
  capturedAt?: string;
  dateSource?: string;
}
export interface PhotoPage {
  total: number;
  photos: Photo[];
}
export interface ImportItem {
  id: string;
  name: string;
  size: number;
  state:
    | 'pending'
    | 'receiving'
    | 'queued'
    | 'working'
    | 'added'
    | 'duplicate'
    | 'rejected'
    | 'cancelled';
  reason: string;
  photoId: string | null;
  retryable: boolean;
}
export interface ImportJob {
  id: string;
  active: boolean;
  cancelled: boolean;
  items: ImportItem[];
}
export interface DesktopApi {
  ai: <K extends keyof AiRequests>(action: K, payload: AiRequests[K]) => Promise<AiResponses[K]>;
  archive: (action: ArchiveAction) => Promise<ArchiveStatus>;
  watch: (action: WatchAction) => Promise<WatchStatus>;
  catalog: <K extends keyof CatalogRequests>(
    action: K,
    payload: CatalogRequests[K],
  ) => Promise<CatalogResponses[K]>;
  status: () => Promise<AppStatus>;
  retry: () => Promise<AppStatus>;
  copyDiagnostics: () => Promise<void>;
  importPhotos: () => Promise<ImportJob | null>;
  photos: (page: number) => Promise<PhotoPage>;
  latestImport: () => Promise<ImportJob | null>;
  cancelImport: (id: string) => Promise<ImportJob>;
  retryImport: (id: string) => Promise<ImportJob>;
}
