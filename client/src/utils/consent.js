// Browser-storage consent is per tab session; never treat a previous visit as consent.
export const CONSENT_KEY = 'invoice-tracker:storage-consent:v1';
export const CONSENT_CHANGED = 'invoice-tracker:storage-consent-changed';
export const CONSENT_OPEN = 'invoice-tracker:open-storage-settings';

// These are the ONLY optional persistent keys used by the current client.
export const PREFERENCE_KEYS = Object.freeze(['theme', 'sidebar-collapsed', 'dashboard-show-amounts']);

function browserStorage(name) {
  try { return typeof window === 'undefined' ? null : window[name]; }
  catch { return null; }
}

export function readConsent(store = browserStorage('sessionStorage')) {
  try {
    const choice = store?.getItem(CONSENT_KEY);
    return choice === 'preferences' || choice === 'essential' ? choice : null;
  } catch { return null; }
}

export function preferencesAllowed(store = browserStorage('sessionStorage')) {
  return readConsent(store) === 'preferences';
}

export function readPreference(key, session = browserStorage('sessionStorage'), local = browserStorage('localStorage')) {
  if (!PREFERENCE_KEYS.includes(key) || !preferencesAllowed(session)) return null;
  try { return local?.getItem(key) ?? null; } catch { return null; }
}

export function writePreference(key, value, session = browserStorage('sessionStorage'), local = browserStorage('localStorage')) {
  if (!PREFERENCE_KEYS.includes(key) || !preferencesAllowed(session)) return false;
  try { local?.setItem(key, String(value)); return Boolean(local); } catch { return false; }
}

export function saveConsent(allowPreferences, session = browserStorage('sessionStorage'), local = browserStorage('localStorage')) {
  const choice = allowPreferences ? 'preferences' : 'essential';
  try { session?.setItem(CONSENT_KEY, choice); } catch { /* storage may be blocked */ }

  if (!allowPreferences) {
    // Withdrawal also removes preferences saved on an earlier visit.
    for (const key of PREFERENCE_KEYS) {
      try { local?.removeItem(key); } catch { /* storage may be blocked */ }
    }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONSENT_CHANGED));
  return choice;
}

export function openConsentSettings() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONSENT_OPEN));
}
