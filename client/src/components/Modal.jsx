import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

export default function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  const id = useId();
  const box = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    box.current?.querySelector('input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} className={`max-h-[calc(100dvh-1.5rem)] w-full ${width} overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5`}>
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 id={id} className="font-semibold text-slate-900">{title}</h2>
          <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 p-5">
        {children}
        </div>
      </div>
    </div>
  );
}
