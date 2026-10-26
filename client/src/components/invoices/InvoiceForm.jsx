import { useEffect, useState } from 'react';
import { Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import { STATUSES } from '../../utils/constants.js';
import { formatAmount } from '../../utils/money.js';
import { valueOf } from '../../utils/customFields.js';
import { MAX_ITEMS, blankItem, sanitizeDecimal } from '../../utils/items.js';
import { priceItems } from '../../../../shared/pricing.js';
import { dueDateFromDelivery } from '../../../../shared/dueDate.js';
import { api } from '../../utils/api.js';
import { splitInvoiceNo } from '../../utils/invoiceNo.js';
import Modal from '../Modal.jsx';
import { HoverCard } from '../ui.jsx';
import InvoicePreview from './InvoicePreview.jsx';
import ClientCombobox from './ClientCombobox.jsx';

const required = new Set(['date_issued', 'client_name']);
const TERMS = '30-days'; // display only: the server always saves 30-days
const PREFIXES = ['SVI', 'SI'];
const hiddenPaidStatuses = new Set(['Pending', 'No', 'Cancelled']);

const numericAmount = (value) => Number(String(value ?? '').replace(/,/g, ''));
const hint = (total, paid) => { const p = numericAmount(paid); return p === 0 ? 'Pending' : p >= total ? 'Paid' : 'Partially Paid'; };
const money = (centavos) => formatAmount(centavos / 100);

function Group({ id, title, description, children }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div><h3 id={id} className="eyebrow">{title}</h3>{description && <p className="mt-1 text-xs text-fg-muted">{description}</p>}</div>
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function InvoiceForm({ form, setForm, errs, onSave, onCancel, products = [], clients = [], fields = [], saving = false }) {
  const [preview, setPreview] = useState(false);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  // Invoice numbers are assigned by the server when the invoice is saved. For a new invoice this is only a suggestion (a read-only
  // request that consumes nothing), refreshed whenever the type changes; an existing invoice always shows its stored number.
  const isNew = !form.id;
  const [suggested, setSuggested] = useState({ prefix: '', number: '', failed: false });
  useEffect(() => {
    if (!isNew) return undefined;
    let current = true;
    setSuggested({ prefix: form.invoice_prefix, number: '', failed: false });
    api(`/api/invoices/next-number?prefix=${encodeURIComponent(form.invoice_prefix)}`)
      .then((r) => current && setSuggested({ prefix: form.invoice_prefix, number: r.number, failed: false }))
      .catch(() => current && setSuggested({ prefix: form.invoice_prefix, number: '', failed: true }));
    return () => { current = false; };
  }, [isNew, form.invoice_prefix]);
  const shownNo = isNew ? (suggested.prefix === form.invoice_prefix ? suggested.number : '') : form.invoice_no || '';
  const shownNumber = splitInvoiceNo(shownNo).number;
  const error = (key) => errs[key] && <span id={`invoice-${key}-error`} role="alert" className="mt-1 block text-xs font-normal text-danger-ink">{errs[key]}</span>;
  const star = (key) => required.has(key) ? <span className="ml-0.5 text-danger" aria-hidden="true">*</span> : <span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span>;
  const setCustom = (id, value) => setForm({ ...form, custom_fields: { ...(form.custom_fields || {}), [id]: value } });
  const cfStar = (f) => (f.required ? <span className="ml-0.5 text-danger" aria-hidden="true">*</span> : <span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span>);
  // Products/services: any number of rows, each with a quantity.
  const items = form.items?.length ? form.items : [{ ...blankItem(), product_service: form.product_service || '' }];
  const setItems = (next) => setForm({ ...form, items: next });
  const setItem = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const addItem = () => { const at = items.length; setItems([...items, blankItem()]); requestAnimationFrame(() => document.getElementById(`invoice-item-${at}-product`)?.focus()); };
  const removeItem = (i) => setItems(items.filter((_, j) => j !== i));
  const priced = priceItems(items);
  const total = priced.lines.reduce((sum, line) => sum + (line.amount ?? 0), 0); // invoice amount = sum of line amounts (VAT-inclusive, as before)
  const calculatedDueDate = dueDateFromDelivery(form.delivery_date) || '';
  const cls = (key) => `input ${errs[key] ? 'input-error' : ''}`;
  const aria = (key) => ({ 'aria-invalid': Boolean(errs[key]), 'aria-describedby': errs[key] ? `invoice-${key}-error` : undefined });

  const field = (key, label, type = 'text', extra = {}) => (
    <label key={key} className="label" htmlFor={`invoice-${key}`}>
      <span className="mb-1.5 block">{label}{star(key)}</span>
      <input id={`invoice-${key}`} type={type} required={required.has(key)} {...aria(key)} className={cls(key)} value={form[key]} onChange={set(key)} {...extra} />
      {error(key)}
    </label>
  );
  const amountField = (key, label) => (
    <label className="label" htmlFor={`invoice-${key}`}>
      <span className="mb-1.5 block">{label}<span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span></span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle" aria-hidden="true">₱</span>
        <input id={`invoice-${key}`} type="text" inputMode="decimal" autoComplete="off" {...aria(key)} className={`${cls(key)} num pl-7 text-right`} value={form[key]} onChange={set(key)} onBlur={() => setForm({ ...form, [key]: formatAmount(form[key]) })} placeholder="0.00" />
      </span>
      {error(key)}
    </label>
  );

  // One input per custom field (Settings > Invoice fields). Errors arrive keyed cf_<id>.
  const customField = (f) => {
    const key = `cf_${f.id}`, id = `invoice-${key}`, value = valueOf(f, form.custom_fields), on = (e) => setCustom(f.id, e.target.value);
    if (f.input_type === 'checkbox') {
      return (
        <div key={f.id} className="self-end pb-2">
          <label className="flex items-center gap-2 text-sm font-medium text-fg" htmlFor={id}>
            <input id={id} type="checkbox" className="h-4 w-4 accent-[var(--brand)]" required={f.required} {...aria(key)} checked={value === 'true'} onChange={(e) => setCustom(f.id, e.target.checked ? 'true' : 'false')} />
            <span>{f.label}{cfStar(f)}</span>
          </label>
          {error(key)}
        </div>
      );
    }
    let input;
    if (f.input_type === 'dropdown') {
      input = (
        <select id={id} required={f.required} {...aria(key)} className={cls(key)} value={value} onChange={on}>
          <option value="">Select an option</option>
          {value && !f.options.includes(value) && <option value={value}>{value} (current)</option>}
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>);
    } else if (f.input_type === 'textarea') {
      input = <textarea id={id} rows="3" required={f.required} {...aria(key)} className={`${cls(key)} resize-y`} value={value} onChange={on} maxLength={2000} />;
    } else {
      const type = { number: 'number', date: 'date', email: 'email', url: 'url' }[f.input_type] || 'text';
      input = <input id={id} type={type} step={type === 'number' ? 'any' : undefined} required={f.required} {...aria(key)} className={`${cls(key)} ${type === 'number' ? 'num' : ''}`} value={value} onChange={on} maxLength={f.input_type === 'text' ? 500 : undefined} />;
    }
    return (
      <label key={f.id} className={`label ${f.input_type === 'textarea' ? 'sm:col-span-2' : ''}`} htmlFor={id}>
        <span className="mb-1.5 block">{f.label}{cfStar(f)}</span>
        {input}
        {error(key)}
      </label>
    );
  };

  return (
    <Modal title={`${form.id ? 'Edit' : 'Add'} invoice`} description={form.id ? `Update ${form.invoice_no || 'this invoice'}.` : 'Record a new invoice and its delivery details.'} onClose={onCancel} width="max-w-2xl" dismissOnBackdrop={false}
      footer={<>
        <HoverCard content="Preview invoice" width="w-auto">
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setPreview(true)} aria-label="Preview invoice" aria-haspopup="dialog"><Eye size={17} aria-hidden="true" /></button>
        </HoverCard>
        <p className="mr-auto hidden text-xs text-fg-muted sm:block"><span className="text-danger">*</span> Required</p>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" form="invoice-form" className="btn btn-primary min-w-32" disabled={saving}>{saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}{saving ? 'Saving…' : form.id ? 'Save changes' : 'Add invoice'}</button>
      </>}>
      <form id="invoice-form" onSubmit={(event) => { event.preventDefault(); if (!saving) onSave(); }} className="space-y-6" noValidate={false}>
        <Group id="invoice-details-heading" title="Invoice details" description="Identify the transaction.">
          {field('date_issued', 'Date Issued', 'date')}
          <div className="label">
            <label htmlFor="invoice_number" className="mb-1.5 block">Invoice No.<span className="ml-1.5 text-xs font-normal text-fg-subtle">Assigned automatically</span></label>
            <span className="flex">
              <select aria-label="Invoice type" disabled={!isNew} className="input !w-auto rounded-r-none border-r-0 bg-surface-2 font-medium" value={form.invoice_prefix} onChange={set('invoice_prefix')}>
                {PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
                {!PREFIXES.includes(form.invoice_prefix) && <option value={form.invoice_prefix}>{form.invoice_prefix || 'None'} (current)</option>}
              </select>
              <input id="invoice_number" type="text" readOnly tabIndex={-1} aria-readonly="true" aria-invalid={Boolean(errs.invoice_no || errs.invoice_prefix)} aria-describedby="invoice-number-note" className={`${cls('invoice_no')} num rounded-l-none bg-surface-2 text-fg-muted`} value={shownNumber} placeholder={isNew && !suggested.failed ? 'Loading…' : ''} />
            </span>
            {error('invoice_no')}{error('invoice_prefix')}
            <span id="invoice-number-note" className="mt-1 block text-xs font-normal text-fg-muted" role="status">
              {isNew ? (suggested.failed ? <span className="text-warning-ink">Could not load the next number; one is still assigned when you save.</span> : 'Next number for this type. The final number is confirmed when the invoice is saved.') : 'An invoice keeps its number.'}
            </span>
          </div>
          {field('cr_no', 'CR No.')}
          <label className="label" htmlFor="invoice-terms">
            <span className="mb-1.5 block">Terms<span className="ml-1.5 text-xs font-normal text-fg-subtle">Fixed</span></span>
            <input id="invoice-terms" type="text" readOnly tabIndex={-1} aria-readonly="true" className="input bg-surface-2 text-fg-muted" value={TERMS} />
          </label>
        </Group>
        <Group id="invoice-client-heading" title="Client & delivery" description="Who it is for and what was delivered.">
          <div className="label">
            <label htmlFor="invoice-client_name" className="mb-1.5 block">Client Name{star('client_name')}</label>
            <ClientCombobox id="invoice-client_name" value={form.client_name} tin={form.client_tin ?? ''} address={form.client_address ?? ''} clients={clients} invalid={Boolean(errs.client_name)}
              describedBy={errs.client_name ? 'invoice-client_name-error' : undefined} onChange={(patch) => setForm({ ...form, ...patch })} />
            {error('client_name')}
          </div>
          {field('delivery_date', 'Delivery Date', 'date')}
          <label className="label" htmlFor="invoice-due_date">
            <span className="mb-1.5 block">Due Date<span className="ml-1.5 text-xs font-normal text-fg-subtle">Calculated automatically</span></span>
            <input id="invoice-due_date" type="text" readOnly tabIndex={-1} aria-readonly="true" className="input bg-surface-2 text-fg-muted" value={calculatedDueDate} placeholder="Awaiting delivery date" />
            <span className="mt-1 block text-xs font-normal text-fg-muted">30 calendar days after Delivery Date.</span>
          </label>
          <fieldset className="sm:col-span-2" aria-describedby={errs.product_service ? 'invoice-product_service-error' : undefined}>
            <legend className="label mb-1.5 block">Products/Services<span className="ml-0.5 text-danger" aria-hidden="true">*</span></legend>
            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_5rem_7.5rem_2.25rem] gap-2 text-xs font-medium text-fg-muted sm:grid" aria-hidden="true">
                <span>Product/Service</span><span className="text-right">Unit Cost (₱)</span><span className="text-right">Qty</span><span className="text-right">Amount (₱)</span><span />
              </div>
              {items.map((it, i) => {
                const pKey = `items_${i}_product_service`, uKey = `items_${i}_unit_cost`, qKey = `items_${i}_quantity`, line = priced.lines[i];
                const mobileLabel = 'mb-0.5 block text-[11px] text-fg-subtle sm:hidden';
                return (
                  <div key={i}>
                    <div className="grid grid-cols-3 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_5rem_7.5rem_2.25rem]">
                      <div className="col-span-3 flex items-start gap-2 sm:contents">
                        <select id={`invoice-item-${i}-product`} aria-label={`Product or service ${i + 1}`} required {...aria(pKey)} className={`${cls(pKey)} min-w-0 flex-1 sm:flex-none`} value={it.product_service} onChange={(e) => setItem(i, { product_service: e.target.value })}>
                          <option value="">{products.length ? 'Select a product or service' : 'No options configured'}</option>
                          {it.product_service && !products.some((p) => p.name === it.product_service) && <option value={it.product_service}>{it.product_service} (current)</option>}
                          {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                        {items.length > 1
                          ? <button type="button" className="btn btn-secondary btn-icon sm:order-last" onClick={() => removeItem(i)} aria-label={`Remove item ${i + 1}`}><Trash2 size={16} aria-hidden="true" /></button>
                          : <span aria-hidden="true" className="sm:order-last" />}
                      </div>
                      <div className="min-w-0">
                        <span className={mobileLabel} aria-hidden="true">Unit cost (₱)</span>
                        <input id={`invoice-item-${i}-unit-cost`} type="text" inputMode="decimal" autoComplete="off" required aria-label={`Unit cost for item ${i + 1}`} placeholder="0.00" {...aria(uKey)} className={`${cls(uKey)} num text-right`} value={it.unit_cost ?? ''} onChange={(e) => setItem(i, { unit_cost: sanitizeDecimal(e.target.value, 2) })} onBlur={() => setItem(i, { unit_cost: formatAmount(it.unit_cost) })} />
                      </div>
                      <div className="min-w-0">
                        <span className={mobileLabel} aria-hidden="true">Qty</span>
                        <input id={`invoice-item-${i}-quantity`} type="text" inputMode="decimal" autoComplete="off" required aria-label={`Quantity for item ${i + 1}`} placeholder="Qty" {...aria(qKey)} className={`${cls(qKey)} num text-right`} value={it.quantity} onChange={(e) => setItem(i, { quantity: sanitizeDecimal(e.target.value, 3) })} />
                      </div>
                      <div className="min-w-0">
                        <span className={mobileLabel} aria-hidden="true">Amount (₱)</span>
                        <output aria-label={`Amount for item ${i + 1}`} className="num flex h-9 items-center justify-end truncate rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium text-fg">{line.amount == null ? '—' : money(line.amount)}</output>
                      </div>
                    </div>
                    {error(pKey)}{error(uKey)}{error(qKey)}
                  </div>
                );
              })}
            </div>
            {error('product_service')}
            {form.id && form.amount != null && items.some((it) => !String(it.unit_cost ?? '').trim()) && <p className="mt-2 text-xs text-warning-ink" role="status">This invoice was saved before unit costs were recorded (amount ₱{formatAmount(form.amount)}). Enter a unit cost for each item; the amount is recalculated from them when you save.</p>}
            <button type="button" className="btn btn-secondary mt-2.5" onClick={addItem} disabled={items.length >= MAX_ITEMS}><Plus size={15} aria-hidden="true" />Add Another</button>
          </fieldset>
        </Group>
        <Group id="payment-heading" title="Payment" description="Amount billed, received and current payment state.">
          <div className="label">
            <span className="mb-1.5 block" id="invoice-amount-label">Invoice Amount<span className="ml-1.5 text-xs font-normal text-fg-subtle">Calculated</span></span>
            <output id="invoice-amount" aria-labelledby="invoice-amount-label" aria-live="polite" className="num flex h-9 items-center justify-between rounded-lg border border-line bg-surface-2 px-3 text-sm font-semibold text-fg"><span aria-hidden="true" className="font-normal text-fg-subtle">₱</span>{money(total)}</output>
            <span className="mt-1 block text-xs font-normal text-fg-muted">Sum of the line amounts (VAT-inclusive). VAT and withholding tax are shown in the preview.</span>
          </div>
          <label className="label" htmlFor="invoice-payment_status">
            <span className="mb-1.5 block">Payment Status</span>
            <select id="invoice-payment_status" {...aria('payment_status')} className={cls('payment_status')} value={form.payment_status} onChange={set('payment_status')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
            {error('payment_status')}
          </label>
          {!hiddenPaidStatuses.has(String(form.payment_status).trim()) && <>
            {amountField('amount_paid', 'Amount Paid')}
            {form.payment_status !== 'Cancelled' && hint(total / 100, form.amount_paid) !== form.payment_status && <p className="self-end pb-2 text-xs text-warning-ink" role="status">Suggested status: {hint(total / 100, form.amount_paid)}</p>}
          </>}
        </Group>
        {fields.length > 0 && <Group id="custom-fields-heading" title="Additional details" description="Custom fields from Settings.">{fields.map(customField)}</Group>}
        <label className="label block" htmlFor="invoice-remarks">
          <span className="mb-1.5 block">Remarks<span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span></span>
          <textarea id="invoice-remarks" rows="3" className="input resize-y" value={form.remarks} onChange={set('remarks')} placeholder="Add delivery notes or payment details" />
        </label>
      </form>
      {preview && <InvoicePreview invoice={{ ...form, invoice_no: shownNo, terms: TERMS }} onClose={() => setPreview(false)} />}
    </Modal>
  );
}
