import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Accessible dialog: focus moves in, Tab is trapped, Escape closes, focus returns to the trigger, page scroll is locked.
export default function Modal({ title, description, onClose, children, footer, width = 'max-w-lg', dismissOnBackdrop = true }) {
  const id = useId();
  const box = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    root?.setAttribute('inert', ''); // background becomes non-interactive and hidden from assistive tech
    const el = box.current;
    (el.querySelector('input, select, textarea') || el.querySelector('[data-autofocus]') || el.querySelector('footer button') || el)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; root?.removeAttribute('inert'); if (opener instanceof HTMLElement) opener.focus(); };
  }, []);

  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => { if (dismissOnBackdrop && e.target === e.currentTarget) close.current(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={description ? `${id}-d` : undefined}
        className={`anim-pop flex max-h-[92dvh] w-full ${width} flex-col rounded-t-2xl border border-line bg-surface shadow-pop outline-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={id} className="text-base font-semibold text-fg">{title}</h2>
            {description && <p id={`${id}-d`} className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-icon -mr-2 -mt-1.5" onClick={() => close.current()} aria-label="Close dialog"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3 sm:rounded-b-xl">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
