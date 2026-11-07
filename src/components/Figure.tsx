import { useRef } from 'react';
import type { Question } from '../core/schema';
import { trustedFigure } from '../lib/visuals';

/**
 * A visual question's figure, with a full-screen button for projecting and the Finals note that figures
 * may not be drawn to scale. Draws nothing for questions without a figure the site trusts (see
 * trustedFigure in lib/visuals.ts).
 */
export function FigureView({ q, large = false, note = true }: { q: Pick<Question, 'id' | 'figure'>; large?: boolean; note?: boolean }) {
  const box = useRef<HTMLElement>(null);
  const fig = trustedFigure(q);
  if (!fig) return null;
  const fullscreen = () => {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  };
  return (
    <figure ref={box} className={`qfig${large ? ' qfig-large' : ''}`}>
      {fig.kind === 'svg' ? (
        // Markup from the site's own generators only (trustedFigure rebuilds it from the question id).
        <div className="qfig-art" role="img" aria-label={fig.alt} dangerouslySetInnerHTML={{ __html: fig.svg }} />
      ) : (
        <img className="qfig-art" src={fig.src} alt={fig.alt} loading="lazy" />
      )}
      <figcaption className="qfig-caption small muted">
        {note && !q.id.startsWith('vph-') && <span>Figures may not be drawn to scale. </span>}
        {fig.kind === 'image' && fig.credit && (
          <span>
            Photo:{' '}
            {fig.sourceUrl && /^https:\/\//.test(fig.sourceUrl) ? (
              <a href={fig.sourceUrl} target="_blank" rel="noreferrer">
                {fig.credit}
              </a>
            ) : (
              fig.credit
            )}
            .{' '}
          </span>
        )}
        {typeof document !== 'undefined' && document.fullscreenEnabled && (
          <button type="button" className="btn btn-small btn-ghost no-print" onClick={fullscreen}>
            Full screen
          </button>
        )}
      </figcaption>
    </figure>
  );
}
