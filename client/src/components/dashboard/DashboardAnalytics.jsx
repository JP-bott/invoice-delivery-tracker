import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowUpRight, CalendarClock, CalendarDays, CircleAlert, Clock3, HandCoins, ReceiptText } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { AGING_COLORS } from '../../utils/constants.js';
import { EmptyState, HoverCard } from '../ui.jsx';
import AnalyticsModal from './AnalyticsModal.jsx';

const ICONS = { overdue: CircleAlert, today: Clock3, week: CalendarClock, month: CalendarDays, next30: CalendarClock, upcoming: ArrowUpRight, noDue: ReceiptText };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DashboardAnalytics({ data }) {
  const [modal, setModal] = useState(null);
  if (!data) return null;
  const { receivables } = data;
  const categories = receivables.categories;
  const invoiceCount = categories.reduce((n, c) => n + c.count, 0);
  const chartData = categories.filter((c) => c.count > 0).map((c) => ({ ...c, value: c.count }));

  const openCategory = (category) => category && setModal({ title: `${category.label} invoices`, description: `Unpaid balances as of ${receivables.asOf}`, records: category.records, range: `As of ${receivables.asOf}` });
  return <>
    <section className="card card-pad min-w-0 lg:col-span-2" aria-labelledby="rec-h">
      <div className="flex items-start justify-between gap-3">
        <div><p className="eyebrow" id="rec-h">Unpaid invoices by due date</p><p className="num mt-1 text-3xl font-semibold tracking-tight text-fg">{invoiceCount}</p><p className="mt-1 text-xs text-fg-muted">As of {receivables.asOf} · hover a row for amounts, click for the invoices</p></div>
      </div>
      {chartData.length ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center lg:grid-cols-1 2xl:grid-cols-[170px_1fr]">
          <div className="relative mx-auto h-[170px] w-[170px]" role="img" aria-label="Doughnut chart of unpaid invoice counts by due-date bucket">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={54} outerRadius={82} paddingAngle={2} stroke="var(--surface)" strokeWidth={2} cursor="pointer" onClick={(_, index) => openCategory(chartData[index] && categories.find((c) => c.key === chartData[index].key))}>
                  {chartData.map((c) => <Cell key={c.key} fill={AGING_COLORS[c.key]} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg bg-tooltip px-3 py-2 text-xs text-tooltip-fg shadow-pop"><p className="font-semibold">{payload[0].payload.label}</p><p className="num mt-0.5">{plural(payload[0].payload.count, 'invoice')} · {peso(payload[0].payload.amount)}</p></div> : null} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="eyebrow">Unpaid</span><strong className="num mt-0.5 text-2xl text-fg">{invoiceCount}</strong></div>
          </div>
          <ul className="space-y-1">
            {categories.map((c) => {
              const Icon = ICONS[c.key], color = AGING_COLORS[c.key], empty = c.count === 0;
              const tip = <><p className="font-semibold">{c.label} · {plural(c.count, 'invoice')} · {peso(c.amount)}</p><span className="mt-1 block space-y-0.5 opacity-90">{c.clients.slice(0, 5).map((cl) => <span className="flex justify-between gap-3" key={cl.name}><span className="truncate">{cl.name}</span><span className="num shrink-0">{plural(cl.count, 'invoice')} · {peso(cl.outstanding)}</span></span>)}{c.clients.length > 5 && <span className="block opacity-70">+ {c.clients.length - 5} more · click to view all</span>}</span></>;
              const button = (
                <button type="button" disabled={empty} onClick={() => openCategory(c)} aria-label={`${c.label}: ${plural(c.count, 'invoice')}. Open details`}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}><Icon size={14} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-fg">{c.label}</span><span className="block text-[11px] text-fg-subtle">{plural(c.clients.length, 'client')}</span></span>
                  <span className="num shrink-0 text-lg font-semibold text-fg">{c.count}</span>
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
