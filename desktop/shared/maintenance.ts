export interface ArchiveStatus {
  state: 'idle' | 'running' | 'complete' | 'failed' | 'cancelled' | 'interrupted';
  kind: 'backup' | 'restore' | null;
  done: number;
  total: number;
  message: string;
}
export interface WatchStatus {
  enabled: boolean;
  folder: string | null;
  state: 'off' | 'waiting' | 'watching' | 'importing' | 'unavailable';
}
export type ArchiveAction = 'status' | 'backup' | 'restore' | 'resume' | 'cancel';
export type WatchAction = 'status' | 'choose' | 'disable';
