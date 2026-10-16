import { STATUSES, inputClass } from '../../utils/constants.js';
import Modal from '../Modal.jsx';

const FIELDS = [['date_issued', 'Date Issued', 'date'], ['invoice_no', 'Invoice No.'], ['cr_no', 'CR No.'], ['client_name', 'Client Name'], ['product_service', 'Product/Service'], ['amount', 'Amount', 'number'], ['delivery_date', 'Delivery Date', 'date']];
const lbl = 'block text-xs text-slate-600';

// Suggested status from amounts (hint only; the server enforces the real rules).
const hint = (form) => { const a = Number(form.amount), p = Number(form.amount_paid); return p === 0 ? 'Pending' : p >= a ? 'Paid' : 'Partially Paid'; };

export default function InvoiceForm({ form, setForm, errs, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const err = (k) => errs[k] && <span role="alert" className="block text-red-600">{errs[k]}</span>;
  return (
    <Modal title={`${form.id ? 'Edit' : 'Add'} Invoice`} onClose={onCancel}>
      {FIELDS.map(([k, l, t]) => (
        <label key={k} className={lbl}>{l}<input type={t || 'text'} step="0.01" aria-invalid={Boolean(errs[k])} className={inputClass} value={form[k]} onChange={set(k)} />{err(k)}</label>
      ))}
      <label className={lbl}>Payment Status<select aria-invalid={Boolean(errs.payment_status)} className={inputClass} value={form.payment_status} onChange={set('payment_status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>{err('payment_status')}</label>
      <label className={lbl}>Amount Paid<input type="number" step="0.01" aria-invalid={Boolean(errs.amount_paid)} className={inputClass} value={form.amount_paid} onChange={set('amount_paid')} />
        {form.payment_status !== 'Cancelled' && hint(form) !== form.payment_status && <span className="text-amber-600">Suggested status: {hint(form)}</span>}
        {err('amount_paid')}</label>
      <label className={lbl}>Remarks<textarea className={inputClass} value={form.remarks} onChange={set('remarks')} /></label>
      <div className="flex justify-end gap-2 pt-2">
        <button className="px-3 py-1.5 text-sm" onClick={onCancel}>Cancel</button>
        <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white" onClick={onSave}>Save</button>
      </div>
    </Modal>
  );
}
