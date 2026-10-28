import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { api } from '../../utils/api.js';
import { TYPE_LABEL } from '../../utils/customFields.js';
import { useToast } from '../Toast.jsx';
import { Skeleton } from '../ui.jsx';
import { ExpandableList, OptionChips } from './Expandable.jsx';

// Settings > Dashboard filters: choose which fields appear as filters on the Dashboard, and in what order.
// Saved on every change (like the invoice-field order). Date range is required and can be reordered.
export default function DashboardFiltersSection() {
  const toast = useToast();
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/api/dashboard-filters').then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const filters = data?.filters ?? [], max = data?.max_enabled ?? 8;
  const on = filters.filter((f) => f.enabled);
  const persist = async (next, message) => {
    const previous = data;
    setData({ ...data, filters: next }); setBusy(true);
    try { setData(await api('/api/dashboard-filters', { method: 'PUT', body: { filters: next.map(({ key, enabled }) => ({ key, enabled })) } })); toast.success(message); }
    catch (e) { setData(previous); toast.error(e.message); }
    setBusy(false);
  };
  const toggle = (f) => persist(filters.map((x) => (x.key === f.key ? { ...x, enabled: !x.enabled } : x)), `${f.label} ${f.enabled ? 'hidden from' : 'shown on'} the dashboard`);
  const move = (index, step) => { const next = [...filters]; [next[index], next[index + step]] = [next[index + step], next[index]]; persist(next, 'Order updated'); };
  const iconBtn = 'btn btn-ghost btn-icon !h-8 !w-8';

  return (
    <section className="card card-pad" aria-labelledby="dash-filters-heading">
      <div className="mb-4">
        <h3 id="dash-filters-heading" className="section-title">Filter fields</h3>
        <p className="mt-1 text-sm text-fg-muted">Choose which fields people can filter the dashboard by, and their order. Custom invoice fields appear here automatically.</p>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-danger-ink">{error}</p>}
      {!data && !error ? <div className="space-y-2 py-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : data && (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted" aria-live="polite">
            <span>Shown on the dashboard:</span>
            {on.map((f) => <span key={f.key} className="badge badge-neutral">{f.label}</span>)}
          </p>
          <div className="mt-2 border-t border-line">
            <ExpandableList className="divide-y divide-line" items={filters} limit={8} render={(f, i) => (
              <li key={f.key} className={`flex items-start justify-between gap-3 py-3 ${f.enabled ? '' : 'opacity-75'}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <input id={`dash-filter-${f.key}`} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={f.enabled}
                    disabled={busy || f.required || (!f.enabled && on.length >= max)} onChange={() => toggle(f)} />
                  <div className="min-w-0">
                    <label htmlFor={`dash-filter-${f.key}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-fg">
                      {f.label}<span className="badge badge-neutral">{f.required ? 'Always shown' : f.custom ? TYPE_LABEL[f.input_type] : 'Built-in'}</span>
                      {f.custom && <span className="badge badge-neutral">Invoice field</span>}
                    </label>
                    {f.custom && f.input_type === 'dropdown' && <OptionChips options={f.options.map((o) => o.label)} limit={4} />}
                  </div>
                </div>
                <span className="flex shrink-0 gap-1">
                  <button type="button" className={iconBtn} onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`Move ${f.label} up`} title="Move up"><ChevronUp size={15} /></button>
                  <button type="button" className={iconBtn} onClick={() => move(i, 1)} disabled={busy || i === filters.length - 1} aria-label={`Move ${f.label} down`} title="Move down"><ChevronDown size={15} /></button>
                </span>
              </li>)} />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-fg-muted"><Filter size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Up to {max} filters. Cancelled invoices are always left out of dashboard figures, so “Cancelled” isn’t offered as a payment choice.{on.length >= max && <b className="ml-1 text-warning-ink">Limit reached: turn one off to add another.</b>}</span></p>
        </>)}
    </section>
  );
}
