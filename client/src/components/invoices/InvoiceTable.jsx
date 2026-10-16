import { peso } from '../../utils/api.js';
import StatusBadge from '../StatusBadge.jsx';

const COLS = [['date_issued', 'Date Issued'], ['invoice_no', 'Invoice No.'], ['cr_no', 'CR No.'], ['client_name', 'Client'], ['product_service', 'Product/Service'], ['amount', 'Amount'], ['amount_paid', 'Paid'], [null, 'Outstanding'], ['payment_status', 'Payment'], ['delivery_date', 'Delivery Date'], [null, 'Delivery'], [null, 'Remarks'], [null, '']];

export default function InvoiceTable({ rows, loading, sort, onSort, onEdit, onDelete }) {
  const ariaSort = (k) => (sort.sortBy === k ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : undefined);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm whitespace-nowrap">
        <caption className="sr-only">Invoices and transactions</caption>
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>{COLS.map(([k, l], i) => (
            <th key={i} scope="col" aria-sort={k ? ariaSort(k) : undefined} className="px-3 py-2">
              {k ? <button className="cursor-pointer" onClick={() => onSort(k)}>{l}{sort.sortBy === k ? (sort.sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</button> : l || <span className="sr-only">Actions</span>}
            </th>))}
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={13} className="p-8 text-center text-slate-400">Loading…</td></tr>
            : !rows.length ? <tr><td colSpan={13} className="p-8 text-center text-slate-400">No invoices found</td></tr>
            : rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.date_issued}</td><td className="px-3">{r.invoice_no}</td><td className="px-3">{r.cr_no}</td><td className="px-3">{r.client_name}</td><td className="px-3">{r.product_service}</td>
                <td className="px-3">{peso(r.amount)}</td><td className="px-3">{peso(r.amount_paid)}</td><td className="px-3">{peso(r.outstanding)}</td>
                <td className="px-3"><StatusBadge status={r.payment_status} /></td>
                <td className="px-3">{r.delivery_date}</td><td className="px-3"><StatusBadge status={r.deliveryStatus} /></td>
                <td className="max-w-[10rem] truncate px-3" title={r.remarks || undefined}>{r.remarks}</td>
                <td className="space-x-2 px-3">
                  <button className="text-indigo-600" aria-label={`Edit invoice ${r.invoice_no}`} onClick={() => onEdit(r)}>Edit</button>
                  <button className="text-red-600" aria-label={`Delete invoice ${r.invoice_no}`} onClick={() => onDelete(r)}>Delete</button>
                </td>
              </tr>))}
        </tbody>
      </table>
    </div>
  );
}
