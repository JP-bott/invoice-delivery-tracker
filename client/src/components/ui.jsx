import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, MoreHorizontal } from 'lucide-react';

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children && <div className="w-full">{children}</div>}
    </div>
  );
}

export const Skeleton = ({ className = '' }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

export function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'}`}>
      {Icon && <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg-subtle"><Icon size={20} aria-hidden="true" /></span>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Positions a floating element next to an anchor, flips vertically and clamps to the viewport so it is never clipped.
function useFloating(open, anchorRef, floatRef, side) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !floatRef.current) { setPos(null); return undefined; }
    const place = () => {
      const a = anchorRef.current.getBoundingClientRect(), f = floatRef.current.getBoundingClientRect(), m = 8;
      let top = side === 'bottom' ? a.bottom + m : a.top - f.height - m;
      if (side !== 'bottom' && top < m) top = a.bottom + m;
      if (side === 'bottom' && top + f.height > innerHeight - m) top = Math.max(m, a.top - f.height - m);
      const left = Math.min(Math.max(a.left + a.width / 2 - f.width / 2, m), Math.max(m, innerWidth - f.width - m));
      setPos({ top, left });
    };
    place();
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open, anchorRef, floatRef, side]);
  return pos;
}

// Tooltip / hover card: opens on hover (with a small delay to avoid flicker) and on keyboard focus.
export function HoverCard({ content, children, side = 'top', delay = 150, className = '', width = 'w-64' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchor = useRef(null), tip = useRef(null), timer = useRef();
  const pos = useFloating(open, anchor, tip, side);
  const show = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); }, [delay]);
  const hide = useCallback(() => { clearTimeout(timer.current); setOpen(false); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const child = isValidElement(children) ? cloneElement(children, { 'aria-describedby': open ? id : undefined }) : children;
  return (
    <span ref={anchor} className={`relative inline-flex ${className}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {child}
      {open && content && createPortal(
        <div ref={tip} id={id} role="tooltip" style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
          className={`anim-fade pointer-events-none fixed z-[70] ${width} max-w-[calc(100vw-1rem)] rounded-lg bg-tooltip px-3 py-2 text-xs leading-relaxed text-tooltip-fg shadow-pop`}>
          {content}
        </div>, document.body)}
    </span>
  );
}

// Small "i" button that explains a metric. Tap/click toggles it so touch users can read it too.
export function InfoTip({ text, label = 'More information' }) {
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const anchor = useRef(null), tip = useRef(null);
  const pos = useFloating(pinned, anchor, tip, 'top');
  useEffect(() => {
    if (!pinned) return undefined;
    const off = (e) => { if (!anchor.current?.contains(e.target)) setPinned(false); };
    const key = (e) => e.key === 'Escape' && setPinned(false);
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', key); };
  }, [pinned]);
  return (
    <HoverCard content={text} className="align-middle">
      <button ref={anchor} type="button" onClick={(e) => { e.stopPropagation(); setPinned((p) => !p); }} aria-label={label} aria-expanded={pinned} aria-controls={pinned ? id : undefined}
        className="rounded-full p-0.5 text-fg-subtle transition-colors hover:text-fg"><Info size={13} aria-hidden="true" />
        {pinned && createPortal(<div ref={tip} id={id} role="note" style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }} className="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] rounded-lg bg-tooltip px-3 py-2 text-left text-xs font-normal leading-relaxed text-tooltip-fg shadow-pop sm:hidden">{text}</div>, document.body)}
      </button>
    </HoverCard>
  );
}

// Row action menu: click-outside, Escape, and arrow-key navigation.
export function ActionMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null), menu = useRef(null);
  const pos = useFloating(open, btn, menu, 'bottom');
  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector('[role="menuitem"]')?.focus();
    const off = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [open]);
  const onKey = (e) => {
    const els = [...menu.current.querySelectorAll('[role="menuitem"]')], i = els.indexOf(document.activeElement);
    if (e.key === 'Escape') { setOpen(false); btn.current.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length].focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <>
      <button ref={btn} type="button" className="btn btn-ghost btn-icon !h-8 !w-8" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><MoreHorizontal size={18} aria-hidden="true" /></button>
      {open && createPortal(
        <div ref={menu} role="menu" aria-label={label} onKeyDown={onKey} style={pos ? { top: pos.top, left: Math.max(8, pos.left - 60) } : { top: 0, left: 0, visibility: 'hidden' }}
          className="anim-pop fixed z-[70] min-w-40 rounded-lg border border-line bg-surface p-1 shadow-pop">
          {items.map(({ label: text, icon: Icon, onClick, danger }) => (
            <button key={text} type="button" role="menuitem" tabIndex={-1} onClick={() => { setOpen(false); onClick(); }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${danger ? 'text-danger-ink' : 'text-fg'}`}>
              {Icon && <Icon size={15} aria-hidden="true" />}{text}
            </button>))}
        </div>, document.body)}
    </>
  );
}
