import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, X } from 'lucide-react';
import { api, qs } from '../utils/api.js';
import { range } from '../utils/dates.js';
import { PRESETS } from '../utils/constants.js';
import SummaryCards from '../components/dashboard/SummaryCards.jsx';
import RecentTransactions from '../components/dashboard/RecentTransactions.jsx';
import { StatusChart, TopClientsChart, TopProductsChart, TrendChart } from '../components/dashboard/Charts.jsx';
import DashboardAnalytics from '../components/dashboard/DashboardAnalytics.jsx';
import CollectionsOverview from '../components/dashboard/CollectionsOverview.jsx';
import { PageHeader, Skeleton } from '../components/ui.jsx';

// Used only if the filter settings can't be loaded: the two filters the dashboard has always had.
const FALLBACK_FILTERS = [
  { key: 'client', label: 'Client', aria_label: 'Client', control: 'select', source: 'clients', all_label: 'All clients', enabled: true },
  { key: 'product', label: 'Product/Service', aria_label: 'Product or service', control: 'select', source: 'products', all_label: 'All products', enabled: true },
];
const sameValues = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => (a[k] || '') === (b[k] || ''));
const selectList = (def, opts) => (def.source ? (opts[def.source] || []).map((v) => ({ value: v, label: v })) : def.options || []);

