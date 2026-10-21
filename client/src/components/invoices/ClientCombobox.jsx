import { useEffect, useId, useMemo, useState } from 'react';
import { clientFields, findClient, matchClients } from '../../utils/clients.js';

const SHOWN = 8;
const NONE = { client_tin: '', client_address: '' };

// Underline the part of a suggestion that matches what was typed.
function Match({ text, query }) {
  const q = query.trim(), at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<span className="text-brand-ink underline decoration-brand/40 underline-offset-2">{text.slice(at, at + q.length)}</span>{text.slice(at + q.length)}</>;
}

// Client Name with suggestions from the registered clients (Settings > Clients). Typing still works for a client that is not
// registered. Choosing a client (click, Enter, or typing its exact name and leaving the field) fills Name, TIN and Address in the form;
// changing the name to anything else clears the TIN and Address again, so they never describe a different client.
// `onChange` receives a patch: { client_name, client_tin, client_address }.
export default function ClientCombobox({ id, value, tin, address, clients, onChange, invalid, describedBy }) {
  const list = useId();
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [typed, setTyped] = useState(false);
  const found = useMemo(() => findClient(clients, value), [clients, value]);
  const matches = useMemo(() => matchClients(clients, value), [clients, value]);
  const shown = matches.slice(0, SHOWN), query = value.trim();
  const optionId = (i) => `${list}-option-${i}`;

  useEffect(() => { if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' }); }, [open, active]);

  const choose = (client) => { onChange(clientFields(client)); setOpen(false); setActive(-1); };
  const type = (text) => {
    const same = findClient(clients, text); // typing a registered name in full brings its details along
    onChange(same ? { ...clientFields(same), client_name: text } : { client_name: text, ...NONE });
    setOpen(true); setActive(-1); setTyped(true);
  };
  const leave = () => {
    setOpen(false); setActive(-1);
    if (typed && found && (found.name !== value || (found.tin ?? '') !== tin || (found.address ?? '') !== address)) choose(found); // settle on the registered spelling
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!shown.length) return;
      e.preventDefault();
      if (!open) { setOpen(true); setActive(e.key === 'ArrowDown' ? 0 : shown.length - 1); return; }
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % shown.length : (i <= 0 ? shown.length - 1 : i - 1)));
    } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) { e.preventDefault(); choose(shown[active]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setActive(-1); } // closes the list, not the dialog
  };

  const showList = open && (shown.length > 0 || (clients.length > 0 && query !== ''));
  const details = found || tin || address;
  return (
    <div className="relative">
      <input id={id} type="text" required role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={showList} aria-controls={showList && shown.length > 0 ? list : undefined}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined} aria-invalid={invalid} aria-describedby={describedBy}
        className={`input ${invalid ? 'input-error' : ''}`} value={value} maxLength={200} placeholder={clients.length ? 'Type to search registered clients' : undefined}
        onChange={(e) => type(e.target.value)} onKeyDown={onKeyDown} onBlur={leave} />
      {showList && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          {shown.length > 0 ? (
            <ul id={list} role="listbox" aria-label="Registered clients" className="max-h-56 overflow-y-auto py-1">
              {shown.map((c, i) => (
                <li key={c.id} id={optionId(i)} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(c)}
                  className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-brand-soft' : ''}`}>
                  <span className="block truncate text-sm font-medium text-fg"><Match text={c.name} query={value} /></span>
                  <span className="block truncate text-xs font-normal text-fg-muted">{c.tin ? <span className="num">TIN {c.tin}</span> : 'No TIN'}{c.address ? ` · ${c.address}` : ''}</span>
                </li>))}
            </ul>
          ) : <p className="px-3 py-2.5 text-xs font-normal text-fg-muted">No registered client matches “{query}”. It will be saved as typed, without a TIN or address.</p>}
          {matches.length > SHOWN && <p className="border-t border-line px-3 py-1.5 text-xs font-normal text-fg-subtle">{matches.length - SHOWN} more — keep typing to narrow the list.</p>}
        </div>)}
      <span className="sr-only" role="status" aria-live="polite">{showList && query ? `${matches.length} registered client${matches.length === 1 ? '' : 's'} found` : ''}</span>
      {details ? (
        <dl className="mt-1.5 space-y-0.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs font-normal text-fg-muted">
          <div className="flex gap-1.5"><dt className="shrink-0 font-medium text-fg">TIN</dt><dd className="num min-w-0 break-words">{tin || '—'}</dd></div>
          <div className="flex gap-1.5"><dt className="shrink-0 font-medium text-fg">Address</dt><dd className="min-w-0 break-words">{address || '—'}</dd></div>
        </dl>
      ) : !clients.length ? <span className="mt-1 block text-xs font-normal text-fg-muted">No registered clients yet. Add them in Settings to fill the TIN and address automatically.</span> : null}
    </div>
  );
}
