import type { Photo, PhotoPage } from './contracts';

export interface PhotoFilter {
  offset?: number;
  limit?: number;
  trip?: string | null;
  start?: string | null;
  end?: string | null;
  search?: string;
  tag?: string;
}
export interface Trip {
  kind: 'trip' | 'album';
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  count: number;
  coverPhotoId: string | null;
}
export interface TripInput {
  kind?: 'trip' | 'album';
  id?: string | null;
  title: string;
  start?: string | null;
  end?: string | null;
}
export interface PhotoDetail extends Photo {
  importedAt: string;
  latitude: number | null;
  longitude: number | null;
  locationHidden: boolean;
}
export interface Privacy {
  showGps: boolean;
  storeGps: boolean;
}
export interface OrbitData {
  total: number;
  rings: { label: string; count: number; photos: Photo[] }[];
}
export interface SimilarData {
  state: 'idle' | 'running' | 'complete' | 'interrupted' | 'failed';
  processed: number;
  total: number;
  pairs: { id: string; first: Photo; second: Photo; distance: number }[];
}
export interface CatalogRequests {
  albums: Record<string, never>;
  personNames: Record<string, never>;
  renamePerson: { label: string; name: string };
  saveTags: { id: string; tags: string[] };
  categories: Record<string, never>;
  people: Record<string, never>;
  newPerson: { id: string };
  removePerson: { id: string };
  query: PhotoFilter;
  detail: { id: string };
  trips: Record<string, never>;
  saveTrip: TripInput;
  deleteTrip: { id: string };
  move: { ids: string[]; trip: string | null };
  cover: { id: string; photo: string };
  groupDates: Record<string, never>;
  orbit: { grouping: 'trip' | 'month' };
  privacy: Record<string, never>;
  setPrivacy: Privacy;
  forgetLocations: Record<string, never>;
  similar: Record<string, never>;
  scanSimilar: Record<string, never>;
  reviewSimilar: { id: string; decision: 'keep' | 'similar' };
}
export interface CatalogResponses {
  albums: { label: string; title: string; count: number; coverPhotoId: string | null }[];
  personNames: Record<string, string>;
  renamePerson: { ok: boolean };
  saveTags: { ok: boolean };
  categories: { label: string; count: number }[];
  people: { id: string; label: string }[];
  newPerson: { label: string };
  removePerson: { ok: boolean };
  query: PhotoPage;
  detail: PhotoDetail;
  trips: Trip[];
  saveTrip: Trip;
  deleteTrip: { ok: boolean };
  move: { ok: boolean };
  cover: { ok: boolean };
  groupDates: { created: number };
  orbit: OrbitData;
  privacy: Privacy;
  setPrivacy: Privacy;
  forgetLocations: Privacy;
  similar: SimilarData;
  scanSimilar: SimilarData;
  reviewSimilar: { ok: boolean };
}
