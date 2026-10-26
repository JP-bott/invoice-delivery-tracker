import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, FileText, Hourglass, Truck } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { HoverCard } from '../ui.jsx';
import AnalyticsModal from './AnalyticsModal.jsx';

const TONES = {
  brand: 'bg-brand-soft text-brand-ink', success: 'bg-success-soft text-success-ink', warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink', neutral: 'bg-surface-2 text-fg-muted',
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Counts answer "how many"; peso amounts live in the hover card and in the invoice list a click opens.
function Kpi({ label, count, caption, icon: Icon, tone, tip, onClick, action = 'View invoices' }) {
  const card = (
    <div className="card card-pad card-interactive group relative min-w-0 text-left">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}><Icon size={16} aria-hidden="true" /></span>
      </div>
      <p className="num mt-2 text-3xl font-semibold tracking-tight text-fg">{count}</p>
      <p className="mt-1 text-xs text-fg-subtle">{caption}</p>
      <span className="mt-2 flex h-4 items-center gap-0.5 text-xs font-medium text-brand-ink opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">{action}<ArrowUpRight size={12} aria-hidden="true" /></span>
      <button type="button" className="absolute inset-0 rounded-xl" onClick={onClick} aria-label={`${label}: ${count}. ${action}`} />
    </div>
  );
  return <HoverCard className="block w-full" width="w-72" side="bottom" content={tip}>{card}</HoverCard>;
}

const ClientLines = ({ clients }) => (
  <span className="mt-1.5 block space-y-0.5 opacity-90">
    {clients.slice(0, 4).map((c) => <span className="flex justify-between gap-3" key={c.name}><span className="truncate">{c.name}</span><span className="num shrink-0">{plural(c.count, 'invoice')} · {peso(c.outstanding)}</span></span>)}
    {clients.length > 4 && <span className="block opacity-70">+ {clients.length - 4} more · click to view all</span>}
  </span>
);

export default function SummaryCards({ s, receivables, onOpenInvoices }) {
  const [modal, setModal] = useState(null);
  const view = useMemo(() => {
    const cats = receivables?.categories || [];
    const overdue = cats.find((c) => c.key === 'overdue') || { count: 0, amount: 0, clients: [], records: [] };
    const merged = {};
    cats.forEach((c) => c.clients.forEach((cl) => { merged[cl.name] = { name: cl.name, count: (merged[cl.name]?.count || 0) + cl.count, outstanding: (merged[cl.name]?.outstanding || 0) + cl.outstanding }; }));
    const pendingRecords = cats.flatMap((c) => c.records).sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')));
    return {
      overdue,
      pending: { count: cats.reduce((n, c) => n + c.count, 0), amount: receivables?.total || 0, clients: Object.values(merged).sort((a, b) => b.outstanding - a.outstanding), records: pendingRecords },
    };
  }, [receivables]);
  const asOf = receivables?.asOf;
  const { overdue, pending } = view;

  return (
    <section aria-label="Invoices as of today" className="space-y-2">
      <p className="text-xs text-fg-muted"><span className="eyebrow mr-2">As of today</span>These counts are not affected by the date range. Hover a card for amounts, click to see the invoices.</p>
      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Total Invoices" count={s.totalInvoices} caption="Excluding cancelled" icon={FileText} tone="brand" onClick={() => onOpenInvoices({})} action="View all invoices"
          tip={<><p className="font-semibold">{plural(s.totalInvoices, 'invoice')}</p><span className="num mt-1 block space-y-0.5 opacity-90"><span className="flex justify-between"><span>Total value</span><span>{peso(s.totalValue)}</span></span><span className="flex justify-between"><span>Collected</span><span>{peso(s.totalCollected)}</span></span><span className="flex justify-between"><span>Outstanding</span><span>{peso(s.outstandingBalance)}</span></span></span></>} />
        <Kpi label="Pending Payments" count={pending.count} caption="Pending or partially paid" icon={Hourglass} tone="warning"
          onClick={() => setModal({ title: 'Pending payments', description: `Invoices with a balance still owed, as of ${asOf}.`, records: pending.records, range: `As of ${asOf}` })}
          tip={pending.count ? <><p className="font-semibold">{peso(pending.amount)} still owed · {plural(pending.clients.length, 'client')}</p><ClientLines clients={pending.clients} /></> : <p>No pending payments.</p>} />
        <Kpi label="Overdue" count={overdue.count} caption="Unpaid and past the due date" icon={AlertTriangle} tone={overdue.count ? 'danger' : 'neutral'}
          onClick={() => overdue.count && setModal({ title: 'Overdue invoices', description: `Unpaid invoices past their due date, as of ${asOf}.`, records: overdue.records, range: `As of ${asOf}` })}
          tip={overdue.count ? <><p className="font-semibold">{peso(overdue.amount)} overdue · {plural(overdue.clients.length, 'client')}</p><ClientLines clients={overdue.clients} /></> : <p>Nothing is overdue. Invoices without a delivery date are not counted.</p>} />
        <Kpi label="Delivered" count={s.deliveredOrders} caption="Have a delivery date" icon={Truck} tone="success" onClick={() => onOpenInvoices({ deliveryStatus: 'Delivered' })} action="View delivered" />
        <Kpi label="Pending Deliveries" count={s.pendingDeliveries} caption="No delivery date yet" icon={Clock3} tone="warning" onClick={() => onOpenInvoices({ deliveryStatus: 'Pending' })} action="View pending" />
      </div>
      {modal && <AnalyticsModal {...modal} onClose={() => setModal(null)} />}
    </section>
  );
}
