import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import { STATUSES } from '../../utils/constants.js';
import { formatAmount } from '../../utils/money.js';
import { valueOf } from '../../utils/customFields.js';
import { MAX_ITEMS, blankItem, sanitizeDecimal } from '../../utils/items.js';
import { priceInvoice } from '../../../../shared/pricing.js';
import { sheetPricing } from '../../utils/sheetPricing.js';
import { dueDateFromDelivery } from '../../../../shared/dueDate.js';
import { api } from '../../utils/api.js';
import { splitInvoiceNo } from '../../utils/invoiceNo.js';
import Modal from '../Modal.jsx';
import { HoverCard } from '../ui.jsx';
import InvoicePreview from './InvoicePreview.jsx';
import ClientCombobox from './ClientCombobox.jsx';
import { INVOICE_STEPS, invoiceStepIssue, firstInvoiceStepIssue, invoiceStepForError } from '../../utils/invoiceWizard.js';

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
  const [step, setStep] = useState(0);
  const [stepMessage, setStepMessage] = useState('');
  const navigateStep = (target) => {
    if (saving || target === step) return;
    if (target > step) {
      for (let index = 0; index < target; index++) {
        const problem = invoiceStepIssue(form, index, fields);
        if (problem) {
          setStep(index);
          setStepMessage(problem.message);
          return;
        }
      }
    }
    setStep(target);
    setStepMessage('');
  };
  useEffect(() => {
    const errors = Object.keys(errs || {});
    if (errors.length) {
      setStep(Math.min(...errors.map(invoiceStepForError)));
      setStepMessage('Review the highlighted fields before saving.');
    }
  }, [errs]);
  const submitWizard = (event) => {
    event.preventDefault();
    if (saving) return;
    const problem = firstInvoiceStepIssue(form, fields);
    if (problem) {
      setStep(problem.step);
      setStepMessage(problem.message);
    } else if (step < INVOICE_STEPS.length - 1) {
      navigateStep(step + 1);
    } else {
      onSave();
    }
  };
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
  const originalNo = isNew ? (suggested.prefix === form.invoice_prefix ? suggested.number : '') : form.invoice_no || '';
  const hasOverride = form.invoice_number_override != null;
  const shownNumber = hasOverride ? form.invoice_number_override : splitInvoiceNo(originalNo).number;
  const shownNo = hasOverride ? `${form.invoice_prefix} - ${shownNumber}` : originalNo;
  const editableNumber = isNew || PREFIXES.includes(form.invoice_prefix);
  const error = (key) => errs[key] && <span id={`invoice-${key}-error`} role="alert" className="mt-1 block text-xs font-normal text-danger-ink">{errs[key]}</span>;
  const star = (key) => required.has(key) ? <span className="ml-0.5 text-danger" aria-hidden="true">*</span> : <span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span>;
  const setCustom = (id, value) => setForm({ ...form, custom_fields: { ...(form.custom_fields || {}), [id]: value } });
  const cfStar = (f) => (f.required ? <span className="ml-0.5 text-danger" aria-hidden="true">*</span> : <span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span>);
  // Products/services: any number of rows, each with a quantity.
  const items = form.items?.length ? form.items : [{ ...blankItem(), product_service: form.product_service || '' }];
  const textRows = Array.isArray(form.text_rows) ? form.text_rows : [];
  const setItems = (next) => setForm({ ...form, items: next });
  const setItem = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const addItem = () => {
    const at = items.length;
    setForm({ ...form, items: [...items, blankItem()], text_rows: textRows.map((r) => ({ ...r, after_item: r.after_item === at ? at + 1 : r.after_item })) });
    requestAnimationFrame(() => document.getElementById(`invoice-item-${at}-product`)?.focus());
  };
  const removeItem = (i) => setForm({ ...form, items: items.filter((_, j) => j !== i), text_rows: textRows.map((r) => ({ ...r, after_item: r.after_item > i ? r.after_item - 1 : r.after_item })) });
  const setTextRow = (i, patch) => setForm({ ...form, text_rows: textRows.map((r, j) => (i === j ? { ...r, ...patch } : r)) });
  const addTextRow = () => {
    const at = textRows.length;
    setForm({ ...form, text_rows: [...textRows, { text: '', after_item: items.length, is_priced: false, quantity: '1', unit_cost: '' }] });
    requestAnimationFrame(() => document.getElementById(`invoice-text-row-${at}`)?.focus());
  };
  const removeTextRow = (i) => setForm({ ...form, text_rows: textRows.filter((_, j) => i !== j) });
  const moveTextRow = (i, direction) => {
    const dest = i + direction;
    if (dest < 0 || dest >= textRows.length) return;
    const next = [...textRows];
    [next[i], next[dest]] = [next[dest], next[i]];
    setForm({ ...form, text_rows: next });
  };
  const priced = priceInvoice(items, textRows);
  const total = priced.subtotal ?? 0; // invoice amount = sum of line amounts (VAT-inclusive, as before)
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
    <Modal title={`${form.id ? 'Edit' : 'Add'} invoice`} description={form.id ? `Update ${form.invoice_no || 'this invoice'}.` : 'Record a new invoice and its delivery details.'} onClose={onCancel} width="max-w-3xl" dismissOnBackdrop={false}
      footer={<>
        <HoverCard content="Preview invoice" width="w-auto">
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setPreview(true)} aria-label="Preview invoice" aria-haspopup="dialog"><Eye size={17} aria-hidden="true" /></button>
        </HoverCard>
        <span className="mr-auto text-xs text-fg-muted">Step {step + 1} of {INVOICE_STEPS.length}</span>
        {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => navigateStep(step - 1)} disabled={saving}><ArrowLeft size={15}/> Back</button>}
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" form="invoice-form" className="btn btn-primary min-w-32" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true"/> : step === 5 ? <Check size={15}/> : <ArrowRight size={15}/>} {saving ? 'Saving…' : step === 5 ? (form.id ? 'Save changes' : 'Add invoice') : 'Continue'}</button>
      </>}>
      <nav aria-label="Invoice form steps" className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {INVOICE_STEPS.map((item, i) => <button key={item.id} type="button" disabled={saving} onClick={() => navigateStep(i)} aria-current={step === i ? 'step' : undefined} className={`rounded-lg border px-2 py-2 text-left text-xs ${step === i ? 'border-[var(--brand)] bg-surface-2 font-semibold text-fg' : 'border-line text-fg-muted hover:bg-surface-2'}`}><span className="mb-1 block text-[10px] opacity-75">{i + 1} / 6</span><span className="block truncate">{item.label}</span></button>)}
      </nav>
      <div className="mb-5"><div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Invoice step progress" aria-valuemin={0} aria-valuemax={6} aria-valuenow={step + 1}><div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${(step + 1) / 6 * 100}%` }}/></div><h3 className="mt-4 text-base font-semibold text-fg">{INVOICE_STEPS[step].title}</h3><p className="mt-1 text-sm text-fg-muted">{INVOICE_STEPS[step].description}</p>{stepMessage && <p role="alert" className="mt-2 text-sm text-warning-ink">{stepMessage}</p>}</div>
      <form id="invoice-form" onSubmit={submitWizard} className="space-y-5" noValidate>
        <div className={step === 0 ? "" : "hidden"}><Group id="invoice-details-heading" title="Invoice details" description="Identify the transaction.">
          {field('date_issued', 'Date Issued', 'date')}
          <div className="label">
            <label htmlFor="invoice_number" className="mb-1.5 block">Invoice No.<span className="ml-1.5 text-xs font-normal text-fg-subtle">{isNew ? 'Auto-suggested, editable' : 'Editable number'}</span></label>
            <span className="flex">
              <select aria-label="Invoice type" disabled={!isNew || saving} className="input !w-auto rounded-r-none border-r-0 bg-surface-2 font-medium" value={form.invoice_prefix} onChange={(event) => setForm({ ...form, invoice_prefix: event.target.value, invoice_number_override: null })}>
                {PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
                {!PREFIXES.includes(form.invoice_prefix) && <option value={form.invoice_prefix}>{form.invoice_prefix || 'None'} (current)</option>}
              </select>
              <input id="invoice_number" type="text" inputMode="numeric" autoComplete="off" disabled={!editableNumber || saving} aria-invalid={Boolean(errs.invoice_no || errs.invoice_prefix)} aria-describedby="invoice-number-note" className={`${cls('invoice_no')} num min-w-0 rounded-l-none`} value={shownNumber} onChange={(event) => setForm({ ...form, invoice_number_override: event.target.value })} placeholder={isNew && !suggested.failed ? 'Loading…' : isNew ? 'Assigned on save' : ''} />
            </span>
            {error('invoice_no')}{error('invoice_prefix')}
            {hasOverride && editableNumber && <button type="button" disabled={saving} className="mt-1 text-xs font-medium text-fg underline underline-offset-2 hover:text-fg-muted" onClick={() => setForm({ ...form, invoice_number_override: null })}>{isNew ? 'Use automatic number' : 'Restore saved number'}</button>}
            <span id="invoice-number-note" className="mt-1 block text-xs font-normal text-fg-muted" role="status">
              {!editableNumber ? 'Legacy invoice number is preserved.' : hasOverride ? 'Custom number: digits only. Duplicate numbers cannot be saved.' : isNew ? (suggested.failed ? <span className="text-warning-ink">Could not load the suggestion. The number will be assigned automatically on save.</span> : 'Automatic number is based on the latest saved number. It is confirmed on save.') : 'The number is unchanged unless you edit it. The invoice type stays fixed.'}
            </span>
          </div>
          {field('cr_no', 'CR No.')}
          <label className="label" htmlFor="invoice-terms">
            <span className="mb-1.5 block">Terms<span className="ml-1.5 text-xs font-normal text-fg-subtle">Fixed</span></span>
            <input id="invoice-terms" type="text" readOnly tabIndex={-1} aria-readonly="true" className="input bg-surface-2 text-fg-muted" value={TERMS} />
          </label>
        </Group>
        </div>
        <div className={step === 1 ? "" : "hidden"}><Group id="invoice-client-heading" title="Client & delivery" description="Who it is for and what was delivered.">
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
        </Group></div>
        <div className={step === 2 ? "" : "hidden"}><Group id="invoice-items-heading" title="Products & services" description="Billable items and supporting text.">
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
                      {!it.is_title && <>
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
                      </>}
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted"><input type="checkbox" role="switch" checked={Boolean(it.is_title)} onChange={(e) => setItem(i, { is_title: e.target.checked })} /> Use as title</label>
                    {error(pKey)}{error(uKey)}{error(qKey)}
                  </div>
                );
              })}
            </div>
            {error('product_service')}
            {form.id && form.amount != null && items.some((it) => !String(it.unit_cost ?? '').trim()) && <p className="mt-2 text-xs text-warning-ink" role="status">This invoice was saved before unit costs were recorded (amount ₱{formatAmount(form.amount)}). Enter a unit cost for each item; the amount is recalculated from them when you save.</p>}
            <button type="button" className="btn btn-secondary mt-2.5" onClick={addItem} disabled={items.length >= MAX_ITEMS}><Plus size={15} aria-hidden="true" />Add Another</button>
          </fieldset>
          <fieldset className="sm:col-span-2">
            <legend className="label mb-1.5 block">Additional nature of service text <span className="text-xs font-normal text-fg-subtle">(optional)</span></legend>
            <p className="mb-3 text-xs text-fg-muted">Add supporting notes or toggle Priced for billable specifications. Choose where each row appears in the invoice.</p>
            <div className="space-y-3">
              {textRows.map((entry, i) => {
                const tKey = `text_rows_${i}_text`, pKey = `text_rows_${i}_after_item`, line = priced.textLines[i];
                return (
                  <div key={i} className="rounded-xl border border-line bg-surface-2 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-fg">Text row {i + 1}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" className="btn btn-secondary btn-icon !h-8 !w-8" disabled={i === 0} onClick={() => moveTextRow(i, -1)} aria-label={`Move text row ${i + 1} up`} title="Move up in text row order"><ArrowUp size={15} aria-hidden="true" /></button>
                        <button type="button" className="btn btn-secondary btn-icon !h-8 !w-8" disabled={i === textRows.length - 1} onClick={() => moveTextRow(i, 1)} aria-label={`Move text row ${i + 1} down`} title="Move down in text row order"><ArrowDown size={15} aria-hidden="true" /></button>
                        <button type="button" className="btn btn-secondary btn-icon !h-8 !w-8" onClick={() => removeTextRow(i)} aria-label={`Remove text row ${i + 1}`} title="Remove text row"><Trash2 size={15} aria-hidden="true" /></button>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-fg-muted"><input type="checkbox" role="switch" checked={Boolean(entry.is_priced)} onChange={(e) => setTextRow(i, { is_priced: e.target.checked })} /> Priced</label>
                    <label className="label block" htmlFor={`invoice-text-row-${i}`}>
                      <span className="mb-1 block text-xs">Nature of service text</span>
                      <textarea id={`invoice-text-row-${i}`} rows={2} maxLength={2000} required placeholder="Enter text exactly as it should appear in its own invoice row" className={cls(tKey) + ' min-h-16 resize-y whitespace-pre-wrap'} value={entry.text} onChange={(e) => setTextRow(i, { text: e.target.value })} {...aria(tKey)} />
                      {error(tKey)}
                    </label>
                    {entry.is_priced && <div className="grid grid-cols-3 gap-2">
                      <label className="label">Qty<input id={`invoice-text-qty-${i}`} className="input" inputMode="decimal" value={entry.quantity ?? '1'} onChange={(e) => setTextRow(i, { quantity: sanitizeDecimal(e.target.value, 3) })} />{error(`text_rows_${i}_quantity`)}</label>
                      <label className="label">Unit Price (₱)<input id={`invoice-text-price-${i}`} className="input" inputMode="decimal" value={entry.unit_cost ?? ''} onChange={(e) => setTextRow(i, { unit_cost: sanitizeDecimal(e.target.value, 2) })} />{error(`text_rows_${i}_unit_cost`)}</label>
                      <div className="label">Amount (₱)<output className="input flex items-center justify-end">{line?.amount == null ? '—' : money(line.amount)}</output></div>
                    </div>}
                    <label className="label block" htmlFor={`invoice-text-position-${i}`}>
                      <span className="mb-1 block text-xs">Place this row</span>
                      <select id={`invoice-text-position-${i}`} className={cls(pKey)} value={entry.after_item} onChange={(e) => setTextRow(i, { after_item: Number(e.target.value) })} {...aria(pKey)}>
                        <option value={0}>Above the first product/service</option>
                        {items.map((item, index) => <option key={index} value={index + 1}>{index === items.length - 1 ? 'Below the last product/service' : `After product ${index + 1}`}{item.product_service ? ` · ${item.product_service}` : ''}</option>)}
                      </select>
                      {error(pKey)}
                    </label>
                  </div>
                );
              })}
            </div>
            {error('text_rows')}
            <button type="button" className="btn btn-secondary mt-2.5" onClick={addTextRow} disabled={textRows.length >= 50}><Plus size={15} aria-hidden="true" />Add description-only row</button>
          </fieldset>
        </Group>
        </div>
        <div className={step === 3 ? "" : "hidden"}><Group id="payment-heading" title="Payment" description="Amount billed, received and current payment state.">
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
        </div>
        <div className={step === 4 ? "" : "hidden"}>
        {fields.length > 0 && <Group id="custom-fields-heading" title="Additional details" description="Custom fields from Settings.">{fields.map(customField)}</Group>}
        <label className="label block" htmlFor="invoice-remarks">
          <span className="mb-1.5 block">Remarks<span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span></span>
          <textarea id="invoice-remarks" rows="3" className="input resize-y" value={form.remarks} onChange={set('remarks')} placeholder="Add delivery notes or payment details" />
        </label></div>
        {step === 5 && <section aria-label="Review invoice" className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-2 p-4"><div className="flex justify-between gap-2"><strong>Invoice & client</strong><button type="button" className="text-xs underline" onClick={() => navigateStep(0)}>Edit</button></div><p className="mt-2 text-sm">{shownNo || 'Number assigned on save'} · {form.date_issued}</p><p className="text-sm">{form.client_name} · Delivery: {form.delivery_date || 'Not set'}</p></div>
          <div className="rounded-xl border border-line p-4"><div className="flex justify-between gap-2"><strong>Products & services</strong><button type="button" className="text-xs underline" onClick={() => navigateStep(2)}>Edit</button></div>{sheetPricing({ ...form, items, text_rows: textRows }).rows.map((line, i) => <div key={i} className="mt-2 flex justify-between gap-2 text-sm"><span className={line.title ? 'font-semibold' : line.spec ? 'pl-3' : ''}>{line.title ? line.d : `${line.q ? line.q + ' × ' : ''}${line.d}`}</span><span>{line.a ? '₱' + line.a : ''}</span></div>)}<div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold"><span>Invoice total</span><span>₱{money(total)}</span></div></div>
          <div className="rounded-xl border border-line bg-surface-2 p-4"><div className="flex justify-between gap-2"><strong>Payment & additional information</strong><button type="button" className="text-xs underline" onClick={() => navigateStep(3)}>Edit</button></div><p className="mt-2 text-sm">{form.payment_status} · Paid ₱{formatAmount(form.amount_paid || '0')}</p>{form.remarks && <p className="mt-2 whitespace-pre-wrap text-sm">{form.remarks}</p>}{fields.length > 0 && <button type="button" className="mt-2 text-xs underline" onClick={() => navigateStep(4)}>Edit custom fields</button>}</div>
          <p className="text-xs text-fg-muted">Use Preview to inspect the invoice before saving.</p>
        </section>}
      </form>
      {preview && <InvoicePreview invoice={{ ...form, invoice_no: shownNo, terms: TERMS }} onClose={() => setPreview(false)} />}
    </Modal>
  );
}
