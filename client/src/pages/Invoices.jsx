import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../utils/api.js';
import FilterBar from '../components/invoices/FilterBar.jsx';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import Pagination from '../components/invoices/Pagination.jsx';
import InvoiceForm from '../components/invoices/InvoiceForm.jsx';
import InvoicePreview from '../components/invoices/InvoicePreview.jsx';
import DeleteDialog from '../components/invoices/DeleteDialog.jsx';
import { PageHeader } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatAmount } from '../utils/money.js';
import { isCustomFilterKey } from '../utils/customFields.js';
import { useInvoiceFields } from '../utils/useInvoiceFields.js';
import { blankItem, deriveUnitCost } from '../utils/items.js';
import { invoiceNoFor, splitInvoiceNo } from '../utils/invoiceNo.js';

const newForm = () => ({ ...blank, items: [blankItem()], custom_fields: {} });
const blank = { date_issued: '', invoice_no: '', invoice_prefix: 'SVI', invoice_number: '', cr_no: '', client_name: '', items: [blankItem()], due_date: '', payment_status: 'Pending', amount_paid: '0', delivery_date: '', remarks: '', custom_fields: {} };
const noFilters = { q: '', dateFrom: '', dateTo: '', client: '', product: '', paymentStatus: '', deliveryStatus: '' };
// Built-in filters plus any custom-field filters in the URL (cf_<id>).
const filtersFromParams = (params) => Object.fromEntries([...Object.keys(noFilters), ...[...params.keys()].filter(isCustomFilterKey)].map((key) => [key, params.get(key) || '']));
// Existing numbers are split into prefix + number for editing; older formats ("SVI001", "VI123") still split.
const splitInvoiceNumber = (invoiceNo = '') => { const { prefix, number } = splitInvoiceNo(invoiceNo); return { invoice_prefix: prefix, invoice_number: number }; };
// Items for editing: saved unit costs as they are; invoices saved before unit costs existed get one only when it is exact.
const editItems = (r) => {
  const list = Array.isArray(r.items) && r.items.length ? r.items : [{ product_service: r.product_service, quantity: 1, unit_cost: r.amount }];
  return list.map((it) => ({ product_service: it.product_service, quantity: String(it.quantity || 1), unit_cost: it.unit_cost != null ? formatAmount(it.unit_cost) : list.length === 1 ? formatAmount(deriveUnitCost(r.amount, it.quantity)) : '' }));
};

export default function Invoices() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [f, setF] = useState(() => filtersFromParams(searchParams)), [dq, setDq] = useState(() => filtersFromParams(searchParams));
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [sort, setSort] = useState({ sortBy: 'date_issued', sortDir: 'desc' });
  const [res, setRes] = useState({ data: [], total: 0 }), [loading, setLoading] = useState(true), [products, setProducts] = useState([]);
  const [form, setForm] = useState(null), [errs, setErrs] = useState({}), [del, setDel] = useState(null);
  const [preview, setPreview] = useState(null);
  const onFieldsError = useCallback((e) => toast.error(`Could not load custom fields: ${e.message}`), [toast]);
  const { fields, reload: reloadFields } = useInvoiceFields(onFieldsError);
  const [saving, setSaving] = useState(false), [deleting, setDeleting] = useState(false);

  useEffect(() => { const next = filtersFromParams(searchParams); setF(next); setDq(next); setPage(1); }, [searchParams]);
  // "Add Invoice" in the sidebar/topbar links here with ?new=1: open the form once and tidy the URL.
  useEffect(() => {
    if (!searchParams.get('new')) return;
    reloadFields(); setForm(newForm()); setErrs({});
    const next = new URLSearchParams(searchParams); next.delete('new'); setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, reloadFields]);
  useEffect(() => { const t = setTimeout(() => { setDq(f); setPage(1); }, 300); return () => clearTimeout(t); }, [f]);
  useEffect(() => { api('/api/products').then(setProducts).catch((e) => toast.error(e.message)); }, [toast]);
  const load = useCallback(() => {
    setLoading(true);
    api(`/api/invoices?${qs({ ...dq, ...sort, page, pageSize })}`).then(setRes).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [dq, sort, page, pageSize, toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // The server derives the amount from the items and applies the SVI/SI format; an unchanged existing number is sent back as stored.
      const no = invoiceNoFor(form), { amount, ...rest } = form;
      const body = { ...rest, invoice_no: no.unchanged ? no.value : form.invoice_number, invoice_prefix: no.unchanged ? '' : form.invoice_prefix };
      await api(form.id ? `/api/invoices/${form.id}` : '/api/invoices', { method: form.id ? 'PUT' : 'POST', body });
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
  const openAdd = () => { reloadFields(); setForm(newForm()); setErrs({}); };
  const openEdit = (r) => { setForm({ ...r, ...splitInvoiceNumber(r.invoice_no), original_invoice_no: r.invoice_no, amount_paid: formatAmount(r.amount_paid), cr_no: r.cr_no ?? '', due_date: r.due_date ?? '', delivery_date: r.delivery_date ?? '', remarks: r.remarks ?? '', items: editItems(r), custom_fields: { ...(r.custom_fields || {}) } }); reloadFields(); setErrs({}); };
  const onSort = (k) => setSort({ sortBy: k, sortDir: sort.sortBy === k && sort.sortDir === 'asc' ? 'desc' : 'asc' });
  const clearFilters = () => { setF(noFilters); setSearchParams({}); };
  const filtered = Object.keys(dq).some((k) => dq[k]);

  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" description={loading && !res.total ? 'Loading invoices…' : `${res.total} invoice${res.total === 1 ? '' : 's'}${filtered ? ' match your filters' : ' in total'}`} />
      <FilterBar f={f} setF={setF} products={products} fields={fields} onClear={clearFilters} sort={sort}
        onSortField={(k) => setSort({ ...sort, sortBy: k })} onSortDir={() => setSort({ ...sort, sortDir: sort.sortDir === 'asc' ? 'desc' : 'asc' })} />
      <InvoiceTable fields={fields} rows={res.data} loading={loading} sort={sort} onSort={onSort} onEdit={openEdit} onDelete={setDel} onPreview={(r) => setPreview({ ...r, amount: formatAmount(r.amount) })} filtered={filtered} onClear={clearFilters} onAdd={openAdd} />
      <Pagination total={res.total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
      {form && <InvoiceForm form={form} setForm={setForm} errs={errs} products={products} fields={fields} saving={saving} onSave={save} onCancel={() => !saving && setForm(null)} />}
      {preview && <InvoicePreview invoice={preview} onClose={() => setPreview(null)} />}
      {del && <DeleteDialog invoice={del} busy={deleting} onConfirm={confirmDelete} onCancel={() => !deleting && setDel(null)} />}
    </div>
  );
}
