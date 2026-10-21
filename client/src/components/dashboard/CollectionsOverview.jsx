import { useMemo, useRef, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { useStoredBool } from '../../utils/theme.js';
import AnalyticsModal from './AnalyticsModal.jsx';
import ChartCard from './ChartCard.jsx';

// Where an invoice stands today, using only stored fields (payment status, amounts, due date).
// Listed most urgent first; the same order is used by the squares and the legend.
const STATES = [
  { key: 'late3', label: 'Late over 60 days', color: 'var(--danger)' },
  { key: 'late2', label: 'Late 31–60 days', color: 'var(--aging-today)' },
  { key: 'late1', label: 'Late 1–30 days', color: 'var(--aging-month)' },
  { key: 'noDue', label: 'No due date', color: 'var(--aging-noDue)' },
  { key: 'waiting', label: 'Waiting, not due yet', color: 'var(--info)' },
  { key: 'paid', label: 'Paid', color: 'var(--success)' },
];
const BY_KEY = Object.fromEntries(STATES.map((s) => [s.key, s]));
const isLate = (state) => state.startsWith('late');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lateColor = (days) => (days > 60 ? BY_KEY.late3.color : days > 30 ? BY_KEY.late2.color : BY_KEY.late1.color);
const axis = { tickLine: false, axisLine: false, fontSize: 11, tick: { fill: 'var(--fg-subtle)' } };

// Plain-words description of one invoice, used by the line under the squares.
function describe(inv, showAmounts) {
  const when = isLate(inv.state) ? `${plural(inv.days_late, 'day')} late (due ${inv.due_date})` : inv.state === 'waiting' ? `due ${inv.due_date}` : inv.state === 'noDue' ? 'no due date' : 'paid';
  const money = showAmounts ? ` · ${inv.state === 'paid' ? peso(inv.amount) : `${peso(inv.outstanding)} still owed`}` : '';
  return `${inv.invoice_no} · ${inv.client_name} · ${when}${money}`;
}

function InvoiceSquares({ data, periodLabel, showAmounts, onOpenInvoices, onOpenPeriod }) {
  const [focus, setFocus] = useState(null); // a state key chosen from the legend
  const [active, setActive] = useState(null); // the square under the pointer or keyboard
  const grid = useRef(null);
  const { counts, invoices } = data;
  const late = counts.late1 + counts.late2 + counts.late3;
  const waiting = counts.waiting + counts.noDue;
  const when = /^\d/.test(periodLabel) ? `issued from ${periodLabel}` : periodLabel === 'All time' ? 'issued at any time' : 'in the selected period';

  // Arrow keys move between squares so the grid is one tab stop, not hundreds.
  const onKeyDown = (e) => {
    const items = [...grid.current.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = items.filter((b) => b.offsetTop === items[0].offsetTop).length || 1;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    let next = step == null ? null : i + step;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    if (next == null) return;
    e.preventDefault();
    items[Math.min(Math.max(next, 0), items.length - 1)]?.focus();
  };

  return (
    <ChartCard title="Every invoice at a glance" description={`One square is one invoice ${when}. Late means unpaid and past the due date, as of ${data.asOf}.`} data={invoices} className="lg:col-span-3">
      <p className="text-sm text-fg"><span className="num font-semibold">{late}</span> late · <span className="num font-semibold">{waiting}</span> still waiting · <span className="num font-semibold">{counts.paid}</span> paid</p>
      <div ref={grid} role="group" aria-label="Invoices, one square each. Use the arrow keys to move and Enter to open an invoice." onKeyDown={onKeyDown} className="mt-3 flex flex-wrap gap-1.5">
        {invoices.map((inv, i) => {
          const dim = focus && inv.state !== focus;
          return (
            <button key={inv.id} type="button" tabIndex={i === 0 ? 0 : -1} aria-label={describe(inv, false)} title={describe(inv, showAmounts)}
              onMouseEnter={() => setActive(inv)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(inv)} onBlur={() => setActive(null)}
              onClick={() => onOpenInvoices({ q: inv.invoice_no })}
              className={`h-6 w-6 rounded-md transition-[opacity,transform] duration-150 hover:scale-110 ${dim ? 'opacity-20' : ''}`} style={{ background: BY_KEY[inv.state].color }} />
          );
        })}
      </div>
      <p className="mt-3 min-h-[2.5rem] text-xs text-fg-muted" aria-live="polite">
        {active ? describe(active, showAmounts) : 'Hover or focus a square to see which invoice it is. Click it to open it in the invoice list.'}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Highlight invoices by status">
        {STATES.map((s) => {
          const n = counts[s.key], on = focus === s.key;
          return (
            <button key={s.key} type="button" disabled={!n} aria-pressed={on} onClick={() => setFocus(on ? null : s.key)}
              className={`inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[13px] transition-colors disabled:opacity-40 ${on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong bg-surface text-fg hover:bg-surface-2'}`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.label}<span className="num text-fg-muted">{n}</span>
            </button>
          );
        })}
      </div>
      {data.truncated && (
        <p className="mt-3 text-xs text-fg-subtle">Showing the {data.shown} most urgent of {data.total} invoices. <button type="button" className="font-medium text-brand-ink underline-offset-2 hover:underline" onClick={onOpenPeriod}>See all in Invoices</button></p>
      )}
    </ChartCard>
  );
}

function FollowUp({ data, showAmounts, onToggleAmounts }) {
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState(null);
  const clients = useMemo(() => {
    const map = new Map();
    data.invoices.filter((inv) => isLate(inv.state)).forEach((inv) => {
      const g = map.get(inv.client_name) || { name: inv.client_name, count: 0, days: 0, outstanding: 0, records: [] };
      g.count += 1; g.days = Math.max(g.days, inv.days_late); g.outstanding += inv.outstanding; g.records.push(inv);
      map.set(inv.client_name, g);
    });
    return [...map.values()].sort((a, b) => b.days - a.days || b.count - a.count);
  }, [data.invoices]);
  const longest = clients[0]?.days || 1;
  const shown = expanded ? clients : clients.slice(0, 5);

  return (
    <ChartCard title="Who to follow up with" description="Clients with late invoices, longest wait first. The bar shows how many days late." data={clients} className="lg:col-span-2"
      action={<button type="button" className="btn btn-secondary btn-sm shrink-0" aria-pressed={showAmounts} onClick={onToggleAmounts}>{showAmounts ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{showAmounts ? 'Hide amounts' : 'Show amounts'}</button>}>
      <ul className="-mx-2 space-y-0.5">
        {shown.map((c) => (
          <li key={c.name}>
            <button type="button" onClick={() => setModal({ title: `${c.name} · late invoices`, description: `Unpaid invoices past their due date, as of ${data.asOf}.`, records: c.records, range: `As of ${data.asOf}` })}
              aria-label={`${c.name}: ${plural(c.count, 'late invoice')}, longest ${plural(c.days, 'day')} late. Open details`}
              className="group w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-fg">{c.name}</span>
                <span className="shrink-0 text-xs text-fg-muted">{plural(c.days, 'day')} late{c.count > 1 ? ` · ${plural(c.count, 'invoice')}` : ''}</span>
              </span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2 group-hover:bg-surface-3"><span className="block h-full rounded-full" style={{ width: `${Math.max(6, Math.round((c.days / longest) * 100))}%`, background: lateColor(c.days) }} /></span>
              {showAmounts && <span className="num mt-1 block text-xs text-fg-muted">{peso(c.outstanding)} still owed</span>}
            </button>
          </li>
        ))}
      </ul>
      {clients.length > 5 && (
        <button type="button" className="btn btn-ghost btn-sm mt-2" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}{expanded ? 'Show fewer' : `Show all ${clients.length} clients`}
        </button>
      )}
      {modal && <AnalyticsModal {...modal} onClose={() => setModal(null)} />}
    </ChartCard>
  );
}

// Empty state for the follow-up card when nobody is late (ChartCard would say "No data").
function NobodyLate({ asOf }) {
  return (
    <section className="card card-pad flex min-w-0 flex-col lg:col-span-2">
      <h2 className="section-title">Who to follow up with</h2>
      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success-ink"><CheckCircle2 size={20} aria-hidden="true" /></span>
        <p className="text-sm font-medium text-fg">Nobody is late</p>
        <p className="mt-1 max-w-xs text-sm text-fg-muted">No unpaid invoice is past its due date as of {asOf}.</p>
      </div>
    </section>
  );
}

const MonthTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-lg bg-tooltip px-3 py-2 text-xs text-tooltip-fg shadow-pop">
      <p className="mb-1 font-semibold">{m.label} {m.dateFrom.slice(0, 4)} · {plural(m.total, 'invoice')}</p>
      {[...STATES].reverse().filter((s) => m[s.key] > 0).map((s) => (
        <p key={s.key} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" /><span className="opacity-80">{s.label}</span><span className="num ml-auto pl-4 font-medium">{m[s.key]}</span></p>
      ))}
      <p className="mt-1.5 opacity-70">Click to view these invoices</p>
    </div>
  );
};

