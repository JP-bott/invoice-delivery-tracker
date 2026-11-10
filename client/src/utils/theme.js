import { useCallback, useEffect, useState } from 'react';
import { CONSENT_CHANGED, readPreference, writePreference } from './consent.js';

const read = () => document.documentElement.classList.contains('dark') ? 'dark' : 'light';

// The initial class is set before first paint. Optional preference storage is
// accessed only after an explicit choice within the current browser-tab session.
export function useTheme() {
  const [theme, setTheme] = useState(read);
  const apply = useCallback((next) => {
    document.documentElement.classList.toggle('dark', next === 'dark');
    setTheme(next);
  }, []);
  const toggle = useCallback(() => {
    const next = read() === 'dark' ? 'light' : 'dark';
    writePreference('theme', next);
    apply(next);
  }, [apply]);

  useEffect(() => {
    const syncConsent = () => {
      const saved = readPreference('theme');
      if (saved === 'light' || saved === 'dark') apply(saved);
      else if (readPreference('theme') === null) {
        // Keep the present UI theme; store it only when preferences are allowed.
        writePreference('theme', read());
      }
    };
    window.addEventListener(CONSENT_CHANGED, syncConsent);
    return () => window.removeEventListener(CONSENT_CHANGED, syncConsent);
  }, [apply]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      if (!readPreference('theme')) apply(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [apply]);
  return { theme, toggle };
}

export function useStoredBool(key, initial = false) {
  const [value, setValue] = useState(() => {
    const saved = readPreference(key);
    return saved === null ? initial : saved === '1';
  });
  const set = useCallback((next) => {
    setValue((prev) => {
      const updated = typeof next === 'function' ? next(prev) : next;
      writePreference(key, updated ? '1' : '0');
      return updated;
    });
  }, [key]);

  useEffect(() => {
    const syncConsent = () => {
      const saved = readPreference(key);
      if (saved !== null) setValue(saved === '1');
      else writePreference(key, value ? '1' : '0');
    };
    window.addEventListener(CONSENT_CHANGED, syncConsent);
    return () => window.removeEventListener(CONSENT_CHANGED, syncConsent);
  }, [key, value]);
  return [value, set];
}
