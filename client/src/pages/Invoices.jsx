import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../utils/api.js';
import FilterBar from '../components/invoices/FilterBar.jsx';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import Pagination from '../components/invoices/Pagination.jsx';
import InvoiceForm from '../components/invoices/InvoiceForm.jsx';
import DeleteDialog from '../components/invoices/DeleteDialog.jsx';
import Toast from '../components/Toast.jsx';
import { formatAmount } from '../utils/money.js';

const blank = { date_issued: '', invoice_no: '', invoice_prefix: 'SVI', invoice_number: '', cr_no: '', client_name: '', product_service: '', amount: '', payment_status: 'Pending', amount_paid: '0', delivery_date: '', remarks: '' };
const noFilters = { q: '', dateFrom: '', dateTo: '', client: '', product: '', paymentStatus: '', deliveryStatus: '' };
const splitInvoiceNumber = (invoiceNo = '') => {
  const match = String(invoiceNo).match(/^(SVI|VI)(.*)$/i);
  return match ? { invoice_prefix: match[1].toUpperCase(), invoice_number: match[2] } : { invoice_prefix: '', invoice_number: String(invoiceNo) };
};

export default function Invoices() {
  const [f, setF] = useState(noFilters), [dq, setDq] = useState(noFilters);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [sort, setSort] = useState({ sortBy: 'date_issued', sortDir: 'desc' });
  const [res, setRes] = useState({ data: [], total: 0 }), [loading, setLoading] = useState(true), [products, setProducts] = useState([]);
  const [form, setForm] = useState(null), [errs, setErrs] = useState({}), [toast, setToast] = useState(null), [del, setDel] = useState(null);

  const note = (msg, bad) => { setToast({ msg, bad }); setTimeout(() => setToast(null), 3000); };
  useEffect(() => { const t = setTimeout(() => { setDq(f); setPage(1); }, 300); return () => clearTimeout(t); }, [f]);
  useEffect(() => { api('/api/products').then(setProducts).catch((e) => note(e.message, true)); }, []);
  const load = useCallback(() => {
    setLoading(true);
    api(`/api/invoices?${qs({ ...dq, ...sort, page, pageSize })}`).then(setRes).catch((e) => note(e.message, true)).finally(() => setLoading(false));
  }, [dq, sort, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api(form.id ? `/api/invoices/${form.id}` : '/api/invoices', { method: form.id ? 'PUT' : 'POST', body: form });
      setForm(null); setErrs({}); note('Saved'); load();
    } catch (e) { setErrs(e.fields || {}); note(e.message, true); }
  };
  const confirmDelete = async () => {
    try { await api(`/api/invoices/${del.id}`, { method: 'DELETE' }); note('Deleted'); load(); } catch (e) { note(e.message, true); }
    setDel(null);
  };
  const openEdit = (r) => { setForm({ ...r, ...splitInvoiceNumber(r.invoice_no), amount: formatAmount(r.amount), amount_paid: formatAmount(r.amount_paid), cr_no: r.cr_no ?? '', delivery_date: r.delivery_date ?? '', remarks: r.remarks ?? '' }); setErrs({}); };
  const onSort = (k) => setSort({ sortBy: k, sortDir: sort.sortBy === k && sort.sortDir === 'asc' ? 'desc' : 'asc' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Invoices & Transactions</h1>
        <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white" onClick={() => { setForm({ ...blank }); setErrs({}); }}>Add Invoice</button></div>
      <FilterBar f={f} setF={setF} onClear={() => setF(noFilters)} />
      <InvoiceTable rows={res.data} loading={loading} sort={sort} onSort={onSort} onEdit={openEdit} onDelete={setDel} />
      <Pagination total={res.total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
      {form && <InvoiceForm form={form} setForm={setForm} errs={errs} products={products} onSave={save} onCancel={() => setForm(null)} />}
      {del && <DeleteDialog invoice={del} onConfirm={confirmDelete} onCancel={() => setDel(null)} />}
      <Toast toast={toast} />
    </div>
  );
}
