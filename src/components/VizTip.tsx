import { useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';

/* Shared hover and focus tooltip for the charts. React escapes the content, so names from data are safe. */

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

/** One tooltip per chart; marks call show() on hover and focus. Values also appear in each chart's table view. */
export function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (target: Element, content: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (!box) return;
    const x = Math.min(Math.max(r.left + r.width / 2 - box.left, 120), box.width - 120);
    setTip({ x, y: r.top - box.top, content });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="viz-tip" role="presentation" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  ) : null;
  const handlers = (content: ReactNode) => ({
    onPointerEnter: (e: PointerEvent) => show(e.currentTarget, content),
    onPointerLeave: hide,
    onFocus: (e: FocusEvent) => show(e.currentTarget, content),
    onBlur: hide,
  });
  return { ref, node, handlers };
}
