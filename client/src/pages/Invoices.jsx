import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../utils/api.js';
import FilterBar from '../components/invoices/FilterBar.jsx';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import Pagination from '../components/invoices/Pagination.jsx';
import InvoiceForm from '../components/invoices/InvoiceForm.jsx';
import DeleteDialog from '../components/invoices/DeleteDialog.jsx';
import { PageHeader } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatAmount } from '../utils/money.js';

const blank = { date_issued: '', invoice_no: 'SVI0001', invoice_prefix: 'SVI', invoice_number: '0001', cr_no: '', client_name: '', product_service: '', due_date: '', amount: '', payment_status: 'Pending', amount_paid: '0', delivery_date: '', remarks: '' };
const noFilters = { q: '', dateFrom: '', dateTo: '', client: '', product: '', paymentStatus: '', deliveryStatus: '' };
const filtersFromParams = (params) => Object.fromEntries(Object.keys(noFilters).map((key) => [key, params.get(key) || '']));
const splitInvoiceNumber = (invoiceNo = '') => {
  const match = String(invoiceNo).match(/^(SVI|SI|VI)(.*)$/i);
  return match ? { invoice_prefix: match[1].toUpperCase(), invoice_number: match[2] } : { invoice_prefix: '', invoice_number: String(invoiceNo) };
};

export default function Invoices() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [f, setF] = useState(() => filtersFromParams(searchParams)), [dq, setDq] = useState(() => filtersFromParams(searchParams));
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [sort, setSort] = useState({ sortBy: 'date_issued', sortDir: 'desc' });
  const [res, setRes] = useState({ data: [], total: 0 }), [loading, setLoading] = useState(true), [products, setProducts] = useState([]);
  const [form, setForm] = useState(null), [errs, setErrs] = useState({}), [del, setDel] = useState(null);
  const [saving, setSaving] = useState(false), [deleting, setDeleting] = useState(false);

  useEffect(() => { const next = filtersFromParams(searchParams); setF(next); setDq(next); setPage(1); }, [searchParams]);
  // Direct links with ?new=1 open the form once and tidy the URL.
  useEffect(() => {
    if (!searchParams.get('new')) return;
    setForm({ ...blank }); setErrs({});
    const next = new URLSearchParams(searchParams); next.delete('new'); setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  useEffect(() => { const t = setTimeout(() => { setDq(f); setPage(1); }, 300); return () => clearTimeout(t); }, [f]);
  useEffect(() => { api('/api/products').then(setProducts).catch((e) => toast.error(e.message)); }, [toast]);
  useEffect(() => {
    if (!form || form.id) return;
    const prefix = form.invoice_prefix;
    let active = true;
    api(`/api/invoices/next-number?prefix=${encodeURIComponent(prefix)}`)
      .then(({ number, invoice_no }) => {
        if (active) setForm((current) => current && !current.id && current.invoice_prefix === prefix ? { ...current, invoice_number: number, invoice_no } : current);
      })
      .catch((e) => { if (active) toast.error(e.message); });
    return () => { active = false; };
  }, [form?.id, form?.invoice_prefix, toast]);
  const load = useCallback(() => {
    setLoading(true);
    api(`/api/invoices?${qs({ ...dq, ...sort, page, pageSize })}`).then(setRes).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [dq, sort, page, pageSize, toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api(form.id ? `/api/invoices/${form.id}` : '/api/invoices', { method: form.id ? 'PUT' : 'POST', body: form });
      const wasEdit = Boolean(form.id);
      setForm(null); setErrs({}); toast.success(wasEdit ? 'Invoice updated' : 'Invoice created'); load();
    } catch (e) { setErrs(e.fields || {}); toast.error(e.message); }
    finally { setSaving(false); }
  };
  const confirmDelete = async () => {
    setDeleting(true);
    try { await api(`/api/invoices/${del.id}`, { method: 'DELETE' }); toast.success(`Invoice ${del.invoice_no} deleted`); load(); } catch (e) { toast.error(e.message); }
    setDeleting(false); setDel(null);
  };
  const openAdd = () => { setForm({ ...blank }); setErrs({}); };
  const openEdit = (r) => { setForm({ ...r, ...splitInvoiceNumber(r.invoice_no), amount: formatAmount(r.amount), amount_paid: formatAmount(r.amount_paid), cr_no: r.cr_no ?? '', due_date: r.due_date ?? '', delivery_date: r.delivery_date ?? '', remarks: r.remarks ?? '' }); setErrs({}); };
  const onSort = (k) => setSort({ sortBy: k, sortDir: sort.sortBy === k && sort.sortDir === 'asc' ? 'desc' : 'asc' });
  const clearFilters = () => { setF(noFilters); setSearchParams({}); };
  const filtered = Object.keys(noFilters).some((k) => dq[k]);

  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" description={loading && !res.total ? 'Loading invoices…' : `${res.total} invoice${res.total === 1 ? '' : 's'}${filtered ? ' match your filters' : ' in total'}`}
        actions={<button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={16} aria-hidden="true" />Add Invoice</button>} />
      <FilterBar f={f} setF={setF} products={products} onClear={clearFilters} sort={sort}
        onSortField={(k) => setSort({ ...sort, sortBy: k })} onSortDir={() => setSort({ ...sort, sortDir: sort.sortDir === 'asc' ? 'desc' : 'asc' })} />
      <InvoiceTable rows={res.data} loading={loading} sort={sort} onSort={onSort} onEdit={openEdit} onDelete={setDel} filtered={filtered} onClear={clearFilters} onAdd={openAdd} />
      <Pagination total={res.total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
      {form && <InvoiceForm form={form} setForm={setForm} errs={errs} products={products} saving={saving} onSave={save} onCancel={() => !saving && setForm(null)} />}
      {del && <DeleteDialog invoice={del} busy={deleting} onConfirm={confirmDelete} onCancel={() => !deleting && setDel(null)} />}
    </div>
  );
}
