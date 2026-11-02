import { Icon } from './Icon';

const steps = [
  [
    '01',
    'A place to begin',
    'Desktop shell, secure local connection, and the visual foundation.',
    'Complete',
  ],
  [
    '02',
    'Bring your moments',
    'Import, validation, thumbnails, and per-file results. HEIC, TIFF, RAW, and everyday formats.',
    'Complete',
  ],
  [
    '03',
    'Everything in its place',
    'A persistent library, trips, dates, and flexible filters.',
    'Complete',
  ],
  [
    '04',
    'See the bigger picture',
    'Interactive photo orbits, a large-library gallery, and keyboard-friendly viewing.',
    'Complete',
  ],
  [
    '05',
    'Keep the good stuff',
    'Capture dates, private GPS controls, and duplicate review.',
    'Complete',
  ],
  [
    '06',
    'Ready to call home',
    'A self-contained Windows installer. Clean-machine verification is still pending.',
    'Validation pending',
  ],
];

export function Roadmap() {
  return (
    <section className="roadmap" aria-labelledby="roadmap-title">
      <div className="eyebrow">THE BUILD JOURNEY</div>
      <h1 id="roadmap-title">Good things take shape.</h1>
      <p className="section-intro">
        One tested milestone at a time. Here’s what’s here, and what comes next.
      </p>
      <div className="steps">
        {steps.map(([number, title, description, badge]) => (
          <article className="step" key={number}>
            <span className="step-number">{number}</span>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <span className={`tag ${number === '06' ? 'active-tag' : ''}`}>{badge}</span>
          </article>
        ))}
      </div>
      <div className="privacy-note">
        <Icon name="lock" />
        <p>
          Your originals stay untouched. Optional folder watching and backups are in Preferences. AI
          uses your own provider and key. Final release verification remains in progress.
        </p>
      </div>
    </section>
  );
}
