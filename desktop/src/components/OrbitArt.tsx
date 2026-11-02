import { tr } from '../i18n';
export function OrbitArt() {
  return (
    <div className="orbit-art" aria-hidden="true">
      <div className="orbit-glow" />
      <div className="orbit-ring ring-outer">
        <span />
      </div>
      <div className="orbit-ring ring-inner">
        <span />
      </div>
      <div className="cross cross-one">+</div>
      <div className="cross cross-two">+</div>
      <div className="orbit-center">
        <img src="/brand/logo.png" alt="" />
      </div>
      <div className="memory-frame frame-one">
        <div className="scene scene-desert">
          <i />
          <b />
        </div>
        <span>{tr('the little escapes')}</span>
      </div>
      <div className="memory-frame frame-two">
        <div className="scene scene-mountain">
          <i />
          <b />
        </div>
        <span>{tr('somewhere quiet')}</span>
      </div>
      <div className="memory-frame frame-three">
        <div className="scene scene-sea">
          <i />
          <b />
        </div>
        <span>{tr('days worth keeping')}</span>
      </div>
      <div className="orbit-label">{tr('A LITTLE ORDER. A LOT OF LIFE.')}</div>
    </div>
  );
}
