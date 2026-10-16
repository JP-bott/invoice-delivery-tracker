import { ArrowUpRight, Banknote, CheckCircle2, Clock3, FileText, Hourglass, Truck, Wallet } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { InfoTip } from '../ui.jsx';

const TONES = {
  brand: 'bg-brand-soft text-brand-ink', success: 'bg-success-soft text-success-ink', warning: 'bg-warning-soft text-warning-ink',
  info: 'bg-info-soft text-info-ink', neutral: 'bg-surface-2 text-fg-muted',
};

function Kpi({ label, value, icon: Icon, tone, hint, onClick, size = 'lg', openLabel }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">{label}{hint && <span className="relative z-10"><InfoTip text={hint} label={`How ${label} is calculated`} /></span>}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}><Icon size={16} aria-hidden="true" /></span>
      </div>
      <p className={`num mt-2 truncate font-semibold tracking-tight text-fg ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>{value}</p>
      {onClick && <span className="mt-1 flex items-center gap-0.5 text-xs font-medium text-brand-ink opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">{openLabel || 'View invoices'}<ArrowUpRight size={12} aria-hidden="true" /></span>}
    </>
  );
  // Clickable cards use a stretched overlay button so the info tooltip button is not nested inside another button.
  const cls = 'card card-pad group relative min-w-0 text-left';
  return onClick
    ? <div className={`${cls} transition hover:border-line-strong hover:shadow-pop`}>{body}<button type="button" className="absolute inset-0 rounded-xl" onClick={onClick} aria-label={`${label}: ${value}. ${openLabel || 'View invoices'}`} /></div>
    : <div className={cls}>{body}</div>;
}

export default function SummaryCards({ s, onOpenInvoices }) {
  const open = (query) => (onOpenInvoices ? () => onOpenInvoices(query) : undefined);
  return (
    <section aria-label="Key figures" className="space-y-3">
      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total Invoice Value" value={peso(s.totalValue)} icon={FileText} tone="brand" hint="Sum of all invoice amounts in the selected period, excluding cancelled invoices." />
        <Kpi label="Total Collected" value={peso(s.totalCollected)} icon={Wallet} tone="success" hint="Sum of amounts paid on those invoices." />
        <Kpi label="Outstanding Balance" value={peso(s.outstandingBalance)} icon={Banknote} tone="warning" hint="Invoice amount minus amount paid, summed across non-cancelled invoices." onClick={open({ paymentStatus: 'unpaid' })} openLabel="View unpaid invoices" />
        <Kpi label="Pending Payments" value={peso(s.pendingPayments)} icon={Hourglass} tone="info" hint="Balance still owed on invoices marked Pending or Partially Paid." onClick={open({ paymentStatus: 'unpaid' })} openLabel="View unpaid invoices" />
      </div>
      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
        <Kpi size="sm" label="Total Invoices" value={s.totalInvoices} icon={CheckCircle2} tone="neutral" hint="Number of non-cancelled invoices in the selected period." />
        <Kpi size="sm" label="Delivered Orders" value={s.deliveredOrders} icon={Truck} tone="success" hint="Invoices that have a Delivery Date." onClick={open({ deliveryStatus: 'Delivered' })} openLabel="View delivered" />
        <Kpi size="sm" label="Pending Deliveries" value={s.pendingDeliveries} icon={Clock3} tone="warning" hint="Invoices with no Delivery Date yet." onClick={open({ deliveryStatus: 'Pending' })} openLabel="View pending" />
      </div>
    </section>
  );
}
