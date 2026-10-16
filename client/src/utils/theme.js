import { useCallback, useEffect, useState } from 'react';

const read = () => document.documentElement.classList.contains('dark') ? 'dark' : 'light';

// The initial class is set by the inline script in index.html (no flash). This hook keeps React in sync,
// persists an explicit choice, and follows the OS setting until the user picks one.
export function useTheme() {
  const [theme, setTheme] = useState(read);
  const apply = useCallback((next) => {
    document.documentElement.classList.toggle('dark', next === 'dark');
    setTheme(next);
  }, []);
  const toggle = useCallback(() => {
    const next = read() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
    apply(next);
  }, [apply]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => { let saved = null; try { saved = localStorage.getItem('theme'); } catch { /* ignore */ } if (!saved) apply(e.matches ? 'dark' : 'light'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [apply]);
  return { theme, toggle };
}

export function useStoredBool(key, initial = false) {
  const [value, setValue] = useState(() => { try { const v = localStorage.getItem(key); return v == null ? initial : v === '1'; } catch { return initial; } });
  const set = useCallback((next) => {
    setValue((prev) => { const v = typeof next === 'function' ? next(prev) : next; try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* ignore */ } return v; });
  }, [key]);
  return [value, set];
}
