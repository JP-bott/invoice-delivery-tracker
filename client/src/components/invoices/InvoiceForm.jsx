import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { STATUSES } from '../../utils/constants.js';
import { formatAmount } from '../../utils/money.js';
import { peso } from '../../utils/api.js';
import { computeInvoiceTotals } from '../../../../shared/invoiceTotals.js';
import { HoverCard } from '../ui.jsx';
import Modal from '../Modal.jsx';

const required = new Set(['date_issued', 'invoice_number', 'client_name', 'product_service', 'amount']);
const hiddenPaidStatuses = new Set(['Pending', 'No', 'Cancelled']);

const numericAmount = (value) => Number(String(value ?? '').replace(/,/g, ''));
const hint = (form) => { const a = numericAmount(form.amount), p = numericAmount(form.amount_paid); return p === 0 ? 'Pending' : p >= a ? 'Paid' : 'Partially Paid'; };

function Group({ id, title, description, children }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div><h3 id={id} className="eyebrow">{title}</h3>{description && <p className="mt-1 text-xs text-fg-muted">{description}</p>}</div>
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function InvoiceForm({ form, setForm, errs, onSave, onCancel, products = [], saving = false }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const totals = computeInvoiceTotals({ amount: form.amount, vatType: form.vat_type, withholdingRate: form.withholding_rate });
  const money = (value) => peso(value);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const setInvoicePart = (key) => (event) => {
    const value = event.target.value;
    const prefix = key === 'invoice_prefix' ? value : form.invoice_prefix;
    const number = key === 'invoice_number' ? value : form.invoice_number;
    setForm({ ...form, [key]: value, invoice_no: `${prefix}${number}` });
  };
  const error = (key) => errs[key] && <span id={`invoice-${key}-error`} role="alert" className="mt-1 block text-xs font-normal text-danger-ink">{errs[key]}</span>;
  const star = (key) => required.has(key) ? <span className="ml-0.5 text-danger" aria-hidden="true">*</span> : <span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span>;
  const cls = (key) => `input ${errs[key] ? 'input-error' : ''}`;
  const aria = (key) => ({ 'aria-invalid': Boolean(errs[key]), 'aria-describedby': errs[key] ? `invoice-${key}-error` : undefined });

  const field = (key, label, type = 'text', extra = {}) => (
    <label key={key} className="label" htmlFor={`invoice-${key}`}>
      <span className="mb-1.5 block">{label}{star(key)}</span>
      <input id={`invoice-${key}`} type={type} required={required.has(key)} {...aria(key)} className={cls(key)} value={form[key]} onChange={set(key)} {...extra} />
      {error(key)}
    </label>
  );
  const amountField = (key, label, isRequired = false) => (
    <label className="label" htmlFor={`invoice-${key}`}>
      <span className="mb-1.5 block">{label}{isRequired ? star('amount') : <span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span>}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle" aria-hidden="true">₱</span>
        <input id={`invoice-${key}`} type="text" inputMode="decimal" autoComplete="off" required={isRequired} {...aria(key)} className={`${cls(key)} num pl-7 text-right`} value={form[key]} onChange={set(key)} onBlur={() => setForm({ ...form, [key]: formatAmount(form[key]) })} placeholder="0.00" />
      </span>
      {error(key)}
    </label>
  );

  return (
    <Modal title={`${form.id ? 'Edit' : 'Add'} invoice`} description={form.id ? `Update ${form.invoice_no || 'this invoice'}.` : 'Record a new invoice and its delivery details.'} onClose={onCancel} width="max-w-2xl" dismissOnBackdrop={false}
      headerActions={<HoverCard content={previewOpen ? 'Hide invoice preview' : 'Show invoice preview'}><button type="button" className="btn btn-ghost btn-icon -mr-2 -mt-1.5" onClick={() => setPreviewOpen((open) => !open)} aria-label={previewOpen ? 'Hide invoice preview' : 'Show invoice preview'} aria-expanded={previewOpen}>{previewOpen ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></HoverCard>}
      footer={<>
        <p className="mr-auto hidden text-xs text-fg-muted sm:block"><span className="text-danger">*</span> Required</p>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" form="invoice-form" className="btn btn-primary min-w-32" disabled={saving}>{saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}{saving ? 'Saving…' : form.id ? 'Save changes' : 'Add invoice'}</button>
      </>}>
      <form id="invoice-form" onSubmit={(event) => { event.preventDefault(); if (!saving) onSave(); }} className="space-y-6" noValidate={false}>
        <Group id="invoice-details-heading" title="Invoice details" description="Identify the transaction.">
          {field('date_issued', 'Date Issued', 'date')}
          <div className="label">
            <label htmlFor="invoice_number" className="mb-1.5 block">Invoice No.{star('invoice_number')}</label>
            <span className="flex">
              <select aria-label="Invoice number prefix" disabled={form.auto_number} className="input !w-auto rounded-r-none border-r-0 bg-surface-2 font-medium" value={form.invoice_prefix} onChange={setInvoicePart('invoice_prefix')}>
                <option value="SVI">SVI</option><option value="VI">VI</option>
              </select>
              <input id="invoice_number" type="text" required={!form.auto_number} readOnly={form.auto_number} aria-invalid={Boolean(errs.invoice_no)} aria-describedby={errs.invoice_no ? 'invoice-invoice_no-error' : undefined} className={`${cls('invoice_no')} num rounded-l-none`} value={form.invoice_number || (form.auto_number ? 'Loading…' : '')} onChange={setInvoicePart('invoice_number')} />
            </span>
            {error('invoice_no')}
          </div>
          {field('cr_no', 'CR No.')}
          {field('due_date', 'Due Date', 'date')}
        </Group>
        <Group id="invoice-client-heading" title="Client & delivery" description="Who it is for and what was delivered.">
          {field('client_name', 'Client Name')}
          <label className="label" htmlFor="invoice-product_service">
            <span className="mb-1.5 block">Product/Service{star('product_service')}</span>
            <select id="invoice-product_service" required {...aria('product_service')} className={cls('product_service')} value={form.product_service} onChange={set('product_service')}>
              <option value="">{products.length ? 'Select a product or service' : 'No options configured'}</option>
              {form.product_service && !products.some((item) => item.name === form.product_service) && <option value={form.product_service}>{form.product_service} (current)</option>}
              {products.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            {error('product_service')}
          </label>
          {field('delivery_date', 'Delivery Date', 'date')}
        </Group>
        <Group id="payment-heading" title="Payment" description="Amount billed, received and current payment state.">
          {amountField('amount', 'Invoice Amount', true)}
          <label className="label" htmlFor="invoice-vat_type">
            <span className="mb-1.5 block">VAT Type</span>
            <select id="invoice-vat_type" className="input" value={form.vat_type} onChange={set('vat_type')}><option>VATable</option><option>VAT-Exempt</option><option>Zero-Rated</option></select>
          </label>
          {field('withholding_rate', 'Withholding Tax Rate (%)', 'number', { min: 0, max: 100, step: '0.01', placeholder: '0' })}
          <label className="label" htmlFor="invoice-payment_status">
            <span className="mb-1.5 block">Payment Status</span>
            <select id="invoice-payment_status" {...aria('payment_status')} className={cls('payment_status')} value={form.payment_status} onChange={set('payment_status')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
            {error('payment_status')}
          </label>
          {!hiddenPaidStatuses.has(String(form.payment_status).trim()) && <>
            {amountField('amount_paid', 'Amount Paid')}
            {form.payment_status !== 'Cancelled' && hint(form) !== form.payment_status && <p className="self-end pb-2 text-xs text-warning-ink" role="status">Suggested status: {hint(form)}</p>}
          </>}
        </Group>
        <label className="label block" htmlFor="invoice-remarks">
          <span className="mb-1.5 block">Remarks<span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span></span>
          <textarea id="invoice-remarks" rows="3" className="input resize-y" value={form.remarks} onChange={set('remarks')} placeholder="Add delivery notes or payment details" />
        </label>
      </form>
      {previewOpen && <section aria-label="Invoice preview" className="anim-fade overflow-hidden rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3 text-center">
          <h3 className="text-sm font-bold tracking-wide text-fg">SERVICE INVOICE</h3>
          <p className="mt-0.5 text-xs font-semibold text-danger-ink">No. {form.invoice_no || 'Loading…'}</p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-left text-xs text-fg-muted">
            <span>Billed to: <strong className="font-medium text-fg">{form.client_name || '—'}</strong></span><span>Date: <strong className="font-medium text-fg">{form.date_issued || '—'}</strong></span>
            <span>Terms: <strong className="font-medium text-fg">{form.due_date || '—'}</strong></span><span>P.O. No.: <strong className="font-medium text-fg">{form.cr_no || '—'}</strong></span>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-line text-xs sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="divide-y divide-line sm:border-r sm:border-line">
            {[['VATable Sales', totals.vatableSales], ['VAT-Exempt Sales', totals.vatExemptSales], ['Zero Rated Sales', totals.zeroRatedSales], ['VAT-Amount', totals.vatAmount]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 px-4 py-2"><span>{label}</span><strong className="num font-medium">{money(value)}</strong></div>)}
          </div>
          <div className="divide-y divide-line">
            {[['Total Sales (Vat Inclusive)', totals.totalSales], ['Less: VAT', totals.vat], ['Amount: Net of VAT', totals.netOfVat], ['Amount Due', totals.amountDue], ['Add: VAT', totals.addVat], ['Less: Withholding Tax', totals.withholdingTax], ['Total Amount Due', totals.totalAmountDue]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 px-4 py-2 text-right"><span>{label}</span><strong className="num font-medium">{money(value)}</strong></div>)}
          </div>
        </div>
      </section>}
    </Modal>
  );
}
