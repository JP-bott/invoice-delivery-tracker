import { describe, expect, it } from 'vitest';
import { INVOICE_STEPS, invoiceStepIssue, firstInvoiceStepIssue, invoiceStepForError } from '../../client/src/utils/invoiceWizard.js';

const valid = () => ({
  invoice_prefix: 'SVI', date_issued: '2026-10-30', client_name: 'Acme',
  delivery_date: '2026-10-30', items: [{ product_service: 'Consulting', unit_cost: '1250.00', quantity: '2' }],
  text_rows: [{ text: 'Installation included', after_item: 1 }],
  payment_status: 'Pending', amount_paid: '0', custom_fields: {}, remarks: '',
});

describe('invoice stepper validation', () => {
  it('contains six stable stages and accepts a complete invoice', () => {
    expect(INVOICE_STEPS.map(x => x.id)).toEqual(['details', 'client', 'items', 'payment', 'additional', 'review']);
    expect(firstInvoiceStepIssue(valid())).toBe(null);
  });
  it('validates one category at a time', () => {
    expect(invoiceStepIssue({ ...valid(), date_issued: '' }, 0).focusId).toBe('invoice-date_issued');
    expect(invoiceStepIssue({ ...valid(), client_name: '' }, 1).focusId).toBe('invoice-client_name');
    expect(invoiceStepIssue({ ...valid(), items: [{ product_service: '', unit_cost: '', quantity: '1' }] }, 2).step).toBeUndefined();
    expect(invoiceStepIssue({ ...valid(), text_rows: [{ text: '', after_item: 0 }] }, 2).focusId).toBe('invoice-text-row-0');
    expect(invoiceStepIssue({ ...valid(), payment_status: 'Paid' }, 3).message).toMatch(/Paid requires/);
  });
  it('detects first invalid stage without changing invoice state', () => {
    const form = { ...valid(), client_name: '', text_rows: [{ text: '', after_item: 1 }] };
    expect(firstInvoiceStepIssue(form).step).toBe(1);
    expect(form.client_name).toBe('');
  });
  it('routes API errors to the correct category', () => {
    expect(invoiceStepForError('invoice_no')).toBe(0);
    expect(invoiceStepForError('client_name')).toBe(1);
    expect(invoiceStepForError('items_0_quantity')).toBe(2);
    expect(invoiceStepForError('text_rows_0_text')).toBe(2);
    expect(invoiceStepForError('amount_paid')).toBe(3);
    expect(invoiceStepForError('cf_19')).toBe(4);
  });
  it('checks additional required fields while preserving optional ones', () => {
    const fields = [{ id: 7, label: 'Purchase order', input_type: 'text', required: true }];
    expect(firstInvoiceStepIssue(valid(), fields).step).toBe(4);
    expect(firstInvoiceStepIssue({ ...valid(), custom_fields: { 7: 'PO-001' } }, fields)).toBe(null);
  });
});
