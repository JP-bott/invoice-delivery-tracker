import { useEffect, useId, useRef } from 'react';

export default function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  const id = useId();
  const box = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    box.current?.querySelector('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-3">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} className={`max-h-full w-full ${width} space-y-2 overflow-y-auto rounded-xl bg-white p-4`}>
        <h2 id={id} className="font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
