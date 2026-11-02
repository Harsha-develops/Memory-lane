import { tr } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Photo } from '../../shared/contracts';
import type { PhotoFilter } from '../../shared/catalog';
import { PhotoImage } from './PhotoViewer';
export function VirtualGallery({
  total,
  filter,
  refreshKey,
  selected,
  onSelect,
  onOpen,
}: {
  total: number;
  filter: PhotoFilter;
  refreshKey: number;
  selected: Set<string>;
  onSelect: (id: string) => void;
  onOpen: (photo: Photo, index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [scroll, setScroll] = useState(0);
  const [pages, setPages] = useState<Map<number, Photo[]>>(new Map());
  const [error, setError] = useState('');
  const filterKey = JSON.stringify(filter);
  const query = useMemo(() => JSON.parse(filterKey) as PhotoFilter, [filterKey]);
  const columns = width >= 1000 ? 5 : width >= 760 ? 4 : width >= 560 ? 3 : 2;
  const rowHeight = ((width - (columns - 1) * 18) / columns - 2) / 1.16 + 64 + 2 + 18;
  const firstRow = Math.max(0, Math.floor(scroll / rowHeight) - 2);
  const endRow = Math.min(Math.ceil(total / columns), Math.ceil((scroll + 620) / rowHeight) + 2);
  const start = firstRow * columns;
  const end = Math.min(total, endRow * columns);
  const firstPage = Math.floor(start / 96);
  const lastPage = Math.floor(Math.max(start, end - 1) / 96);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPages(new Map());
    setScroll(0);
    scroller.current?.scrollTo(0, 0);
  }, [filterKey, refreshKey]);
  useEffect(() => {
    let live = true;
    const needed = Array.from(
      { length: lastPage - firstPage + 1 },
      (_, index) => firstPage + index,
    );
    void Promise.all(
      needed.map(async (page) => ({
        page,
        result: await window.thingSorted.catalog('query', {
          ...query,
          offset: page * 96,
          limit: 96,
        }),
      })),
    )
      .then((results) => {
        if (!live) return;
        setPages((previous) => {
          const updated = new Map(previous);
          for (const { page, result } of results) updated.set(page, result.photos);
          while (updated.size > 12) updated.delete(updated.keys().next().value!);
          return updated;
        });
        setError('');
      })
      .catch(() => {
        if (live)
          setError(
            tr(
              'These photos could not be loaded. Try changing the filter or reopening All photos.',
            ),
          );
      });
    return () => {
      live = false;
    };
  }, [firstPage, lastPage, query, refreshKey, total]);
  const cells = [];
  for (let index = start; index < end; index++) {
    const photo = pages.get(Math.floor(index / 96))?.[index % 96];
    cells.push(
      photo ? (
        <article
          className={`photo-card ${selected.has(photo.id) ? 'photo-selected' : ''}`}
          key={photo.id}
        >
          <button
            className="photo-card-open"
            onClick={() => onOpen(photo, index)}
            aria-label={`Preview ${photo.name}`}
          >
            <div className="photo-image">
              <PhotoImage photo={photo} />
              <span className="photo-format">{photo.format}</span>
            </div>
            <div className="photo-caption">
              <strong>{photo.name}</strong>
              <span>{photo.capturedAt?.slice(0, 10) ?? tr('Date unavailable')}</span>
            </div>
          </button>
          <label className="photo-select">
            <input
              type="checkbox"
              checked={selected.has(photo.id)}
              onChange={() => onSelect(photo.id)}
              aria-label={`Select ${photo.name}`}
            />
            <span className="sr-only">{tr('Select photo')}</span>
          </label>
        </article>
      ) : (
        <div className="photo-card skeleton-card" key={`loading-${index}`} aria-hidden="true">
          <div className="photo-image" />
          <div className="photo-caption">{tr('Loading\u2026')}</div>
        </div>
      ),
    );
  }
  return (
    <>
      <p className="gallery-hint">
        {tr(
          'Scroll to explore \u00B7 select photos to organize them \u00B7 Page Up / Page Down also work',
        )}
      </p>
      {error && (
        <p role="alert" className="inline-message">
          {error}
        </p>
      )}
      <div
        ref={scroller}
        className="virtual-scroller"
        tabIndex={0}
        role="region"
        aria-label={tr('Scrollable photo gallery')}
        onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
      >
        <svg
          className="gallery-spacer"
          width="1"
          height={firstRow * rowHeight}
          aria-hidden="true"
        />
        <div className={`virtual-grid columns-${columns}`}>{cells}</div>
        <svg
          className="gallery-spacer"
          width="1"
          height={Math.max(0, (Math.ceil(total / columns) - endRow) * rowHeight)}
          aria-hidden="true"
        />
      </div>
    </>
  );
}
