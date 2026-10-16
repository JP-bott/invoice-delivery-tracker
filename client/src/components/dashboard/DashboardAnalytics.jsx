import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, CalendarClock, CalendarDays, CircleAlert, Clock3, HandCoins, ReceiptText } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { AGING_COLORS } from '../../utils/constants.js';
import { EmptyState, HoverCard } from '../ui.jsx';
import AnalyticsModal from './AnalyticsModal.jsx';
import { pesoShort } from './Charts.jsx';

const ICONS = { overdue: CircleAlert, today: Clock3, week: CalendarClock, month: CalendarDays, next30: CalendarClock, upcoming: ArrowUpRight, noDue: ReceiptText };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const RevenueTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = (key, name, color) => { const p = payload.find((x) => x.dataKey === key); return p && <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" /><span className="opacity-80">{name}</span><span className="num ml-auto pl-4 font-medium">{peso(p.value || 0)}</span></p>; };
  return <div className="rounded-lg bg-tooltip px-3 py-2 text-xs text-tooltip-fg shadow-pop"><p className="mb-1 font-semibold">{label}</p>{row('value', 'Collected', 'var(--chart-2)')}{row('comparison', 'Previous period', 'var(--chart-muted)')}<p className="mt-1.5 opacity-70">Click to view records</p></div>;
};

