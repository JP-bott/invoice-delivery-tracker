import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../utils/api.js';
import { range } from '../utils/dates.js';
import { PRESETS } from '../utils/constants.js';
import SummaryCards from '../components/dashboard/SummaryCards.jsx';
import RecentTransactions from '../components/dashboard/RecentTransactions.jsx';
import { InvoiceStatusChart, StatusChart, TopClientsChart, TopProductsChart, TrendChart } from '../components/dashboard/Charts.jsx';
import DashboardAnalytics from '../components/dashboard/DashboardAnalytics.jsx';

const sel = 'rounded-lg border border-slate-300 px-2 py-1.5 text-sm';
const ENDPOINTS = ['summary', 'invoice-trends', 'payment-distribution', 'invoice-status', 'analytics', 'top-clients', 'top-products', 'delivery-summary', 'recent-invoices'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState(''), [customTo, setCustomTo] = useState('');
  const [client, setClient] = useState(''), [product, setProduct] = useState('');
  const [opts, setOpts] = useState({ clients: [], products: [] });
  const [d, setD] = useState(null), [loading, setLoading] = useState(true), [err, setErr] = useState('');

  useEffect(() => { Promise.all([api('/api/filters/clients'), api('/api/filters/products')]).then(([clients, products]) => setOpts({ clients, products })).catch(() => {}); }, []);
  useEffect(() => {
    const reportRange = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : range(preset);
    const q = qs({ ...reportRange, client, product });
    setLoading(true);
    Promise.all(ENDPOINTS.map((n) => api(`/api/dashboard/${n}?${q}`)))
      .then(([summary, trends, dist, status, analytics, clients, products, delivery, recent]) => { setD({ summary, trends, dist, status, analytics, clients, products, delivery, recent }); setErr(''); })
      .catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [preset, customFrom, customTo, client, product]);
  const reportRange = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : range(preset);
  const openInvoices = (extra = {}) => navigate(`/invoices?${qs({ ...reportRange, client, product, ...extra })}`);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Date range" className={sel} value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {preset === 'custom' && <><input aria-label="Custom start date" type="date" className={sel} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /><input aria-label="Custom end date" type="date" className={sel} value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></>}
        <select aria-label="Client" className={sel} value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{opts.clients.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Product or service" className={sel} value={product} onChange={(e) => setProduct(e.target.value)}><option value="">All products</option>{opts.products.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="text-sm text-indigo-600" onClick={() => { setPreset('month'); setClient(''); setProduct(''); }}>Clear</button>
      </div>
      {err && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && !d ? <p className="text-slate-500">Loading…</p> : d && (<>
        <SummaryCards s={d.summary} onOpenInvoices={openInvoices} />
        <DashboardAnalytics data={d.analytics} />
        <div className="grid gap-4 lg:grid-cols-2">
          <InvoiceStatusChart data={d.status} onOpenInvoices={openInvoices} /><TrendChart data={d.trends} /><StatusChart data={d.dist} /><TopClientsChart data={d.clients} /><TopProductsChart data={d.products} />
        </div>
        <RecentTransactions data={d.recent} />
      </>)}
    </div>
  );
}
