import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

const ToastContext = createContext(null);

// Toasts are only raised by callers after the API call resolves or rejects, so they always reflect the real result.
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());
  const id = useRef(0);
  const dismiss = useCallback((toastId) => {
    clearTimeout(timers.current.get(toastId)); timers.current.delete(toastId);
    setItems((list) => list.filter((t) => t.id !== toastId));
  }, []);
  const push = useCallback((msg, bad) => {
    const toastId = ++id.current;
    setItems((list) => [...list.slice(-3), { id: toastId, msg, bad }]);
    timers.current.set(toastId, setTimeout(() => dismiss(toastId), bad ? 6000 : 3500));
  }, [dismiss]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const api = useMemo(() => ({ success: (m) => push(m, false), error: (m) => push(m, true) }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5">
          {items.map((t) => (
            <div key={t.id} role={t.bad ? 'alert' : 'status'} className="anim-slide pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-surface p-3 pr-2 shadow-pop sm:w-auto sm:min-w-72">
              {t.bad ? <CircleAlert size={18} className="mt-px shrink-0 text-danger" aria-hidden="true" /> : <CheckCircle2 size={18} className="mt-px shrink-0 text-success" aria-hidden="true" />}
              <p className="flex-1 text-sm text-fg">{t.msg}</p>
              <button type="button" className="btn btn-ghost btn-icon !h-6 !w-6" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><X size={14} /></button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
