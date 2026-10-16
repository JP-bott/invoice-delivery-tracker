import { STATUSES } from '../../utils/constants.js';
import Modal from '../Modal.jsx';

const FIELDS = [['date_issued', 'Date Issued', 'date'], ['invoice_no', 'Invoice No.'], ['cr_no', 'CR No.'], ['client_name', 'Client Name'], ['product_service', 'Product/Service'], ['amount', 'Amount', 'number'], ['delivery_date', 'Delivery Date', 'date']];
const required = new Set(['date_issued', 'invoice_no', 'client_name', 'product_service', 'amount']);
const lbl = 'block text-sm font-medium text-slate-700';
const input = 'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Suggested status from amounts (hint only; the server enforces the real rules).
const hint = (form) => { const a = Number(form.amount), p = Number(form.amount_paid); return p === 0 ? 'Pending' : p >= a ? 'Paid' : 'Partially Paid'; };

export default function InvoiceForm({ form, setForm, errs, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const field = (k, label, type = 'text') => (
    <label key={k} className={lbl} htmlFor={`invoice-${k}`}>
      {label}{required.has(k) && <span className="ml-1 text-indigo-600" aria-hidden="true">*</span>}
      <input id={`invoice-${k}`} type={type} step={type === 'number' ? '0.01' : undefined} required={required.has(k)} aria-invalid={Boolean(errs[k])} aria-describedby={errs[k] ? `invoice-${k}-error` : undefined} className={`${input} ${errs[k] ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`} value={form[k]} onChange={set(k)} />
      {errs[k] && <span id={`invoice-${k}-error`} role="alert" className="mt-1 block text-xs font-normal text-red-600">{errs[k]}</span>}
    </label>
  );
  return (
    <Modal title={`${form.id ? 'Edit' : 'Add'} Invoice`} onClose={onCancel}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-5">
        <p className="text-xs text-slate-500"><span className="text-indigo-600">*</span> Required fields</p>
        <section aria-labelledby="invoice-details-heading" className="space-y-3">
          <div><h3 id="invoice-details-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice details</h3><p className="mt-1 text-xs text-slate-500">Identify the transaction and what was delivered.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.slice(0, 5).map(([k, l, t]) => field(k, l, t))}
            {field('delivery_date', 'Delivery Date', 'date')}
          </div>
        </section>
        <section aria-labelledby="payment-heading" className="space-y-3 border-t border-slate-100 pt-4">
          <div><h3 id="payment-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment</h3><p className="mt-1 text-xs text-slate-500">Record the amount received and current payment state.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('amount', 'Invoice Amount', 'number')}
            <label className={lbl} htmlFor="invoice-payment_status">Payment Status
              <select id="invoice-payment_status" aria-invalid={Boolean(errs.payment_status)} className={input} value={form.payment_status} onChange={set('payment_status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              {errs.payment_status && <span role="alert" className="mt-1 block text-xs font-normal text-red-600">{errs.payment_status}</span>}
            </label>
            <label className={lbl} htmlFor="invoice-amount_paid">Amount Paid
              <input id="invoice-amount_paid" type="number" min="0" step="0.01" aria-invalid={Boolean(errs.amount_paid)} className={`${input} ${errs.amount_paid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`} value={form.amount_paid} onChange={set('amount_paid')} />
              {form.payment_status !== 'Cancelled' && hint(form) !== form.payment_status && <span className="mt-1 block text-xs font-normal text-amber-600">Suggested status: {hint(form)}</span>}
              {errs.amount_paid && <span role="alert" className="mt-1 block text-xs font-normal text-red-600">{errs.amount_paid}</span>}
            </label>
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
