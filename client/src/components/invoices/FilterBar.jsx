import { useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Search, SlidersHorizontal, X } from 'lucide-react';
import { STATUSES } from '../../utils/constants.js';

export const SORT_OPTIONS = [['date_issued', 'Date issued'], ['invoice_no', 'Invoice no.'], ['client_name', 'Client'], ['due_date', 'Due date'], ['amount', 'Amount'], ['amount_paid', 'Amount paid'], ['payment_status', 'Payment status'], ['delivery_date', 'Delivery date']];
const FILTER_KEYS = ['q', 'dateFrom', 'dateTo', 'client', 'product', 'paymentStatus', 'deliveryStatus'];

export default function FilterBar({ f, setF, onClear, products = [], sort, onSortField, onSortDir }) {
  const [open, setOpen] = useState(false);
  const active = FILTER_KEYS.filter((k) => f[k]).length;
  const secondary = FILTER_KEYS.filter((k) => k !== 'q' && f[k]).length;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const label = (text, child) => <label className="block"><span className="label mb-1">{text}</span>{child}</label>;
  return (
    <section aria-label="Filter invoices" className="card card-pad !py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <input type="search" aria-label="Search invoice number, client, product or CR number" placeholder="Search invoices…" className="input pl-9" value={f.q} onChange={set('q')} />
        </div>
        <button type="button" className="btn btn-secondary md:hidden" aria-expanded={open} aria-controls="more-filters" onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal size={15} aria-hidden="true" />Filters{secondary > 0 && <span className="badge badge-neutral !bg-brand-soft !text-brand-ink">{secondary}</span>}
        </button>
        <div className="flex items-center gap-1.5">
          <select aria-label="Sort by" className="input !w-auto" value={sort.sortBy} onChange={(e) => onSortField(e.target.value)}>{SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}</select>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onSortDir} aria-label={`Sort direction: ${sort.sortDir === 'asc' ? 'ascending' : 'descending'}. Click to reverse`}>{sort.sortDir === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}</button>
        </div>
        {active > 0 && <button type="button" className="btn btn-ghost" onClick={onClear}><X size={14} aria-hidden="true" />Clear filters<span className="badge badge-neutral">{active}</span></button>}
      </div>
      <div id="more-filters" className={`${open ? 'grid' : 'hidden'} mt-3 grid-cols-1 gap-3 border-t border-line pt-3 min-[520px]:grid-cols-2 md:grid lg:grid-cols-3 2xl:grid-cols-6`}>
        {label('Client', <input type="text" aria-label="Client contains" placeholder="Client contains…" className="input" value={f.client} onChange={set('client')} />)}
        {label('Product / service', <input type="text" list={products.length ? 'invoice-product-options' : undefined} aria-label="Product contains" placeholder="Product contains…" className="input" value={f.product} onChange={set('product')} />)}
        {products.length > 0 && <datalist id="invoice-product-options">{products.map((o) => <option key={o.id || o} value={o.name || o} />)}</datalist>}
        {label('Payment', <select aria-label="Payment status" className="input" value={f.paymentStatus} onChange={set('paymentStatus')}><option value="">Any payment</option><option value="unpaid">Unpaid (pending + partial)</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>)}
        {label('Delivery', <select aria-label="Delivery status" className="input" value={f.deliveryStatus} onChange={set('deliveryStatus')}><option value="">Any delivery</option><option>Pending</option><option>Delivered</option></select>)}
        {label('Issued from', <input type="date" aria-label="Date from" className="input" value={f.dateFrom} max={f.dateTo || undefined} onChange={set('dateFrom')} />)}
        {label('Issued to', <input type="date" aria-label="Date to" className="input" value={f.dateTo} min={f.dateFrom || undefined} onChange={set('dateTo')} />)}
      </div>
    </section>
  );
}
