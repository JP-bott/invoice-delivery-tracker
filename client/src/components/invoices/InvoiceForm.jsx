import { STATUSES } from '../../utils/constants.js';
import { formatAmount } from '../../utils/money.js';
import Modal from '../Modal.jsx';

const FIELDS = [['date_issued', 'Date Issued', 'date'], ['cr_no', 'CR No.'], ['client_name', 'Client Name'], ['due_date', 'Due Date', 'date'], ['delivery_date', 'Delivery Date', 'date']];
const required = new Set(['date_issued', 'invoice_number', 'client_name', 'product_service', 'amount']);
const lbl = 'block text-sm font-medium text-slate-700';
const input = 'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const hiddenPaidStatuses = new Set(['Pending', 'No', 'Cancelled']);

const numericAmount = (value) => Number(String(value ?? '').replace(/,/g, ''));
const hint = (form) => { const a = numericAmount(form.amount), p = numericAmount(form.amount_paid); return p === 0 ? 'Pending' : p >= a ? 'Paid' : 'Partially Paid'; };

export default function InvoiceForm({ form, setForm, errs, onSave, onCancel, products = [] }) {
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const setInvoicePart = (key) => (event) => {
    const value = event.target.value;
    const prefix = key === 'invoice_prefix' ? value : form.invoice_prefix;
    const number = key === 'invoice_number' ? value : form.invoice_number;
    setForm({ ...form, [key]: value, invoice_no: `${prefix}${number}` });
  };
  const error = (key) => errs[key] && <span id={`invoice-${key}-error`} role="alert" className="mt-1 block text-xs font-normal text-red-600">{errs[key]}</span>;
  const field = (key, label, type = 'text') => (
    <label key={key} className={lbl} htmlFor={`invoice-${key}`}>
      {label}{required.has(key) && <span className="ml-1 text-indigo-600" aria-hidden="true">*</span>}
      <input id={`invoice-${key}`} type={type} required={required.has(key)} aria-invalid={Boolean(errs[key])} aria-describedby={errs[key] ? `invoice-${key}-error` : undefined} className={`${input} ${errs[key] ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`} value={form[key]} onChange={set(key)} />
      {error(key)}
    </label>
  );
  const amountField = (key, label, isRequired = false) => (
    <label className={lbl} htmlFor={`invoice-${key}`}>
      {label}{isRequired && <span className="ml-1 text-indigo-600" aria-hidden="true">*</span>}
      <input id={`invoice-${key}`} type="text" inputMode="decimal" required={isRequired} aria-invalid={Boolean(errs[key])} aria-describedby={errs[key] ? `invoice-${key}-error` : undefined} className={`${input} ${errs[key] ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`} value={form[key]} onChange={set(key)} onBlur={() => setForm({ ...form, [key]: formatAmount(form[key]) })} />
      {error(key)}
    </label>
  );
  const productInput = (
    <label className={lbl} htmlFor="invoice-product_service">
      Product/Service<span className="ml-1 text-indigo-600" aria-hidden="true">*</span>
      <select id="invoice-product_service" required aria-invalid={Boolean(errs.product_service)} className={`${input} ${errs.product_service ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`} value={form.product_service} onChange={set('product_service')}>
        <option value="">{products.length ? 'Select a product or service' : 'No options configured'}</option>
        {form.product_service && !products.some((item) => item.name === form.product_service) && <option value={form.product_service}>{form.product_service} (current)</option>}
        {products.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
      </select>
      {error('product_service')}
    </label>
  );
  return (
    <Modal title={`${form.id ? 'Edit' : 'Add'} Invoice`} onClose={onCancel}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(); }} className="space-y-5">
        <p className="text-xs text-slate-500"><span className="text-indigo-600">*</span> Required fields</p>
        <section aria-labelledby="invoice-details-heading" className="space-y-3">
          <div><h3 id="invoice-details-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice details</h3><p className="mt-1 text-xs text-slate-500">Identify the transaction and what was delivered.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('date_issued', 'Date Issued', 'date')}
            <label className={lbl} htmlFor="invoice_number">Invoice No.<span className="ml-1 text-indigo-600" aria-hidden="true">*</span>
              <span className="mt-1.5 flex">
                <select aria-label="Invoice number prefix" className="rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-2 py-2 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={form.invoice_prefix} onChange={setInvoicePart('invoice_prefix')}>
                  <option value="SVI">SVI</option><option value="VI">VI</option>
                </select>
                <input id="invoice_number" type="text" required aria-invalid={Boolean(errs.invoice_no)} aria-describedby={errs.invoice_no ? 'invoice-invoice_no-error' : undefined} className={`${input} mt-0 rounded-l-none`} value={form.invoice_number} onChange={setInvoicePart('invoice_number')} />
              </span>
              {error('invoice_no')}
            </label>
            {FIELDS.slice(1, 4).map(([key, label, type]) => field(key, label, type))}
            {productInput}
            {field('delivery_date', 'Delivery Date', 'date')}
          </div>
        </section>
        <section aria-labelledby="payment-heading" className="space-y-3 border-t border-slate-100 pt-4">
          <div><h3 id="payment-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment</h3><p className="mt-1 text-xs text-slate-500">Record the amount received and current payment state.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {amountField('amount', 'Invoice Amount', true)}
            <label className={lbl} htmlFor="invoice-payment_status">Payment Status
              <select id="invoice-payment_status" aria-invalid={Boolean(errs.payment_status)} className={input} value={form.payment_status} onChange={set('payment_status')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
              {error('payment_status')}
            </label>
            {!hiddenPaidStatuses.has(String(form.payment_status).trim()) && <>
              {amountField('amount_paid', 'Amount Paid')}
              {form.payment_status !== 'Cancelled' && hint(form) !== form.payment_status && <p className="self-end pb-2 text-xs text-amber-600">Suggested status: {hint(form)}</p>}
            </>}
          </div>
        </section>
        <label className={lbl} htmlFor="invoice-remarks">Remarks<span className="ml-1 text-xs font-normal text-slate-400">Optional</span>
          <textarea id="invoice-remarks" rows="3" className={`${input} resize-y`} value={form.remarks} onChange={set('remarks')} placeholder="Add delivery notes or payment details" />
        </label>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onCancel}>Cancel</button>
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">{form.id ? 'Save Changes' : 'Add Invoice'}</button>
        </div>
      </form>
    </Modal>
  );
}
