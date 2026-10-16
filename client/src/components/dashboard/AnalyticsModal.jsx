import { Fragment, useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { peso } from '../../utils/api.js';
import Modal from '../Modal.jsx';

const amount = (row, key) => row[key] ?? row.outstanding ?? row.amount_paid ?? 0;

export default function AnalyticsModal({ title, records = [], range, amountKey = 'outstanding', amountLabel = 'Outstanding', onClose }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('due_date');
  const [expanded, setExpanded] = useState({});
  const visible = useMemo(() => records
    .filter((row) => `${row.client_name} ${row.invoice_no}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''))), [records, search, sort]);
  const clients = useMemo(() => [...new Set(visible.map((row) => row.client_name))], [visible]);
  const total = visible.reduce((sum, row) => sum + amount(row, amountKey), 0);
  const grouped = clients.map((client) => ({ client, rows: visible.filter((row) => row.client_name === client) }));

  return (
    <Modal title={title} onClose={onClose} width="max-w-6xl">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3"><span className="block text-xs text-slate-500">Invoices</span><strong className="text-lg text-slate-900">{visible.length}</strong></div>
        <div className="rounded-lg bg-slate-50 p-3"><span className="block text-xs text-slate-500">Clients</span><strong className="text-lg text-slate-900">{clients.length}</strong></div>
        <div className="rounded-lg bg-slate-50 p-3"><span className="block text-xs text-slate-500">{amountLabel}</span><strong className="text-lg text-slate-900">{peso(total)}</strong></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input aria-label="Search clients or invoices" placeholder="Search client or invoice" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label="Sort results" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={sort} onChange={(event) => setSort(event.target.value)}><option value="due_date">Sort by due date</option><option value="client_name">Sort by client</option><option value="amount">Sort by amount</option><option value="outstanding">Sort by balance</option></select>
      </div>
      <p className="text-xs text-slate-400">{range || 'Current outstanding records'}{visible.length !== records.length ? ` - showing ${visible.length} of ${records.length}` : ''}</p>
      {!visible.length ? <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No matching invoices found.</div> : <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">{title} details</caption><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">{amountLabel}</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{grouped.map(({ client, rows }) => <Fragment key={client}><tr className="border-t bg-slate-50/60"><td colSpan="8" className="px-3 py-2"><button type="button" className="flex items-center gap-1 font-medium text-slate-700" onClick={() => setExpanded({ ...expanded, [client]: !expanded[client] })}>{expanded[client] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{client}<span className="ml-1 text-xs font-normal text-slate-400">{rows.length} invoice{rows.length === 1 ? '' : 's'}</span></button></td></tr>{(expanded[client] === false ? [] : rows).map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2 font-medium">{row.invoice_no}</td><td className="px-3">{row.client_name}</td><td className="px-3">{row.date_issued}</td><td className="px-3">{row.due_date || '--'}</td><td className="px-3">{peso(row.amount)}</td><td className="px-3">{peso(row.amount_paid)}</td><td className="px-3 font-medium">{peso(row[amountKey] ?? 0)}</td><td className="px-3">{row.payment_status}</td></tr>)}</Fragment>)}</tbody></table></div>}
    </Modal>
  );
}