export default function DashboardAnalytics({ data, periodLabel }) {
  const [modal, setModal] = useState(null);
  if (!data) return null;
  const { revenue, receivables } = data;
  const categories = receivables.categories;
  const invoiceCount = categories.reduce((n, c) => n + c.count, 0);
  const chartData = categories.filter((c) => c.amount > 0).map((c) => ({ ...c, value: c.amount }));
  const hasRevenue = revenue.months.some((m) => m.value > 0 || m.comparison > 0);

  const openCategory = (category) => category && setModal({ title: `${category.label} invoices`, description: `Unpaid balances as of ${receivables.asOf}`, records: category.records, range: `As of ${receivables.asOf}` });
  const openRevenue = (month) => month && setModal({ title: `Collected revenue · ${month.label} ${month.key.slice(0, 4)}`, description: 'Payment dates are not stored, so collections are grouped by invoice issue date.', records: revenue.records.filter((row) => row.date_issued.slice(0, 7) === month.key), amountKey: 'amount_paid', amountLabel: 'Collected', range: `${month.label} ${month.key.slice(0, 4)} · grouped by issue date` });
  // Recharts 3 reports the hovered point as an index on the chart state.
  const onRevenueClick = (state) => { const i = Number(state?.activeTooltipIndex ?? state?.activeIndex); if (Number.isInteger(i)) openRevenue(revenue.months[i]); };

  return <>
    <section className="card card-pad flex min-w-0 flex-col lg:col-span-3" aria-labelledby="rev-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow" id="rev-h">Collected revenue</p>
          <p className="num mt-1 text-3xl font-semibold tracking-tight text-fg">{peso(revenue.total)}</p>
          <p className="mt-1 text-xs text-fg-muted">{periodLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-xs text-fg-muted">
          <span className="badge badge-info" title="The database does not store payment dates, so collected amounts are grouped by invoice issue month.">{revenue.proxy ? 'Grouped by issue date' : 'Payment records'}</span>
          <span className="flex items-center gap-3"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--chart-2)]" aria-hidden="true" />Collected</span><span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[var(--chart-muted)]" aria-hidden="true" />Previous period</span></span>
        </div>
      </div>
      {hasRevenue ? <>
        <div className="mt-4 min-h-[260px] w-full flex-1 cursor-pointer" role="img" aria-label="Area chart of collected revenue by month. Click a month to see its records.">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenue.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={onRevenueClick}>
              <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: 'var(--fg-subtle)' }} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={52} tick={{ fill: 'var(--fg-subtle)' }} tickFormatter={pesoShort} />
              <Tooltip content={<RevenueTooltip />} cursor={{ stroke: 'var(--line-strong)' }} />
              <Area type="monotone" dataKey="comparison" name="Previous period" stroke="var(--chart-muted)" strokeWidth={2} strokeDasharray="5 5" fill="none" activeDot={false} />
              <Area type="monotone" dataKey="value" name="Collected" stroke="var(--chart-2)" strokeWidth={2.5} fill="url(#revenueFill)" activeDot={{ r: 5, fill: 'var(--chart-2)', stroke: 'var(--surface)', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Open collected revenue by month">
          {revenue.months.map((m) => <button key={m.key} type="button" onClick={() => openRevenue(m)} className="btn btn-secondary btn-sm shrink-0"><span>{m.label}</span><span className="num text-fg-muted">{pesoShort(m.value)}</span></button>)}
        </div>
      </> : <EmptyState icon={HandCoins} title="No collections in this period" description="Record a payment on an invoice, or choose a wider date range." />}
    </section>

    <section className="card card-pad min-w-0 lg:col-span-2" aria-labelledby="rec-h">
      <div className="flex items-start justify-between gap-3">
        <div><p className="eyebrow" id="rec-h">Outstanding receivables</p><p className="num mt-1 text-3xl font-semibold tracking-tight text-fg">{peso(receivables.total)}</p><p className="mt-1 text-xs text-fg-muted">Unpaid balances as of {receivables.asOf}</p></div>
        <span className="badge badge-neutral">{plural(invoiceCount, 'invoice')}</span>
      </div>
      {chartData.length ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center lg:grid-cols-1 2xl:grid-cols-[170px_1fr]">
          <div className="relative mx-auto h-[170px] w-[170px]" role="img" aria-label="Doughnut chart of outstanding balance by due-date bucket">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={54} outerRadius={82} paddingAngle={2} stroke="var(--surface)" strokeWidth={2} cursor="pointer" onClick={(_, index) => openCategory(chartData[index] && categories.find((c) => c.key === chartData[index].key))}>
                  {chartData.map((c) => <Cell key={c.key} fill={AGING_COLORS[c.key]} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg bg-tooltip px-3 py-2 text-xs text-tooltip-fg shadow-pop"><p className="font-semibold">{payload[0].payload.label}</p><p className="num mt-0.5">{peso(payload[0].value)} · {plural(payload[0].payload.count, 'invoice')}</p></div> : null} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="eyebrow">Balance</span><strong className="num mt-0.5 text-base text-fg">{pesoShort(receivables.total)}</strong></div>
          </div>
          <ul className="space-y-1">
            {categories.map((c) => {
              const Icon = ICONS[c.key], color = AGING_COLORS[c.key], empty = c.count === 0;
              const tip = <><p className="font-semibold">{c.label} · {plural(c.clients.length, 'client')}</p><span className="mt-1 block space-y-0.5 opacity-90">{c.clients.slice(0, 5).map((cl) => <span className="flex justify-between gap-3" key={cl.name}><span className="truncate">{cl.name}</span><span className="num shrink-0">{plural(cl.count, 'inv.')} · {peso(cl.outstanding)}</span></span>)}{c.clients.length > 5 && <span className="block opacity-70">+ {c.clients.length - 5} more · click to view all</span>}</span></>;
              const button = (
                <button type="button" disabled={empty} onClick={() => openCategory(c)} aria-label={`${c.label}: ${plural(c.count, 'invoice')}, ${peso(c.amount)}. Open details`}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}><Icon size={14} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-fg">{c.label}</span><span className="block text-[11px] text-fg-subtle">{plural(c.count, 'invoice')} · {plural(c.clients.length, 'client')}</span></span>
                  <span className="num shrink-0 text-[13px] font-semibold text-fg">{peso(c.amount)}</span>
                </button>);
              return <li key={c.key}>{empty ? button : <HoverCard className="block w-full" width="w-72" content={tip}>{button}</HoverCard>}</li>;
            })}
          </ul>
        </div>
      ) : <EmptyState icon={HandCoins} title="Nothing outstanding" description="All invoices matching these filters are fully paid." />}
    </section>
    {modal && <AnalyticsModal {...modal} onClose={() => setModal(null)} />}
  </>;
}