// One filter chosen in Settings > Dashboard filters. Selects and dates apply at once; text and numbers wait for a pause in typing.
function FilterControl({ def, value, opts, onChange }) {
  const cls = 'input !w-auto max-w-[12rem]';
  if (def.control === 'select') {
    const list = selectList(def, opts);
    return (
      <select aria-label={def.aria_label || def.label} className={cls} value={value} onChange={(e) => onChange(e.target.value, true)}>
        <option value="">{def.all_label}</option>
        {value && !list.some((o) => o.value === value) && <option value={value}>{value}</option>}
        {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  const type = def.control === 'date' ? 'date' : def.control === 'number' ? 'number' : 'text';
  return <input aria-label={def.aria_label || def.label} type={type} step={type === 'number' ? 'any' : undefined} placeholder={def.control === 'text' ? `${def.label} contains…` : def.label} className={cls} value={value} onChange={(e) => onChange(e.target.value, type === 'date')} />;
}

const ENDPOINTS = ['summary', 'invoice-trends', 'payment-distribution', 'analytics', 'top-clients', 'top-products', 'delivery-summary', 'recent-invoices', 'invoice-overview'];

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[120px]" />)}</div>
      <div className="grid gap-4 lg:grid-cols-5"><Skeleton className="h-[400px] lg:col-span-3" /><Skeleton className="h-[400px] lg:col-span-2" /></div>
      <div className="grid gap-4 lg:grid-cols-5"><Skeleton className="h-[360px] lg:col-span-3" /><Skeleton className="h-[360px] lg:col-span-2" /></div>
      <Skeleton className="h-72" />
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState(''), [customTo, setCustomTo] = useState('');
  const [filterDefs, setFilterDefs] = useState(null); // filters enabled in Settings (null until loaded)
  const [values, setValues] = useState({}), [applied, setApplied] = useState({}); // what the controls show / what the charts use
  const [opts, setOpts] = useState({ clients: [], products: [] });
  const [d, setD] = useState(null), [loading, setLoading] = useState(true), [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => { Promise.all([api('/api/filters/clients'), api('/api/filters/products')]).then(([clients, products]) => setOpts({ clients, products })).catch(() => {}); }, [tick]);
  useEffect(() => { api('/api/dashboard-filters').then((r) => setFilterDefs(r.filters.filter((x) => x.enabled))).catch(() => setFilterDefs(FALLBACK_FILTERS)); }, [tick]);
  useEffect(() => { const t = setTimeout(() => setApplied((prev) => (sameValues(prev, values) ? prev : values)), 300); return () => clearTimeout(t); }, [values]);
  const shownDefs = useMemo(() => filterDefs || [], [filterDefs]);
  // Only filters that are currently enabled are applied; a value left over from a filter turned off in Settings is ignored.
  const active = useMemo(() => Object.fromEntries(shownDefs.map((x) => [x.key, String(applied[x.key] ?? '').trim()]).filter(([, v]) => v)), [shownDefs, applied]);
  const activeKey = qs(active);
  const setValue = (key, value, now) => { const next = { ...values, [key]: value }; setValues(next); if (now) setApplied(next); };
  useEffect(() => {
    const reportRange = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : range(preset);
    const q = qs({ ...reportRange, ...active });
    let live = true;
    setLoading(true);
    // KPI counts are "as of now": same client/product filters, but never limited by the date range.
    Promise.all([...ENDPOINTS.map((n) => api(`/api/dashboard/${n}?${q}`)), api(`/api/dashboard/summary?${qs(active)}`)])
      .then(([summary, trends, dist, analytics, clients, products, delivery, recent, overview, now]) => { if (live) { setD({ summary, now, trends, dist, analytics, clients, products, delivery, recent, overview }); setErr(''); } })
      .catch((e) => live && setErr(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [preset, customFrom, customTo, activeKey, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportRange = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : range(preset);
  const openNow = (extra = {}) => navigate(`/invoices?${qs({ ...active, ...extra })}`);
  const label = PRESETS.find(([v]) => v === preset)?.[1];
  const periodLabel = useMemo(() => (reportRange.dateFrom && reportRange.dateTo ? `${reportRange.dateFrom} to ${reportRange.dateTo}` : preset === 'all' ? 'All time' : 'Choose a start and end date'), [reportRange.dateFrom, reportRange.dateTo, preset]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = preset !== 'month' || shownDefs.some((x) => values[x.key]);
  const clear = () => { setPreset('month'); setCustomFrom(''); setCustomTo(''); setValues({}); setApplied({}); };
  // "Financial overview · This Month · Acme · Cement": client and product by name, other filters as "Label: value".
  const filterSummary = shownDefs.filter((x) => active[x.key]).map((x) => {
    const v = x.control === 'select' ? selectList(x, opts).find((o) => o.value === active[x.key])?.label ?? active[x.key] : active[x.key];
    return x.key === 'client' || x.key === 'product' ? v : `${x.label}: ${v}`;
  });

  return (
    <div>
      <PageHeader title="Dashboard" description={['Financial overview', label, ...filterSummary].join(' · ')}
        actions={<>
          <button type="button" className="btn btn-secondary" onClick={() => setTick((t) => t + 1)} disabled={loading} aria-label="Refresh data"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span></button>
        </>} />

      <div role="group" aria-label="Dashboard filters" className="mb-5 flex flex-wrap items-center gap-2">
        <select aria-label="Date range" className="input !w-auto" value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {preset === 'custom' && <><input aria-label="Custom start date" type="date" className="input !w-auto" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} /><span className="text-fg-subtle" aria-hidden="true">–</span><input aria-label="Custom end date" type="date" className="input !w-auto" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} /></>}
        {shownDefs.map((x) => <FilterControl key={x.key} def={x} value={values[x.key] ?? ''} opts={opts} onChange={(v, now) => setValue(x.key, v, now)} />)}
        {dirty && <button type="button" className="btn btn-ghost" onClick={clear}><X size={14} aria-hidden="true" />Clear</button>}
      </div>

      {err && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">{err}</div>}
      {loading && !d ? <DashboardSkeleton /> : d && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <SummaryCards s={d.now} receivables={d.analytics.receivables} onOpenInvoices={openNow} />
          <div className="grid gap-4 lg:grid-cols-5"><DashboardAnalytics data={d.analytics} periodLabel={periodLabel} /></div>
          <CollectionsOverview data={d.overview} periodLabel={periodLabel} onOpenInvoices={openNow} onOpenPeriod={() => openNow(reportRange)} />
          <div className="grid gap-4 lg:grid-cols-5"><TrendChart data={d.trends} /><StatusChart data={d.dist} /></div>
          <div className="grid gap-4 lg:grid-cols-2"><TopClientsChart data={d.clients} /><TopProductsChart data={d.products} /></div>
          <RecentTransactions data={d.recent} />
        </div>)}
    </div>
  );
}
