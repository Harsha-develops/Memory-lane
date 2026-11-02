import { MemoryText } from './MemoryText';
import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import type { OrbitData } from '../../shared/catalog';
import type { Photo } from '../../shared/contracts';
import { PhotoViewer } from './PhotoViewer';
export function Orbit({ onGallery }: { onGallery: () => void }) {
  const [grouping, setGrouping] = useState<'trip' | 'month'>('trip');
  const [data, setData] = useState<OrbitData>({ total: 0, rings: [] });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [hover, setHover] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void window.thingSorted
      .catalog('orbit', { grouping })
      .then((result) => {
        if (live) {
          setData(result);
          setError('');
        }
      })
      .catch(() => {
        if (live) setError(tr('Your orbit could not be loaded. Reopen this view to retry.'));
      });
    return () => {
      live = false;
    };
  }, [grouping]);
  const all = data.rings.flatMap((ring) => ring.photos);
  const index = all.findIndex((item) => item.id === photo?.id);
  return (
    <section className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{tr('A Universe Of Little Moments')}</div>
          <h1>{tr('Everything comes full circle.')}</h1>
          <p className="library-subtitle">
            <MemoryText>{tr('Follow a memory. See where it takes you.')}</MemoryText>
          </p>
        </div>
        <label className="field-label">
          {tr('Arrange by')}
          <select
            value={grouping}
            onChange={(event) => setGrouping(event.target.value as 'trip' | 'month')}
          >
            <option value="trip">{tr('Trips')}</option>
            <option value="month">{tr('Months')}</option>
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="memory-universe">
        <svg
          className="memory-orbit"
          viewBox="0 0 900 760"
          role="group"
          aria-label={tr('Interactive photo orbit')}
        >
          <defs>
            <radialGradient id="orbit-glow">
              <stop offset="0" stopColor="#9c3857" stopOpacity=".42" />
              <stop offset="1" stopColor="#9c3857" stopOpacity="0" />
            </radialGradient>
            <clipPath id="orbit-round">
              <rect width="50" height="50" rx="14" />
            </clipPath>
            <clipPath id="orbit-round-small">
              <rect width="32" height="32" rx="9" />
            </clipPath>
          </defs>
          <circle cx="450" cy="380" r="365" fill="url(#orbit-glow)" />
          {[105, 178, 251, 324].map((radius) => (
            <circle key={radius} cx="450" cy="380" r={radius} className="memory-ring" />
          ))}
          <circle cx="450" cy="380" r="57" className="memory-core" />
          <text x="450" y="376" textAnchor="middle" className="orbit-count">
            {data.total.toLocaleString()}
          </text>
          <text x="450" y="399" textAnchor="middle" className="orbit-caption">
            {tr('Memories')}
          </text>
          {data.rings.map((ring, ringIndex) =>
            ring.photos.map((item, itemIndex) => {
              const angle =
                (itemIndex / ring.photos.length) * Math.PI * 2 - Math.PI / 2 + ringIndex * 0.35;
              const radius = 105 + ringIndex * 73;
              const size = ringIndex === 0 && ring.photos.length > 12 ? 32 : 50;
              const x = 450 + Math.cos(angle) * radius - size / 2;
              const y = 380 + Math.sin(angle) * radius - size / 2;
              return (
                <g key={item.id} transform={`translate(${x} ${y})`}>
                  <g
                    className="orbit-photo"
                    role="button"
                    tabIndex={0}
                    aria-label={`Preview ${item.name}, ${ring.label}`}
                    onClick={() => setPhoto(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPhoto(item);
                      }
                    }}
                    onMouseEnter={() => setHover(`${ring.label} · ${item.name}`)}
                    onFocus={() => setHover(`${ring.label} · ${item.name}`)}
                  >
                    <rect
                      x="-2"
                      y="-2"
                      width={size + 4}
                      height={size + 4}
                      rx={size === 32 ? 11 : 16}
                    />
                    <image
                      href={`thing://app/photos/${item.id}/thumbnail`}
                      width={size}
                      height={size}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={size === 32 ? 'url(#orbit-round-small)' : 'url(#orbit-round)'}
                    />
                    <title>{item.name}</title>
                  </g>
                </g>
              );
            }),
          )}
        </svg>
        <div className="orbit-legend">
          <div className="eyebrow">{tr('Your Constellations')}</div>
          {data.rings.map((ring, index) => (
            <div className="legend-row" key={ring.label}>
              <span className="legend-number">0{index + 1}</span>
              <div>
                <strong>{ring.label}</strong>
                <small>
                  {ring.count.toLocaleString()} photos · {ring.photos.length} on this ring
                </small>
              </div>
            </div>
          ))}
          {!data.total && <p>{tr('Import your first photos to bring this universe to life.')}</p>}
          <p className="orbit-description">
            {tr(
              'The latest four groups, with up to 18 moments per ring. Your whole collection is always in All photos.',
            )}
          </p>
          <button className="primary-button" onClick={onGallery}>
            {tr('Explore all photos')}
          </button>
          <p className="orbit-hover" aria-live="polite">
            {hover || tr('Hover or tab to a photo. Enter to open.')}
          </p>
        </div>
      </div>
      <PhotoViewer
        photo={photo}
        onClose={() => setPhoto(null)}
        previous={index > 0 ? () => setPhoto(all[index - 1]!) : undefined}
        next={index >= 0 && index < all.length - 1 ? () => setPhoto(all[index + 1]!) : undefined}
      />
    </section>
  );
}
