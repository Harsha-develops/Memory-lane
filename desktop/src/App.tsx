import { LoadingSkeleton } from './components/LoadingSkeleton';
import { AmbientEffects } from './components/AmbientEffects';
import { MemoryText } from './components/MemoryText';
import { AiPanel } from './components/AiPanel';
import { tr } from './i18n';
import { flushSync } from 'react-dom';
import { Trips } from './components/Trips';
import { Orbit } from './components/Orbit';
import { Similar } from './components/Similar';
import { Library } from './components/Library';
import { useEffect, useState } from 'react';
import type { AppStatus } from '../shared/contracts';
import { Icon } from './components/Icon';
import { OrbitArt } from './components/OrbitArt';
import { Preferences, type PreferencesValue } from './components/Preferences';
import { Roadmap } from './components/Roadmap';
function readPreferences(): PreferencesValue {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('thing-preferences') ?? 'null');
    if (
      saved &&
      typeof saved === 'object' &&
      'theme' in saved &&
      'motion' in saved &&
      (saved.theme === 'dark' || saved.theme === 'light') &&
      typeof saved.motion === 'boolean'
    ) {
      return {
        theme: saved.theme,
        motion: saved.motion,
        menuPosition: 'menuPosition' in saved && saved.menuPosition === 'left' ? 'left' : 'top',
      };
    }
  } catch {
    /* Invalid or inaccessible preferences fall back to safe, visible defaults. */
  }
  return { theme: 'dark', motion: true, menuPosition: 'top' };
}
export function App() {
  const [view, setView] = useState<'home' | 'roadmap' | 'library' | 'trips' | 'orbit' | 'similar'>(
    () => {
      try {
        const saved = localStorage.getItem('thing-last-view');
        if (
          saved === 'roadmap' ||
          saved === 'library' ||
          saved === 'trips' ||
          saved === 'orbit' ||
          saved === 'similar'
        )
          return saved;
      } catch {
        /* Default to the overview if preferences are inaccessible. */
      }
      return 'home';
    },
  );
  const [status, setStatus] = useState<AppStatus>({
    phase: 'starting',
    appVersion: '1.0.1',
    backendVersion: null,
    diagnosticCode: null,
  });
  const [preferences, setPreferences] = useState(readPreferences);
  const [menuCollapsed, setMenuCollapsed] = useState(() => {
    try {
      return localStorage.getItem('memory-menu-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [picking, setPicking] = useState(false);
  const [initialTag, setInitialTag] = useState('');
  const [initialTrip, setInitialTrip] = useState('');
  function transition(update: () => void) {
    if (
      preferences.motion &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches &&
      document.startViewTransition
    ) {
      document.startViewTransition(() => flushSync(update));
    } else update();
  }
  function navigate(next: 'home' | 'roadmap' | 'library' | 'trips' | 'orbit' | 'similar') {
    transition(() => setView(next));
    try {
      localStorage.setItem('thing-last-view', next);
    } catch {
      setMessage(tr('Your last view could not be saved.'));
    }
  }
  async function importPhotos() {
    navigate('library');
    setPicking(true);
    try {
      await window.thingSorted.importPhotos();
    } catch (error) {
      const text = error instanceof Error ? error.message : tr('Please try importing again.');
      setMessage(text.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    } finally {
      setPicking(false);
    }
  }
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.motion = preferences.motion ? 'on' : 'off';
    try {
      localStorage.setItem('thing-preferences', JSON.stringify(preferences));
    } catch {
      setMessage(tr('Your display preferences could not be saved on this computer.'));
    }
  }, [preferences]);
  useEffect(() => {
    let alive = true;
    let timeout: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await window.thingSorted.status();
        if (alive) setStatus(result);
      } catch {
        if (alive)
          setStatus({
            phase: 'failed',
            appVersion: '1.0.1',
            backendVersion: null,
            diagnosticCode: 'DESKTOP_BRIDGE_UNAVAILABLE',
          });
      }
      if (alive) timeout = setTimeout(() => void refresh(), 2500);
    }
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  async function retry() {
    setRetrying(true);
    try {
      setStatus(await window.thingSorted.retry());
    } catch {
      setMessage(tr('The local connection could not restart. Close the app and try again.'));
    } finally {
      setRetrying(false);
    }
  }
  async function copyDiagnostics() {
    try {
      await window.thingSorted.copyDiagnostics();
      setMessage('Diagnostics copied. They contain no photos, file paths, or secrets.');
    } catch {
      setMessage(tr('Could not copy diagnostics. Please try again.'));
    }
  }
  return (
    <>
      <AmbientEffects />
      <div
        className="app-shell"
        data-menu-position={preferences.menuPosition}
        data-menu-collapsed={menuCollapsed}
      >
        <a
          className="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById('main-content')?.focus();
          }}
        >
          {tr('Skip to content')}
        </a>
        <aside className="sidebar">
          <button
            className="menu-toggle secondary-button"
            aria-expanded={!menuCollapsed}
            aria-label={menuCollapsed ? 'Expand Menu' : 'Collapse Menu'}
            onClick={() => {
              const next = !menuCollapsed;
              setMenuCollapsed(next);
              try {
                localStorage.setItem('memory-menu-collapsed', String(next));
              } catch {
                /* Session state still works. */
              }
            }}
          >
            {menuCollapsed ? '☰' : 'Collapse Menu'}
          </button>
          <div className="brand">
            <div className="brand-mark">
              <img src="/brand/logo.png" alt="Memory Lane logo" />
            </div>
            <div>
              <MemoryText>Memory Lane</MemoryText>
              <span>{tr('a home for your moments')}</span>
            </div>
          </div>
          <div className="workspace-label">
            {tr('Your Space')}
            <span>{tr('Personal')}</span>
          </div>
          <nav aria-label={tr('Main navigation')}>
            <button
              className={`nav-item ${view === 'home' ? tr('selected') : ''}`}
              aria-current={view === 'home' ? 'page' : undefined}
              onClick={() => navigate('home')}
            >
              <Icon name="orbit" />
              {tr('Overview')}
              <span className="nav-dot" />
            </button>
            <button
              className={`nav-item ${view === 'library' ? tr('selected') : ''}`}
              onClick={() => {
                setInitialTrip('');
                setInitialTag('');
                navigate('library');
              }}
              aria-current={view === 'library' ? 'page' : undefined}
            >
              <Icon name="grid" />
              {tr('All photos')}
            </button>
            <button
              className={`nav-item ${view === 'orbit' ? tr('selected') : ''}`}
              onClick={() => navigate('orbit')}
              aria-current={view === 'orbit' ? 'page' : undefined}
            >
              <Icon name="orbit" />
              {tr('Photo orbit')}
            </button>
            <button
              className={`nav-item ${view === 'trips' ? tr('selected') : ''}`}
              onClick={() => navigate('trips')}
              aria-current={view === 'trips' ? 'page' : undefined}
            >
              <Icon name="folder" />
              {tr('Trips & albums')}
            </button>
            <button
              className={`nav-item ${view === 'similar' ? tr('selected') : ''}`}
              onClick={() => navigate('similar')}
              aria-current={view === 'similar' ? 'page' : undefined}
            >
              <Icon name="layers" />
              {tr('Duplicates')}
            </button>
          </nav>
          <div className="sidebar-bottom">
            <button className="nav-item ai-corner" onClick={() => setAiOpen(true)}>
              <Icon name="spark" />
              API key <span>Optional AI</span>
            </button>
            <div className="private-card">
              <Icon name="lock" />
              <strong>{tr('Yours. Always.')}</strong>
              <p>
                {tr('Offline by design.')}
                <br />
                <MemoryText>{tr('Your memories stay with you.')}</MemoryText>
              </p>
              <span className="private-line" />
            </div>
            <button
              className={`nav-item ${view === 'roadmap' ? tr('selected') : ''}`}
              aria-current={view === 'roadmap' ? 'page' : undefined}
              onClick={() => navigate('roadmap')}
            >
              <Icon name="spark" />
              {tr('Build journey')}
            </button>
            <button className="nav-item" onClick={() => setSettingsOpen(true)}>
              <Icon name="settings" />
              {tr('Preferences')}
            </button>
            <div className="profile">
              <span className="avatar">Y</span>
              <div>
                {tr('Your personal space')}
                <small>{tr('Stored on this computer')}</small>
              </div>
            </div>
          </div>
        </aside>
        <div className="main-area">
          <header className="topbar">
            <div className="breadcrumb">
              {tr('Your workspace')}
              <span>/</span>{' '}
              <strong>
                {
                  {
                    home: tr('Overview'),
                    library: tr('All photos'),
                    trips: tr('Trips & albums'),
                    orbit: tr('Photo orbit'),
                    similar: tr('Duplicates'),
                    roadmap: tr('Build journey'),
                  }[view]
                }
              </strong>
            </div>
            <div className="topbar-actions">
              <span className="offline-badge">
                <span />
                {tr('Offline & private')}
              </span>
              <button
                className="icon-button"
                aria-label={tr('Open preferences')}
                onClick={() => setSettingsOpen(true)}
              >
                <Icon name="settings" />
              </button>
            </div>
          </header>
          <main id="main-content" tabIndex={-1}>
            {status.phase === 'failed' && (
              <section className="error-banner" role="alert">
                <div>
                  <strong>{tr('We couldn\u2019t connect to your local library.')}</strong>
                  <p>
                    Your photos are safe. Try restarting the connection, or copy diagnostics for
                    help.
                  </p>
                  <small>{status.diagnosticCode}</small>
                </div>
                <div className="error-actions">
                  <button
                    className="primary-button"
                    onClick={() => void retry()}
                    disabled={retrying}
                  >
                    {retrying ? tr('Reconnecting\u2026') : tr('Try again')}
                  </button>
                  <button className="secondary-button" onClick={() => void copyDiagnostics()}>
                    {tr('Copy diagnostics')}
                  </button>
                </div>
              </section>
            )}
            {status.phase === 'starting' ? (
              <LoadingSkeleton />
            ) : status.phase !== 'ready' && view !== 'home' && view !== 'roadmap' ? (
              <section className="loading-library" role="status">
                {tr('Reconnect above to open your collection.')}
              </section>
            ) : view === 'home' ? (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      <MemoryText>{tr('Less Clutter. More Memories.')}</MemoryText>
                    </div>
                    <h1>{tr('Welcome to your little universe.')}</h1>
                  </div>
                  <span className="version-label">{tr('Your Collection')}</span>
                </div>
                <section className="hero" aria-label={tr('Welcome to Memory Lane')}>
                  <div className="hero-copy">
                    <div className="pill">
                      <span />
                      {tr('A Fresh Start')}
                    </div>
                    <h2>
                      {tr('Life happens.')}
                      <br />
                      {tr('Keep it')}
                      <em>{tr('Sorted.')}</em>
                    </h2>
                    <p>
                      {tr('A thousand little moments.')}
                      <br />
                      {tr('One beautiful place to come back to.')}
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => void importPhotos()}
                      disabled={status.phase !== 'ready' || picking}
                    >
                      {tr('Bring your photos home')}
                      <Icon name="arrow" />
                    </button>
                    <div className="hero-footnote">
                      <Icon name="lock" />
                      {tr('Just you, your photos, and a little order.')}
                    </div>
                  </div>
                  <OrbitArt />
                </section>
                <div className="section-heading">
                  <h2>{tr('A thoughtful home for every photo.')}</h2>
                  <span>{tr('Built Around You')}</span>
                </div>
                <div className="feature-grid">
                  <article className="feature-card">
                    <div className="feature-icon orange">
                      <Icon name="image" />
                    </div>
                    <span className="feature-number">01</span>
                    <h3>{tr('Every kind of moment.')}</h3>
                    <p>
                      {tr(
                        'From phone snapshots to camera originals. Import RAW, HEIC, TIFF, and everyday formats into your private collection.',
                      )}
                    </p>
                    <span className="feature-meta">
                      {tr('Import \u00B7 Ready For Your Photos')}
                    </span>
                  </article>
                  <article className="feature-card">
                    <div className="feature-icon green">
                      <Icon name="orbit" />
                    </div>
                    <span className="feature-number">02</span>
                    <h3>{tr('A new way to look back.')}</h3>
                    <p>
                      {tr(
                        'Explore your memories in playful orbits, thoughtful galleries, and trips that tell a story.',
                      )}
                    </p>
                    <span className="feature-meta">
                      {tr('Trips \u00B7 Orbits \u00B7 Galleries')}
                    </span>
                  </article>
                  <article className="feature-card">
                    <div className="feature-icon blue">
                      <Icon name="globe" />
                    </div>
                    <span className="feature-number">03</span>
                    <h3>{tr('Feels like your space.')}</h3>
                    <p>
                      {tr(
                        'English interface. A lighter look and motion controls are in Preferences.',
                      )}
                    </p>
                    <span className="feature-meta">{tr('Personal, By Design')}</span>
                  </article>
                </div>
                <section className="foundation-status" aria-label={tr('Application connection')}>
                  <div className={`connection-symbol ${status.phase}`}>
                    <Icon name={status.phase === 'ready' ? 'check' : 'orbit'} />
                  </div>
                  <div>
                    <strong>
                      {status.phase === 'ready'
                        ? tr('Your local connection is ready.')
                        : tr('Your local connection needs attention.')}
                    </strong>
                    <p>
                      {status.phase === 'ready'
                        ? tr('Ready to copy your photos safely into your chosen library.')
                        : tr('Use the recovery controls above to reconnect.')}
                    </p>
                  </div>
                  <span className={`connection-tag ${status.phase}`} role="status">
                    {status.phase === 'ready' ? 'Health OK' : 'Offline Error'}
                  </span>
                </section>
              </>
            ) : view === 'library' ? (
              <Library
                initialTrip={initialTrip}
                initialTag={initialTag}
                ready={status.phase === 'ready'}
                picking={picking}
                onImport={() => void importPhotos()}
              />
            ) : view === 'trips' ? (
              <Trips
                onOpenAlbum={(label) => {
                  setInitialTrip('');
                  setInitialTag(label);
                  navigate('library');
                }}
                onOpen={(id) => {
                  setInitialTrip(id);
                  setInitialTag('');
                  navigate('library');
                }}
              />
            ) : view === 'orbit' ? (
              <Orbit
                onGallery={() => {
                  setInitialTrip('');
                  setInitialTag('');
                  navigate('library');
                }}
              />
            ) : view === 'similar' ? (
              <Similar />
            ) : (
              <Roadmap />
            )}
            <footer>
              <span>
                <MemoryText>Memory Lane</MemoryText> <span className="footer-dot">·</span>
                {tr('a little order, a lot of life.')}
                <small className="creator-credit">Created By TheEpicMonolouge</small>
              </span>
              <span>
                v{status.appVersion} <span className="footer-dot">/</span>
                {tr('Made for your Windows desktop')}
              </span>
            </footer>
          </main>
        </div>
        {aiOpen && <AiPanel onClose={() => setAiOpen(false)} />}
        <Preferences
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          value={preferences}
          onChange={(value) => {
            if (value.motion !== preferences.motion) flushSync(() => setPreferences(value));
            else transition(() => setPreferences(value));
          }}
        />
        {message && (
          <div className="toast" role="status">
            {message}
            <button
              className="icon-button"
              aria-label={tr('Dismiss notification')}
              onClick={() => setMessage('')}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
