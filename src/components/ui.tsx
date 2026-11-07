import { useEffect, useState, type ReactNode } from 'react';
import { SUBJECT_LABELS, type Subject } from '../core/schema';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children}
    </header>
  );
}

export function SubjectTag({ subject }: { subject: Subject }) {
  return (
    <span className="badge subject" data-subject={subject}>
      {SUBJECT_LABELS[subject] ?? subject}
    </span>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'good'; children: ReactNode }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <p className="muted">{what}…</p>;
}

export function LoadError({ error }: { error: Error }) {
  return (
    <Notice kind="error">
      <strong>Could not load the question library.</strong> {error.message}{' '}
      If you are running the site yourself, build the question data first with <code>npm run data:build</code>.
    </Notice>
  );
}

/** Re-renders the caller every `ms` milliseconds while `active`. */
export function useTicker(active: boolean, ms = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return active ? now : Date.now();
}

export function Countdown({ openedAt, seconds, warningAt, now, label }: { openedAt: number; seconds: number; warningAt?: number; now: number; label: string }) {
  const elapsed = Math.max(0, (now - openedAt) / 1000);
  const left = Math.max(0, seconds - elapsed);
  const fraction = Math.min(1, elapsed / seconds);
  const state = left <= 0 ? 'over' : warningAt !== undefined && elapsed >= warningAt ? 'warn' : '';
  return (
    <div>
      <div className="row spread small">
        <span>{label}</span>
        <span className="nowrap" aria-live="off">
          {left > 0 ? `${left.toFixed(1)} s` : 'TIME'}
        </span>
      </div>
      <div className={`countdown ${state}`} role="progressbar" aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={Math.round(elapsed)} aria-label={label}>
        <div style={{ width: `${(1 - fraction) * 100}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="muted small">{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}
