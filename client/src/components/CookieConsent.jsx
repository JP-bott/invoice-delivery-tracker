import { useEffect, useState } from 'react';
import { Cookie, ShieldCheck, X } from 'lucide-react';
import {
  CONSENT_CHANGED, CONSENT_OPEN, openConsentSettings, readConsent, saveConsent,
} from '../utils/consent.js';

// Preferences are off until explicitly enabled. A session is the browser tab's
// sessionStorage lifetime (reloads keep the selection; a new tab asks again).
export default function CookieConsent() {
  const [choice, setChoice] = useState(readConsent);
  const [open, setOpen] = useState(() => readConsent() === null);

  useEffect(() => {
    const sync = () => setChoice(readConsent());
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_CHANGED, sync);
    window.addEventListener(CONSENT_OPEN, reopen);
    return () => {
      window.removeEventListener(CONSENT_CHANGED, sync);
      window.removeEventListener(CONSENT_OPEN, reopen);
    };
  }, []);

  const decide = (preferences) => {
    saveConsent(preferences);
    setChoice(readConsent());
    // If session storage is disabled, do not treat the decision as persisted.
    // Keep the notice available at every page load.
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] p-3 sm:p-5" role="region" aria-label="Browser storage choices">
      <section className="mx-auto max-w-3xl rounded-2xl border border-line-strong bg-surface p-4 text-fg shadow-pop sm:p-6" aria-labelledby="cookie-consent-title">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink"><Cookie size={20} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 id="cookie-consent-title" className="text-base font-semibold">Your privacy and browser storage</h2>
              {choice !== null && <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-icon" aria-label="Close privacy settings"><X size={17} /></button>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              We use essential browser functions to operate the invoice tracker. With your permission, we also save your appearance and layout choices on this device for future visits. Optional preferences are off unless you accept.
            </p>
            <div className="mt-3 space-y-2 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">
              <p><strong className="text-fg">Essential functions:</strong> Invoice and dashboard requests work without optional storage. Your choice is kept in this tab for this session.</p>
              <p><strong className="text-fg">Optional preferences:</strong> Theme, sidebar layout, and dashboard amount visibility can be saved in local browser storage. No advertising or third-party analytics cookies are added by this feature.</p>
              <p><strong className="text-fg">Each session:</strong> You will be asked again in a new browser-tab session. Refreshing this tab does not ask again. You can change your choice using Privacy settings.</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => decide(true)} className="btn btn-primary">Accept preferences</button>
              <button type="button" onClick={() => decide(false)} className="btn btn-secondary">Reject optional storage</button>
              <span className="inline-flex items-center gap-1 text-xs text-fg-subtle"><ShieldCheck size={14} aria-hidden="true" /> Both choices allow you to use the tracker.</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PrivacySettingsButton({ className = 'btn btn-secondary btn-sm' }) {
  return <button type="button" onClick={openConsentSettings} className={className}><ShieldCheck size={16} aria-hidden="true" /> Privacy settings</button>;
}
