import { useEffect, useId, useRef, useState } from 'react';
import { href } from '../lib/router';

export interface NavMenuLink {
  label: string;
  path: string;
  /** The section its pages belong to (App.tsx), to mark the page being shown. */
  section: string;
  /** A short line under the label. */
  hint?: string;
}

/** A mouse or trackpad that can hover. Touch screens open menus with a tap instead. */
const canHover = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true;

/** How long the menu stays open after the pointer leaves it, so crossing the gap below the button does not close it. */
const CLOSE_DELAY_MS = 250;

/**
 * An item in the bar that opens a short menu of pages: a button, then a list of links (the disclosure pattern for
 * site navigation). Hovering with a mouse opens it, and so do a click, a tap, Enter and Space; Esc, a click elsewhere
 * or moving focus out of it closes it. Remount it on every route change (a `key`) so it closes after a choice.
 */
export function NavMenu({ label, items, active }: { label: string; items: NavMenuLink[]; active: string }) {
  // Opened by hovering (closes when the pointer leaves), or by a click, tap or key (stays until dismissed).
  const [open, setOpen] = useState<false | 'hover' | 'click'>(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const id = useId();
  const current = items.some((i) => i.section === active);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <div
      ref={box}
      className="nav-menu"
      onMouseEnter={() => {
        clearTimeout(closeTimer.current);
        if (!open && canHover()) setOpen('hover');
      }}
      onMouseLeave={() => {
        if (open === 'hover') closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
      }}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={`nav-menu-button${current ? ' current' : ''}`}
        aria-expanded={open !== false}
        aria-controls={id}
        // A click on a menu that hovering opened keeps it open; another click closes it.
        onClick={() => setOpen(open === 'click' ? false : 'click')}
      >
        {label}
        <span className="nav-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <ul id={id} className="nav-menu-panel" hidden={open === false}>
        {items.map((item) => (
          <li key={item.path}>
            <a href={href(item.path)} aria-current={item.section === active ? 'page' : undefined} aria-describedby={item.hint ? `${id}-${item.section}` : undefined}>
              <span className="nav-menu-label">{item.label}</span>
              {item.hint && (
                <span className="nav-menu-hint" id={`${id}-${item.section}`} aria-hidden="true">
                  {item.hint}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
