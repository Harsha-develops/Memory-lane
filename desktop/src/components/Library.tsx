import { CategoryReview } from './CategoryReview';
import { tr } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import type { ImportJob, Photo } from '../../shared/contracts';
import type { Trip } from '../../shared/catalog';
import { Icon } from './Icon';
import { PhotoViewer } from './PhotoViewer';
import { VirtualGallery } from './VirtualGallery';
const terminal = new Set(['added', 'duplicate', 'rejected', 'cancelled']);
const labels: Record<string, string> = {
  pending: 'Waiting',
  receiving: 'Copying',
  queued: 'Queued',
  working: 'Developing preview',
  added: 'Added',
  duplicate: 'Duplicate',
  rejected: 'Could not import',
  cancelled: 'Cancelled',
};
export function Library({
  ready,
  picking,
  onImport,
  initialTrip = '',
  initialTag = '',
}: {
  ready: boolean;
  picking: boolean;
  onImport: () => void;
  initialTrip?: string;
  initialTag?: string;
}) {
  const [tag, setTag] = useState(initialTag);
  const [categories, setCategories] = useState<{ label: string; count: number }[]>([]);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [trip, setTrip] = useState(initialTrip);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [current, setCurrent] = useState<{
    photo: Photo;
    index: number;
  } | null>(null);
  useEffect(() => {
    setTag(initialTag);
    setTrip(initialTrip);
  }, [initialTag, initialTrip]);
  const filter = useMemo(
    () => ({ trip: trip || null, start: start || null, end: end || null, search, tag }),
    [trip, start, end, search, tag],
  );
  useEffect(() => {
    setSelected(new Set());
  }, [filter]);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const [result, latest, list, labels] = await Promise.all([
          window.thingSorted.catalog('query', { ...filter, limit: 1 }),
          window.thingSorted.latestImport(),
          window.thingSorted.catalog('trips', {}),
          window.thingSorted.catalog('categories', {}),
        ]);
        if (live) {
          setTotal(result.total);
          setJob(latest);
          setTrips(list);
          setCategories(labels);
        }
      } catch {
        if (live) setError(tr('Your library could not be loaded. Check the local connection.'));
      }
      if (live) timer = setTimeout(() => void refresh(), 1500);
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ready, filter, refreshKey]);
  async function cancel() {
    if (job)
      try {
        setJob(await window.thingSorted.cancelImport(job.id));
      } catch {
        setError(tr('Cancellation could not be confirmed.'));
      }
  }
  async function retry() {
    if (job)
      try {
        setJob(await window.thingSorted.retryImport(job.id));
      } catch {
        setError('Select the original files again to retry.');
      }
  }
  async function move() {
    try {
      await window.thingSorted.catalog('move', { ids: [...selected], trip: destination || null });
      setSelected(new Set());
      setRefreshKey((key) => key + 1);
      setError(tr('Photos organized.'));
    } catch {
      setError(tr('The selected photos could not be moved.'));
    }
  }
  async function browse(index: number) {
    try {
      const result = await window.thingSorted.catalog('query', {
        ...filter,
        offset: index,
        limit: 1,
      });
      if (result.photos[0]) setCurrent({ photo: result.photos[0], index });
    } catch {
      setError(tr('This photo could not be opened.'));
    }
  }
  const finished = job?.items.filter((item) => terminal.has(item.state)).length ?? 0;
  return (
    <section className="library-page page-enter" aria-labelledby="library-title">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{tr('YOUR PRIVATE COLLECTION')}</div>
          <h1 id="library-title">{tr('Small moments. Beautifully kept.')}</h1>
          <p className="library-subtitle">
            {total.toLocaleString()} {total === 1 ? 'photo' : 'photos'}
            {tr('\u00B7 originals safely copied, memories close by.')}
          </p>
        </div>
        <button
          className="primary-button import-button"
          onClick={onImport}
          disabled={!ready || picking || Boolean(job?.active)}
        >
          <Icon name="image" />
          {picking ? tr('Choosing photos\u2026') : tr('Import photos')}
        </button>
      </div>
      {error && (
        <p className="inline-message" role="status">
          {error}
        </p>
      )}
      {job && (
        <section className="import-panel" aria-label={tr('Import progress')}>
          <div className="import-heading">
            <div className="import-symbol">
              <Icon name={job.active ? 'layers' : 'check'} />
            </div>
            <div>
              <h2>
                {job.active
                  ? tr('Making room for your memories.')
                  : job.cancelled
                    ? tr('Import cancelled.')
                    : tr('Your import is complete.')}
              </h2>
              <p>
                {finished} of {job.items.length} processed ·{' '}
                {job.items.filter((i) => i.state === 'added').length} added ·{' '}
                {job.items.filter((i) => i.state === 'duplicate').length} duplicates ·{' '}
                {job.items.filter((i) => i.state === 'rejected').length} rejected
              </p>
            </div>
            {job.active && (
              <button className="secondary-button" onClick={() => void cancel()}>
                {tr('Cancel import')}
              </button>
            )}
          </div>
          <progress value={finished} max={job.items.length} aria-label={tr('Photos processed')} />
          <details className="import-details">
            <summary>
              {tr('Per-file results')}{' '}
              <span>
                {tr('View details')}
                <Icon name="arrow" />
              </span>
            </summary>
            <ul>
              {job.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    {item.reason && <p>{item.reason}</p>}
                  </div>
                  <span className={`result-tag ${item.state}`}>
                    {tr(labels[item.state] ?? item.state)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          {!job.active && job.items.some((i) => i.retryable) && (
            <div className="retry-row">
              <p>
                {tr(
                  'Retry retained copies after freeing space. For damaged or interrupted source files, select the originals again.',
                )}
              </p>
              <button className="secondary-button" onClick={() => void retry()}>
                {tr('Retry retained copies')}
              </button>
            </div>
          )}
        </section>
      )}

      <div className="collection-filters">
        <label className="field-label">
          Category
          <select
            aria-label="Filter by category"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          {tr('Find a photo')}
          <input
            type="search"
            value={search}
            maxLength={100}
            placeholder={tr('Search filenames')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field-label">
          {tr('Trip')}
          <select
            value={trip}
            onChange={(e) => setTrip(e.target.value)}
            aria-label={tr('Filter by trip')}
          >
            <option value="">{tr('All photos')}</option>
            <option value="unassigned">{tr('Unassigned')}</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          {tr('From')}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field-label">
          {tr('To')}
          <input
            type="date"
            min={start || undefined}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <button
          className="text-button"
          onClick={() => {
            setTag('');
            setTrip('');
            setStart('');
            setEnd('');
            setSearch('');
          }}
        >
          {tr('Clear filters')}
        </button>
      </div>
      <button
        className="secondary-button"
        disabled={!total}
        onClick={() => {
          void window.thingSorted
            .catalog('query', { ...filter, limit: 20 })
            .then((result) => setReviewIds(result.photos.map((p) => p.id)))
            .catch(() => setError('Photos could not be loaded.'));
        }}
      >
        AI categorize this view (up to 20)
      </button>
      {reviewIds.length > 0 && (
        <CategoryReview
          ids={reviewIds}
          onClose={() => setReviewIds([])}
          onChanged={() => setRefreshKey((v) => v + 1)}
        />
      )}
      {selected.size > 0 && (
        <div className="selection-toolbar">
          <button
            className="secondary-button"
            disabled={selected.size > 20}
            onClick={() => setReviewIds([...selected])}
          >
            AI categorize selected (max 20)
          </button>
          <strong>
            {selected.size}
            {tr('selected')}
          </strong>
          <label className="field-label">
            {tr('Move to')}
            <select
              aria-label={tr('Move selected photos to')}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">{tr('Unassigned')}</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" onClick={() => void move()}>
            {tr('Move selected')}
          </button>
          <button className="secondary-button" onClick={() => setSelected(new Set())}>
            {tr('Clear selection')}
          </button>
        </div>
      )}
      {!total ? (
        <div className="library-empty">
          <div className="empty-orbit">
            <Icon name="image" />
          </div>
          <h2>
            {trip || start || end || search || tag
              ? tr('No memories match these filters.')
              : tr('Your next chapter starts here.')}
          </h2>
          <p>{tr('Import your favourites, or clear the filters to see more.')}</p>
          <button
            className="primary-button"
            onClick={onImport}
            disabled={!ready || picking || Boolean(job?.active)}
          >
            {tr('Choose photos')}
            <Icon name="arrow" />
          </button>
          <div className="format-list">
            JPG · PNG · WEBP · HEIC · TIFF · RAW · AVIF · BMP · still GIF
          </div>
          <p className="import-limits">
            {tr(
              'Up to 200 files \u00B7 256 MB per file \u00B7 2 GB per batch \u00B7 80 megapixels',
            )}
          </p>
        </div>
      ) : (
        <VirtualGallery
          total={total}
          filter={filter}
          refreshKey={refreshKey}
          selected={selected}
          onSelect={(id) =>
            setSelected((previous) => {
              const next = new Set(previous);
              if (next.has(id)) next.delete(id);
              else if (next.size < 500) next.add(id);
              return next;
            })
          }
          onOpen={(photo, index) => setCurrent({ photo, index })}
        />
      )}
      <PhotoViewer
        photo={current?.photo ?? null}
        onClose={() => setCurrent(null)}
        previous={current && current.index > 0 ? () => void browse(current.index - 1) : undefined}
        next={
          current && current.index + 1 < total ? () => void browse(current.index + 1) : undefined
        }
        onChanged={() => setRefreshKey((key) => key + 1)}
      />
    </section>
  );
}
