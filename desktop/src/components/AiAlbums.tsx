import { useEffect, useState } from 'react';
import type { CatalogResponses } from '../../shared/catalog';
export function AiAlbums({ onOpen }: { onOpen: (label: string) => void }) {
  const [albums, setAlbums] = useState<CatalogResponses['albums']>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void window.thingSorted
      .catalog('albums', {})
      .then((value) => {
        if (live) setAlbums(value);
      })
      .catch(() => {
        if (live) setError('AI albums could not be loaded.');
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="ai-albums" aria-label="AI albums">
      <h2>AI albums</h2>
      <p className="library-subtitle">
        Automatically organized by content, lighting, and the people you name.
      </p>
      {error && <p role="alert">{error}</p>}
      {!albums.length && !error && (
        <p>Choose photos and use AI categorize to create your albums.</p>
      )}
      <div className="ai-album-grid">
        {albums.map((album) => (
          <button
            key={album.label}
            className="ai-album"
            aria-label={`Open album ${album.title}`}
            onClick={() => onOpen(album.label)}
          >
            {album.coverPhotoId && (
              <img
                src={`thing://app/photos/${album.coverPhotoId}/thumbnail`}
                alt=""
                loading="lazy"
              />
            )}
            <strong>{album.title}</strong>
            <span>
              {album.count} {album.count === 1 ? 'photo' : 'photos'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
