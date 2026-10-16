import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, CalendarClock, CircleAlert, Clock3 } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { STATUS_COLORS } from '../../utils/constants.js';
import ChartCard from './ChartCard.jsx';

const INVOICE_STATUS = [
  { key: 'overdue', label: 'Overdue', color: '#ef4444', icon: CircleAlert, query: (data) => ({ dateFrom: '1900-01-01', dateTo: data.start, paymentStatus: 'unpaid' }) },
  { key: 'dueMonth', label: 'Due this month', color: '#f59e0b', icon: CalendarClock, query: (data) => ({ dateFrom: data.start, dateTo: data.end, paymentStatus: 'unpaid' }) },
  { key: 'incoming', label: 'Incoming', color: '#0ea5e9', icon: Clock3, query: (data) => ({ dateFrom: data.end, dateTo: '2999-12-31', paymentStatus: 'unpaid' }) },
];

export const InvoiceStatusChart = ({ data, onOpenInvoices }) => {
  const chartData = data && INVOICE_STATUS.map(({ key, label, color }) => ({ name: label, value: data.buckets[key].value, count: data.buckets[key].count, color }));
  return (
    <ChartCard title="Invoice pulse" data={chartData}>
      <div className="grid gap-4 md:grid-cols-[190px_1fr] md:items-center">
        <div className="relative h-[190px]">
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={4} stroke="none"><Cell fill="#ef4444" /><Cell fill="#f59e0b" /><Cell fill="#0ea5e9" /></Pie><Tooltip formatter={(value) => peso(value)} /></PieChart></ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Outstanding</span><strong className="mt-1 text-lg text-slate-900">{peso(data?.total || 0)}</strong></div>
        </div>
        <div className="space-y-2">
          {INVOICE_STATUS.map(({ key, label, color, icon: Icon, query }) => {
            const bucket = data.buckets[key];
            return <button key={key} type="button" onClick={() => onOpenInvoices(query(data))} className="group flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50" aria-label={`View ${label} invoices`}>
              <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-md" style={{ color, backgroundColor: `${color}18` }}><Icon size={15} /></span><span><span className="block text-xs font-medium text-slate-600">{label}</span><span className="block text-[11px] text-slate-400">{bucket.count} invoice{bucket.count === 1 ? '' : 's'}</span></span></span>
              <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">{peso(bucket.value)}<ArrowUpRight size={14} className="text-slate-300 transition group-hover:text-slate-600" /></span>
            </button>;
          })}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Based on unpaid invoices and their issue date.</p>
    </ChartCard>
  );
};

export const TrendChart = ({ data }) => (
  <ChartCard title="Invoice Value Over Time" data={data}>
    <ResponsiveContainer width="100%" height={240}><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => peso(v)} /><Area dataKey="value" stroke="#4f46e5" fill="#e0e7ff" /></AreaChart></ResponsiveContainer>
  </ChartCard>
);

export const StatusChart = ({ data }) => (
  <ChartCard title="Payment Status Distribution" data={data}>
    <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={data} dataKey="count" nameKey="status" innerRadius={55} outerRadius={85} label={({ percent }) => `${Math.round(percent * 100)}%`}>{data.map((x) => <Cell key={x.status} fill={STATUS_COLORS[x.status]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
  </ChartCard>
);

export const TopClientsChart = ({ data }) => (
  <ChartCard title="Top Clients" data={data}>
    <ResponsiveContainer width="100%" height={260}><BarChart data={data} layout="vertical"><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" width={110} fontSize={11} /><Tooltip formatter={(v) => peso(v)} /><Bar dataKey="value" fill="#4f46e5" /></BarChart></ResponsiveContainer>
  </ChartCard>
);

export const TopProductsChart = ({ data }) => (
  <ChartCard title="Top Products/Services" data={data}>
    <ResponsiveContainer width="100%" height={260}><BarChart data={data}><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => peso(v)} /><Bar dataKey="value" fill="#4f46e5" /></BarChart></ResponsiveContainer>
  </ChartCard>
);
