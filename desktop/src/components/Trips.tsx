import { MemoryText } from './MemoryText';
import { AiAlbums } from './AiAlbums';
import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import type { Trip } from '../../shared/catalog';
import { Icon } from './Icon';
export function Trips({
  onOpen,
  onOpenAlbum,
}: {
  onOpen: (id: string) => void;
  onOpenAlbum: (label: string) => void;
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'trip' | 'album'>('trip');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setTrips(await window.thingSorted.catalog('trips', {}));
  }
  useEffect(() => {
    void refresh().catch(() => setMessage(tr('Trips could not be loaded.')));
  }, []);
  function edit(trip?: Trip) {
    setEditing(trip?.id ?? null);
    setTitle(trip?.title ?? '');
    setKind(trip?.kind ?? 'trip');
    setStart(trip?.startDate ?? '');
    setEnd(trip?.endDate ?? '');
    document.getElementById('trip-name')?.focus();
  }
  async function action(run: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      await run();
      await refresh();
      setMessage(success);
    } catch {
      setMessage(
        tr('The action was cancelled or could not be completed. Check the dates and try again.'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-enter collections-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{tr('Chapters Of Your Life')}</div>
          <h1>{tr('Places. People. Little adventures.')}</h1>
          <p className="library-subtitle">
            <MemoryText>{tr('Give your memories a place to belong.')}</MemoryText>
          </p>
        </div>
      </div>
      <AiAlbums onOpen={onOpenAlbum} />
      <form
        className="trip-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void action(
            async () => {
              await window.thingSorted.catalog('saveTrip', {
                id: editing,
                title,
                kind,
                start: kind === 'trip' ? start || null : null,
                end: kind === 'trip' ? end || null : null,
              });
              edit();
            },
            kind === 'album' ? 'Album saved.' : tr('Trip saved.'),
          );
        }}
      >
        <label className="field-label">
          Collection type
          <select
            aria-label="Collection type"
            value={kind}
            onChange={(event) => setKind(event.target.value as 'trip' | 'album')}
          >
            <option value="trip">Trip</option>
            <option value="album">Album</option>
          </select>
        </label>
        <label className="field-label">
          {kind === 'album'
            ? editing
              ? 'Edit album name'
              : 'New album name'
            : editing
              ? tr('Edit trip name')
              : tr('New trip name')}
          <input
            id="trip-name"
            required
            maxLength={120}
            value={title}
            placeholder="A weekend worth remembering"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {kind === 'trip' && (
          <>
            <label className="field-label">
              {tr('Start date')}
              <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="field-label">
              {tr('End date')}
              <input
                type="date"
                min={start || undefined}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </>
        )}
        <button className="primary-button" disabled={busy}>
          {editing ? tr('Save changes') : kind === 'album' ? 'Create album' : tr('Create trip')}
        </button>
        {editing && (
          <button type="button" className="secondary-button" onClick={() => edit()}>
            {tr('Cancel edit')}
          </button>
        )}
      </form>
      <div className="gallery-toolbar">
        <span>{trips.length} chapters in your collection</span>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            void action(
              () => window.thingSorted.catalog('groupDates', {}),
              tr('Unassigned photos grouped by recorded day.'),
            )
          }
        >
          {tr('Group unassigned by date')}
        </button>
      </div>
      {message && (
        <p className="inline-message" role="status">
          {message}
        </p>
      )}
      {trips.length === 0 && (
        <div className="library-empty">
          <Icon name="folder" />
          <h2>
            <MemoryText>{tr('Make a little room for a big memory.')}</MemoryText>
          </h2>
          <p>{tr('Create a trip or album above, then select photos in All photos to add them.')}</p>
        </div>
      )}
      <div className="trip-grid">
        {trips.map((trip) => (
          <article className="trip-card" key={trip.id}>
            <button
              className="trip-open"
              onClick={() => onOpen(trip.id)}
              aria-label={`Open ${trip.title}`}
            >
              <div className="trip-cover">
                {trip.coverPhotoId ? (
                  <img
                    src={`thing://app/photos/${trip.coverPhotoId}/thumbnail`}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <Icon name="folder" />
                )}
                <span>
                  {trip.count} {trip.count === 1 ? 'photo' : 'photos'}
                </span>
              </div>
              <span className="collection-kind">{trip.kind === 'album' ? 'Album' : 'Trip'}</span>
              <h2>{trip.title}</h2>
              <p>
                {trip.kind === 'album'
                  ? 'A collection of your moments'
                  : (trip.startDate ?? tr('Your dates, your story'))}
                {trip.endDate && trip.endDate !== trip.startDate ? ` — ${trip.endDate}` : ''}
              </p>
            </button>
            <div className="trip-actions">
              <button className="secondary-button" onClick={() => edit(trip)}>
                {trip.kind === 'album' ? 'Edit album' : tr('Edit trip')}
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void action(
                    () => window.thingSorted.catalog('deleteTrip', { id: trip.id }),
                    tr('Collection removed. All photos are still in your library.'),
                  )
                }
              >
                {trip.kind === 'album' ? 'Remove album' : tr('Remove trip')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
