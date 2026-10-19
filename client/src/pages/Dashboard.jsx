import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, X } from 'lucide-react';
import { api, qs } from '../utils/api.js';
import { range } from '../utils/dates.js';
import { PRESETS } from '../utils/constants.js';
import SummaryCards from '../components/dashboard/SummaryCards.jsx';
import RecentTransactions from '../components/dashboard/RecentTransactions.jsx';
import { StatusChart, TopClientsChart, TopProductsChart, TrendChart } from '../components/dashboard/Charts.jsx';
import DashboardAnalytics from '../components/dashboard/DashboardAnalytics.jsx';
import { PageHeader, Skeleton } from '../components/ui.jsx';

const ENDPOINTS = ['summary', 'invoice-trends', 'payment-distribution', 'analytics', 'top-clients', 'top-products', 'delivery-summary', 'recent-invoices'];

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px]" />)}</div>
      <div className="grid gap-3 min-[520px]:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[80px]" />)}</div>
      <div className="grid gap-4 lg:grid-cols-5"><Skeleton className="h-[400px] lg:col-span-3" /><Skeleton className="h-[400px] lg:col-span-2" /></div>
      <Skeleton className="h-72" />
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState(''), [customTo, setCustomTo] = useState('');
  const [client, setClient] = useState(''), [product, setProduct] = useState('');
  const [opts, setOpts] = useState({ clients: [], products: [] });
  const [d, setD] = useState(null), [loading, setLoading] = useState(true), [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => { Promise.all([api('/api/filters/clients'), api('/api/filters/products')]).then(([clients, products]) => setOpts({ clients, products })).catch(() => {}); }, [tick]);
  useEffect(() => {
    const reportRange = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : range(preset);
    const q = qs({ ...reportRange, client, product });
    let live = true;
    setLoading(true);
    Promise.all(ENDPOINTS.map((n) => api(`/api/dashboard/${n}?${q}`)))
      .then(([summary, trends, dist, analytics, clients, products, delivery, recent]) => { if (live) { setD({ summary, trends, dist, analytics, clients, products, delivery, recent }); setErr(''); } })
      .catch((e) => live && setErr(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [preset, customFrom, customTo, client, product, tick]);

  const reportRange = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : range(preset);
  const openInvoices = (extra = {}) => navigate(`/invoices?${qs({ ...reportRange, client, product, ...extra })}`);
  const label = PRESETS.find(([v]) => v === preset)?.[1];
  const periodLabel = useMemo(() => (reportRange.dateFrom && reportRange.dateTo ? `${reportRange.dateFrom} to ${reportRange.dateTo}` : preset === 'all' ? 'All time' : 'Choose a start and end date'), [reportRange.dateFrom, reportRange.dateTo, preset]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = preset !== 'month' || client || product;
  const clear = () => { setPreset('month'); setCustomFrom(''); setCustomTo(''); setClient(''); setProduct(''); };

  return (
    <div>
      <PageHeader title="Dashboard" description={`Financial overview · ${label}${client ? ` · ${client}` : ''}${product ? ` · ${product}` : ''}`}
        actions={<>
          <button type="button" className="btn btn-secondary" onClick={() => setTick((t) => t + 1)} disabled={loading} aria-label="Refresh data"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span></button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/invoices?new=1')}><Plus size={16} aria-hidden="true" />Add Invoice</button>
        </>} />

      <div role="group" aria-label="Dashboard filters" className="mb-5 flex flex-wrap items-center gap-2">
        <select aria-label="Date range" className="input !w-auto" value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {preset === 'custom' && <><input aria-label="Custom start date" type="date" className="input !w-auto" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} /><span className="text-fg-subtle" aria-hidden="true">–</span><input aria-label="Custom end date" type="date" className="input !w-auto" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} /></>}
        <select aria-label="Client" className="input !w-auto max-w-[12rem]" value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{opts.clients.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Product or service" className="input !w-auto max-w-[12rem]" value={product} onChange={(e) => setProduct(e.target.value)}><option value="">All products</option>{opts.products.map((c) => <option key={c}>{c}</option>)}</select>
        {dirty && <button type="button" className="btn btn-ghost" onClick={clear}><X size={14} aria-hidden="true" />Clear</button>}
      </div>

      {err && <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">{err}</div>}
      {loading && !d ? <DashboardSkeleton /> : d && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <SummaryCards s={d.summary} onOpenInvoices={openInvoices} />
          <div className="grid gap-4 lg:grid-cols-5"><DashboardAnalytics data={d.analytics} periodLabel={periodLabel} /></div>
          <div className="grid gap-4 lg:grid-cols-5"><TrendChart data={d.trends} /><StatusChart data={d.dist} /></div>
          <div className="grid gap-4 lg:grid-cols-2"><TopClientsChart data={d.clients} /><TopProductsChart data={d.products} /></div>
          <RecentTransactions data={d.recent} />
        </div>)}
    </div>
  );
}
