import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Long lists stay compact: the first `limit` items show, the rest sit behind a "See More…" toggle.
function useExpandable(items, limit) {
  const [open, setOpen] = useState(false);
  const hidden = Math.max(items.length - limit, 0);
  return { open, toggle: () => setOpen((o) => !o), hidden, shown: open || !hidden ? items : items.slice(0, limit) };
}

function Toggle({ open, hidden, onToggle, controls, className = '' }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls}
      className={`inline-flex items-center gap-1 rounded text-xs font-medium text-brand-ink hover:underline ${className}`}>
      {open ? <>See Less<ChevronUp size={13} aria-hidden="true" /></> : <>See More… ({hidden} more)<ChevronDown size={13} aria-hidden="true" /></>}
    </button>
  );
}

// A <ul> whose rows come from render(item, index). The index is the item's position in the full list.
export function ExpandableList({ items, limit = 6, render, className = '' }) {
  const id = useId();
  const x = useExpandable(items, limit);
  return (
    <>
      <ul id={id} className={className}>{x.shown.map((item, i) => render(item, i))}</ul>
      {x.hidden > 0 && <div className="border-t border-line pt-2.5"><Toggle open={x.open} hidden={x.hidden} onToggle={x.toggle} controls={id} /></div>}
    </>
  );
}

// Dropdown options as small chips, e.g. "Options: North  South  East  +5 more".
export function OptionChips({ options, limit = 4, label = 'Options' }) {
  const id = useId();
  const x = useExpandable(options, limit);
  if (!options.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-xs text-fg-muted">{label}:</span>
      <span id={id} className="contents">{x.shown.map((o, i) => <span key={`${o}-${i}`} className="badge badge-neutral max-w-[10rem] truncate" title={o}>{o}</span>)}</span>
      {x.hidden > 0 && <Toggle open={x.open} hidden={x.hidden} onToggle={x.toggle} controls={id} className="ml-1" />}
    </div>
  );
}