function MonthlyStatus({ data, onOpenInvoices }) {
  const months = data.months;
  const open = (m) => m && m.total > 0 && onOpenInvoices({ dateFrom: m.dateFrom, dateTo: m.dateTo });
  const stack = [...STATES].reverse(); // paid at the bottom, the most urgent on top
  return (
    <ChartCard title="Where each month's invoices stand today" description="Share of the invoices issued in each month that are paid, waiting or late. Recent months look less complete because newer invoices are not due yet." data={months.some((m) => m.total > 0) ? months : []} className="lg:col-span-3">
      <div className="h-[220px] cursor-pointer" role="img" aria-label="Stacked bar chart of the last six months. Each bar shows the share of that month's invoices that are paid, waiting or late. Click a month to see its invoices.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} stackOffset="expand" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="label" {...axis} />
            <YAxis hide domain={[0, 1]} />
            <Tooltip content={<MonthTooltip />} cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }} />
            {stack.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId="status" fill={s.color} stroke="var(--surface)" strokeWidth={1.5} maxBarSize={56} onClick={(d) => open(d?.payload)} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-muted" aria-label="Legend">
        {STATES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.label}</span>)}
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Open a month's invoices">
        {months.map((m) => <button key={m.key} type="button" disabled={!m.total} onClick={() => open(m)} className="btn btn-secondary btn-sm shrink-0"><span>{m.label}</span><ArrowUpRight size={12} aria-hidden="true" /></button>)}
      </div>
    </ChartCard>
  );
}

// Row 1: every invoice + the unpaid-by-due-date card passed in by the page. Row 2: follow-up list + monthly status.
export default function CollectionsOverview({ data, periodLabel, onOpenInvoices, onOpenPeriod, unpaidCard = null }) {
  const [showAmounts, setShowAmounts] = useStoredBool('dashboard-show-amounts', false);
  if (!data) return null;
  const anyLate = data.counts.late1 + data.counts.late2 + data.counts.late3 > 0;
  return <>
    <div className="grid gap-4 lg:grid-cols-5">
      <InvoiceSquares data={data} periodLabel={periodLabel} showAmounts={showAmounts} onOpenInvoices={onOpenInvoices} onOpenPeriod={onOpenPeriod} />
      {unpaidCard}
    </div>
    <div className="grid gap-4 lg:grid-cols-5">
      {anyLate ? <FollowUp data={data} showAmounts={showAmounts} onToggleAmounts={() => setShowAmounts((v) => !v)} /> : <NobodyLate asOf={data.asOf} />}
      <MonthlyStatus data={data} onOpenInvoices={onOpenInvoices} />
    </div>
  </>;
}
