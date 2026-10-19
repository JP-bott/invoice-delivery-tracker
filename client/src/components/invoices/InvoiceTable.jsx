import { ArrowDown, ArrowUp, ArrowUpDown, Eye, FileSearch, Pencil, Trash2 } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { today } from '../../utils/dates.js';
import StatusBadge, { OverdueBadge } from '../StatusBadge.jsx';
import { ActionMenu, EmptyState, Skeleton } from '../ui.jsx';

const COLS = [['date_issued', 'Date Issued'], ['invoice_no', 'Invoice No.'], ['cr_no', 'CR No.'], ['client_name', 'Client'], ['product_service', 'Product/Service'], ['due_date', 'Due Date'], ['amount', 'Amount', 'r'], ['amount_paid', 'Paid', 'r'], [null, 'Outstanding', 'r'], ['payment_status', 'Payment'], ['delivery_date', 'Delivery Date'], [null, 'Delivery'], [null, 'Remarks'], [null, '']];
const COUNT = COLS.length;
const daysLate = (due, now) => Math.round((Date.parse(now) - Date.parse(due)) / 86400000);
const isOverdue = (r, now) => r.due_date && r.due_date < now && r.outstanding > 0 && ['Pending', 'Partially Paid'].includes(r.payment_status);

const actions = (r, onEdit, onDelete, onPreview) => [
  { label: 'Preview invoice', icon: Eye, onClick: () => onPreview(r) },
  { label: 'Edit invoice', icon: Pencil, onClick: () => onEdit(r) },
  { label: 'Delete invoice', icon: Trash2, onClick: () => onDelete(r), danger: true },
];

export default function InvoiceTable({ rows, loading, sort, onSort, onEdit, onDelete, onPreview, filtered, onClear, onAdd }) {
  const now = today();
  const ariaSort = (k) => (sort.sortBy === k ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : undefined);
  const empty = !loading && !rows.length;
  const emptyState = filtered
    ? <EmptyState icon={FileSearch} title="No invoices match your filters" description="Try removing a filter or searching for something else." action={<button type="button" className="btn btn-secondary" onClick={onClear}>Clear filters</button>} />
    : <EmptyState icon={FileSearch} title="No invoices yet" description="Add your first invoice to start tracking payments and deliveries." action={<button type="button" className="btn btn-primary" onClick={onAdd}>Add Invoice</button>} />;

  return (
    <div className="card overflow-hidden" aria-busy={loading}>
      {/* Tablet / desktop: data table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full whitespace-nowrap text-sm">
          <caption className="sr-only">Invoices and transactions</caption>
          <thead className="border-b border-line bg-surface-2/70">
            <tr>{COLS.map(([k, l, align], i) => (
              <th key={i} scope="col" aria-sort={k ? ariaSort(k) : undefined} className={`th ${align === 'r' ? '!text-right' : ''} ${k === 'invoice_no' ? 'sticky left-0 z-[1] bg-surface-2' : ''}`}>
                {k ? (
                  <button type="button" className={`-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:text-fg ${sort.sortBy === k ? 'text-fg' : ''}`} onClick={() => onSort(k)}>
                    {l}{sort.sortBy === k ? (sort.sortDir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />) : <ArrowUpDown size={12} className="opacity-40" aria-hidden="true" />}
                  </button>) : l || <span className="sr-only">Actions</span>}
              </th>))}
            </tr>
          </thead>
          <tbody className={loading && rows.length ? 'opacity-60 transition-opacity' : ''}>
            {loading && !rows.length ? Array.from({ length: 6 }, (_, i) => <tr key={i} className="border-b border-line last:border-0"><td colSpan={COUNT} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td></tr>)
              : empty ? <tr><td colSpan={COUNT}>{emptyState}</td></tr>
              : rows.map((r) => (
                <tr key={r.id} className="group h-[var(--row-h)] border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                  <td className="td num text-fg-muted">{r.date_issued}</td>
                  <td className="td num sticky left-0 bg-surface font-medium text-fg transition-colors group-hover:bg-surface-2">{r.invoice_no}</td>
                  <td className="td num text-fg-muted">{r.cr_no}</td>
                  <td className="td max-w-[14rem] truncate" title={r.client_name}>{r.client_name}</td>
                  <td className="td max-w-[12rem] truncate text-fg-muted" title={r.product_service}>{r.product_service}</td>
                  <td className="td num text-fg-muted">{r.due_date || '—'}{isOverdue(r, now) && <span className="ml-2"><OverdueBadge days={daysLate(r.due_date, now)} /></span>}</td>
                  <td className="td num text-right">{peso(r.amount)}</td>
                  <td className="td num text-right text-fg-muted">{peso(r.amount_paid)}</td>
                  <td className={`td num text-right font-medium ${r.outstanding > 0 ? 'text-fg' : 'text-fg-subtle'}`}>{peso(r.outstanding)}</td>
                  <td className="td"><StatusBadge status={r.payment_status} /></td>
                  <td className="td num text-fg-muted">{r.delivery_date}</td>
                  <td className="td"><StatusBadge status={r.deliveryStatus === 'Delivered' ? 'Delivered' : 'Pending'} label={r.deliveryStatus} /></td>
                  <td className="td max-w-[10rem] truncate text-fg-muted" title={r.remarks || undefined}>{r.remarks}</td>
                  <td className="td text-right"><ActionMenu label={`Actions for invoice ${r.invoice_no}`} items={actions(r, onEdit, onDelete, onPreview)} /></td>
                </tr>))}
          </tbody>
        </table>
      </div>

      {/* Phone: one card per invoice */}
      <ul className={`divide-y divide-line md:hidden ${loading && rows.length ? 'opacity-60' : ''}`} aria-label="Invoices">
        {loading && !rows.length ? Array.from({ length: 4 }, (_, i) => <li key={i} className="p-4"><Skeleton className="h-24 w-full" /></li>)
          : empty ? <li>{emptyState}</li>
          : rows.map((r) => (
            <li key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="num font-semibold text-fg">{r.invoice_no}</p><p className="truncate text-sm text-fg-muted">{r.client_name}</p></div>
                <ActionMenu label={`Actions for invoice ${r.invoice_no}`} items={actions(r, onEdit, onDelete, onPreview)} />
              </div>
              <p className="mt-0.5 truncate text-xs text-fg-subtle">{r.product_service}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div><p className="num text-lg font-semibold text-fg">{peso(r.amount)}</p><p className="num text-xs text-fg-muted">{r.outstanding > 0 ? `${peso(r.outstanding)} outstanding` : 'Fully paid'}</p></div>
                <div className="flex flex-wrap justify-end gap-1.5"><StatusBadge status={r.payment_status} /><StatusBadge status={r.deliveryStatus === 'Delivered' ? 'Delivered' : 'Pending'} label={r.deliveryStatus} /></div>
              </div>
              <p className="num mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                <span>Issued {r.date_issued}</span>{r.due_date && <span>Due {r.due_date}</span>}{isOverdue(r, now) && <OverdueBadge days={daysLate(r.due_date, now)} />}
              </p>
            </li>))}
      </ul>
    </div>
  );
}
