import { PhotoCategories } from './PhotoCategories';
import { tr } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { Photo } from '../../shared/contracts';
import type { PhotoDetail, Trip } from '../../shared/catalog';
import { Icon } from './Icon';
export function PhotoImage({
  photo,
  large = false,
  onSize,
}: {
  photo: Photo;
  large?: boolean;
  onSize?: (width: number, height: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return failed ? (
    <span className="preview-unavailable">{tr('Preview unavailable')}</span>
  ) : (
    <>
      {large && !loaded && (
        <span className="image-loading" role="status">
          Loading sharp preview…
        </span>
      )}
      <img
        src={`thing://app/photos/${photo.id}/${large ? (fallback ? 'preview' : 'display') : 'thumbnail'}`}
        alt={photo.name}
        loading={large ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={(event) => {
          setLoaded(true);
          onSize?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
        }}
        onError={() => {
          if (large && !fallback) setFallback(true);
          else setFailed(true);
        }}
      />
      {large && fallback && loaded && (
        <span className="image-quality-note">
          Standard preview only. Reconnect your original-photo library for full detail.
        </span>
      )}
    </>
  );
}
export function PhotoViewer({
  photo,
  onClose,
  previous,
  next,
  onChanged,
}: {
  photo: Photo | null;
  onClose: () => void;
  previous?: () => void;
  next?: () => void;
  onChanged?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | SVGElement | null>(null);
  const [detail, setDetail] = useState<PhotoDetail | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [trip, setTrip] = useState('');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!photo) {
      dialog.current?.close();
      if (opener.current?.isConnected) opener.current.focus();
      opener.current = null;
      return;
    }
    if (!dialog.current?.open) {
      const active = document.activeElement;
      opener.current =
        active instanceof HTMLElement || active instanceof SVGElement ? active : null;
      dialog.current?.showModal();
    }
    let live = true;
    setDetail(null);
    setError('');
    setZoom(false);
    setZoomScale(1);
    setImageSize({ width: 0, height: 0 });
    void Promise.all([
      window.thingSorted.catalog('detail', { id: photo.id }),
      window.thingSorted.catalog('trips', {}),
    ])
      .then(([data, allTrips]) => {
        if (live) {
          setDetail(data);
          setTrip(data.tripId ?? '');
          setTrips(allTrips);
        }
      })
      .catch(() => {
        if (live) setError(tr('Photo information could not be loaded.'));
      });
    return () => {
      live = false;
    };
  }, [photo]);
  async function move() {
    if (!photo) return;
    try {
      await window.thingSorted.catalog('move', { ids: [photo.id], trip: trip || null });
      setError(tr('Collection updated.'));
      onChanged?.();
    } catch {
      setError(tr('The photo could not be assigned. Please try again.'));
    }
  }
  async function cover() {
    if (!photo || !trip) return;
    try {
      await window.thingSorted.catalog('cover', { id: trip, photo: photo.id });
      setError(tr('Collection cover updated.'));
      onChanged?.();
    } catch {
      setError('Save this photo to the trip first, then set it as the cover.');
    }
  }
  return (
    <dialog
      ref={dialog}
      className="photo-dialog detailed-viewer"
      aria-label={photo ? `Preview of ${photo.name}` : tr('Photo preview')}
      onCancel={onClose}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).matches('input,select,textarea')) return;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          previous?.();
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          next?.();
        }
      }}
    >
      {photo && (
        <>
          <div className="preview-heading">
            <div>
              <strong>{photo.name}</strong>
              <small>
                {photo.format} · {photo.width.toLocaleString()} × {photo.height.toLocaleString()}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={tr('Close photo preview')}
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="viewer-zoom-controls" role="group" aria-label="Photo zoom">
            <button
              className="secondary-button"
              aria-pressed={!zoom}
              onClick={() => setZoom(false)}
            >
              Fit To Window
            </button>
            <button
              className="secondary-button"
              aria-pressed={zoom && zoomScale === 1}
              disabled={!imageSize.width}
              onClick={() => {
                setZoom(true);
                setZoomScale(1);
              }}
            >
              100% Detail
            </button>
            <button
              className="secondary-button"
              aria-pressed={zoom && zoomScale === 2}
              disabled={!imageSize.width}
              onClick={() => {
                setZoom(true);
                setZoomScale(2);
              }}
            >
              200% Zoom
            </button>
          </div>
          <div className="viewer-columns">
            <div className={`large-photo ${zoom ? 'zoomed' : ''}`}>
              <div
                className="zoom-image"
                style={
                  zoom && imageSize.width
                    ? {
                        width: (imageSize.width * zoomScale) / window.devicePixelRatio,
                        height: (imageSize.height * zoomScale) / window.devicePixelRatio,
                      }
                    : undefined
                }
              >
                <PhotoImage
                  key={photo.id}
                  photo={photo}
                  large
                  onSize={(width, height) => setImageSize({ width, height })}
                />
              </div>
            </div>
            <aside className="photo-information">
              <div className="eyebrow">{tr('The Details')}</div>
              <h3>{tr('A moment, remembered.')}</h3>
              <PhotoCategories key={photo.id} id={photo.id} onChanged={() => onChanged?.()} />
              <dl>
                <dt>{tr('Capture date')}</dt>
                <dd>{detail?.capturedAt?.replace('T', ' ').slice(0, 19) ?? tr('Loading\u2026')}</dd>
                <dt>{tr('Date source')}</dt>
                <dd>
                  {detail?.dateSource === 'exif'
                    ? tr('Camera EXIF metadata')
                    : detail?.dateSource === 'file_modified'
                      ? tr('Source file modified time')
                      : tr('Import time (fallback)')}
                </dd>
                <dt>{tr('Location')}</dt>
                <dd>
                  {detail?.locationHidden
                    ? tr('Hidden in Preferences')
                    : detail?.latitude != null
                      ? `${detail.latitude.toFixed(5)}, ${detail.longitude!.toFixed(5)} (EXIF)`
                      : tr('No stored coordinates')}
                </dd>
              </dl>
              <label className="field-label">
                {tr('Trip or album')}
                <select
                  aria-label={tr('Photo collection')}
                  value={trip}
                  onChange={(e) => setTrip(e.target.value)}
                >
                  <option value="">{tr('Unassigned')}</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.kind === 'album' ? 'Album' : 'Trip'})
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button" onClick={() => void move()}>
                {tr('Save collection')}
              </button>
              <button className="secondary-button" disabled={!trip} onClick={() => void cover()}>
                {tr('Use as collection cover')}
              </button>
              <p className="viewer-note">
                {tr(
                  'Dates and locations come from recorded metadata. Your original file stays unchanged.',
                )}
              </p>
              {error && (
                <p role="status" className="inline-message">
                  {error}
                </p>
              )}
            </aside>
          </div>
          <div className="preview-navigation">
            <button className="secondary-button" disabled={!previous} onClick={previous}>
              {tr('Previous')}
            </button>
            <span>
              {tr(
                '\u2190 \u2192 to browse \u00B7 use zoom controls for detail \u00B7 Esc to close',
              )}
            </span>
            <button className="secondary-button" disabled={!next} onClick={next}>
              {tr('Next')}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
