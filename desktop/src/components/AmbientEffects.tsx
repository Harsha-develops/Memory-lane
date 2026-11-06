import { useEffect } from 'react';

export function AmbientEffects() {
  useEffect(() => {
    const active = new Set<HTMLElement>();
    const ripple = (event: MouseEvent) => {
      if (
        document.documentElement.dataset.motion === 'off' ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const button = (event.target as Element | null)?.closest('button');
      if (!button || button.disabled) return;
      const rect = button.getBoundingClientRect();
      const effect = document.createElement('span');
      effect.className = 'button-ripple';
      effect.setAttribute('aria-hidden', 'true');
      const diameter = Math.max(rect.width, rect.height) * 2;
      Object.assign(effect.style, {
        width: `${diameter}px`,
        height: `${diameter}px`,
        left: `${(event.detail ? event.clientX - rect.left : rect.width / 2) - diameter / 2}px`,
        top: `${(event.detail ? event.clientY - rect.top : rect.height / 2) - diameter / 2}px`,
      });
      button.append(effect);
      active.add(effect);
      const remove = () => {
        effect.remove();
        active.delete(effect);
      };
      effect.addEventListener('animationend', remove, { once: true });
      setTimeout(remove, 900);
    };
    document.addEventListener('click', ripple);
    return () => {
      document.removeEventListener('click', ripple);
      active.forEach((node) => node.remove());
    };
  }, []);
  return (
    <div className="aurora-background" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}
