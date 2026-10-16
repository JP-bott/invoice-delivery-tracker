import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { peso } from '../../utils/api.js';
import { STATUS_COLORS } from '../../utils/constants.js';
import ChartCard, { ChartTooltip } from './ChartCard.jsx';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const pesoShort = (v) => `₱${compact.format(v)}`;
const axis = { tickLine: false, axisLine: false, fontSize: 11, tick: { fill: 'var(--fg-subtle)' } };
const trunc = (s, n = 16) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : s);

export const TrendChart = ({ data }) => (
  <ChartCard title="Invoice value over time" description="Total invoiced amount by issue date" data={data} className="lg:col-span-3">
    <div className="h-[260px]" role="img" aria-label="Area chart of invoice value over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis dataKey="period" {...axis} minTickGap={24} />
          <YAxis {...axis} width={52} tickFormatter={pesoShort} />
          <Tooltip content={<ChartTooltip format={peso} />} cursor={{ stroke: 'var(--line-strong)' }} />
          <Area type="monotone" dataKey="value" name="Invoiced" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#trendFill)" activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </ChartCard>
);

export const StatusChart = ({ data }) => {
  const total = (data || []).reduce((n, x) => n + x.count, 0);
  return (
    <ChartCard title="Payment status" description="Share of invoices by status" data={data} className="lg:col-span-2">
      <div className="grid items-center gap-4 sm:grid-cols-[170px_1fr] lg:grid-cols-1 2xl:grid-cols-[170px_1fr]">
        <div className="relative mx-auto h-[170px] w-[170px]" role="img" aria-label="Doughnut chart of invoices by payment status">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="count" nameKey="status" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                {data.map((x) => <Cell key={x.status} fill={STATUS_COLORS[x.status]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip labelKey="status" format={(v) => `${v} invoice${v === 1 ? '' : 's'}`} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="num text-2xl font-semibold text-fg">{total}</span><span className="eyebrow">Invoices</span></div>
        </div>
        <ul className="space-y-1.5">
          {data.map((x) => (
            <li key={x.status} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: STATUS_COLORS[x.status] }} aria-hidden="true" />
              <span className="text-fg-muted">{x.status}</span>
              <span className="num ml-auto font-medium text-fg">{x.count}</span>
              <span className="num w-10 text-right text-xs text-fg-subtle">{total ? Math.round((x.count / total) * 100) : 0}%</span>
            </li>))}
        </ul>
      </div>
    </ChartCard>
  );
};

export const TopClientsChart = ({ data }) => (
  <ChartCard title="Top clients" description="By invoiced value" data={data} className="lg:col-span-1">
    <div className="h-[280px]" role="img" aria-label="Bar chart of top clients by invoiced value">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis type="number" {...axis} tickFormatter={pesoShort} />
          <YAxis type="category" dataKey="name" width={118} {...axis} tickFormatter={(v) => trunc(v)} />
          <Tooltip content={<ChartTooltip labelKey="name" format={peso} />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="value" name="Invoiced" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </ChartCard>
);

export const TopProductsChart = ({ data }) => (
  <ChartCard title="Top products & services" description="By invoiced value" data={data} className="lg:col-span-1">
    <div className="h-[280px]" role="img" aria-label="Bar chart of top products and services by invoiced value">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis dataKey="name" {...axis} interval={0} tickFormatter={(v) => trunc(v, 9)} />
          <YAxis {...axis} width={52} tickFormatter={pesoShort} />
          <Tooltip content={<ChartTooltip labelKey="name" format={peso} />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="value" name="Invoiced" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </ChartCard>
);
