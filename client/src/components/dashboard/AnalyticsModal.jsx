import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSearch, Search } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { today } from '../../utils/dates.js';
import Modal from '../Modal.jsx';
import StatusBadge, { OverdueBadge } from '../StatusBadge.jsx';
import { EmptyState } from '../ui.jsx';

const NUMERIC = new Set(['amount', 'outstanding', 'amount_paid']);
const daysLate = (due, now) => Math.round((Date.parse(now) - Date.parse(due)) / 86400000);

export default function AnalyticsModal({ title, description, records = [], range, amountKey = 'outstanding', amountLabel = 'Outstanding', onClose }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(amountKey === 'outstanding' ? 'due_date' : 'date_issued');
  const [collapsed, setCollapsed] = useState({});
  const now = today();
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return records
      .filter((row) => `${row.client_name} ${row.invoice_no}`.toLowerCase().includes(needle))
      .sort((a, b) => NUMERIC.has(sort) ? (b[sort] ?? 0) - (a[sort] ?? 0) : String(a[sort] ?? '9999').localeCompare(String(b[sort] ?? '9999')));
  }, [records, search, sort]);
  const grouped = useMemo(() => {
    const map = new Map();
    visible.forEach((row) => map.set(row.client_name, [...(map.get(row.client_name) || []), row]));
    return [...map].map(([client, rows]) => ({ client, rows }));
  }, [visible]);
  const total = visible.reduce((sum, row) => sum + (row[amountKey] ?? 0), 0);
  const stat = (label, value) => <div className="rounded-lg border border-line bg-surface-2/60 p-3"><span className="block text-xs text-fg-muted">{label}</span><strong className="num text-lg font-semibold text-fg">{value}</strong></div>;

  return (
    <Modal title={title} description={description} onClose={onClose} width="max-w-6xl">
      <div className="grid gap-3 sm:grid-cols-3">{stat('Invoices', visible.length)}{stat('Clients', grouped.length)}{stat(amountLabel, peso(total))}</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" /><input aria-label="Search clients or invoices" placeholder="Search client or invoice" className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <select aria-label="Sort results" className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="due_date">Sort by due date</option><option value="date_issued">Sort by issue date</option><option value="client_name">Sort by client</option><option value="amount">Sort by amount (high to low)</option><option value="outstanding">Sort by balance (high to low)</option>
        </select>
      </div>
      <p className="text-xs text-fg-subtle">{range || 'Current outstanding records'}{visible.length !== records.length ? ` · showing ${visible.length} of ${records.length}` : ''}</p>
      {!visible.length ? <EmptyState compact icon={FileSearch} title="No matching invoices" description="Adjust the search to see more results." /> : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">{title} details</caption>
            <thead className="bg-surface-2"><tr>{['Invoice', 'Issued', 'Due', 'Amount', 'Paid', amountLabel, 'Status'].map((h, i) => <th key={h} scope="col" className={`th ${i >= 3 && i <= 5 ? '!text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {grouped.map(({ client, rows }) => {
                const isCollapsed = collapsed[client];
                const subtotal = rows.reduce((s, r) => s + (r[amountKey] ?? 0), 0);
                return <Fragment key={client}>
                  <tr className="border-t border-line bg-surface-2/60"><td colSpan="7" className="px-3 py-2">
                    <button type="button" className="flex w-full items-center gap-1.5 text-left font-medium text-fg" aria-expanded={!isCollapsed} onClick={() => setCollapsed({ ...collapsed, [client]: !isCollapsed })}>
                      {isCollapsed ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}{client}
                      <span className="text-xs font-normal text-fg-subtle">{rows.length} invoice{rows.length === 1 ? '' : 's'}</span>
                      <span className="num ml-auto text-sm font-semibold">{peso(subtotal)}</span>
                    </button></td></tr>
                  {!isCollapsed && rows.map((row) => (
                    <tr key={row.id} className="border-t border-line hover:bg-surface-2/40">
                      <td className="td num font-medium">{row.invoice_no}</td><td className="td num text-fg-muted">{row.date_issued}</td>
                      <td className="td num text-fg-muted">{row.due_date || '—'}{row.due_date && row.due_date < now && row.outstanding > 0 && <span className="ml-2"><OverdueBadge days={daysLate(row.due_date, now)} /></span>}</td>
                      <td className="td num text-right">{peso(row.amount)}</td><td className="td num text-right">{peso(row.amount_paid)}</td><td className="td num text-right font-semibold">{peso(row[amountKey] ?? 0)}</td>
                      <td className="td"><StatusBadge status={row.payment_status} /></td>
                    </tr>))}
                </Fragment>;
              })}
            </tbody>
          </table>
        </div>)}
    </Modal>
  );
}
