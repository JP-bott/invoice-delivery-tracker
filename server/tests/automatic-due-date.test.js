import { describe, it, expect } from 'vitest';
import { dueDateFromDelivery } from '../../shared/dueDate.js';
import { validateInvoice } from '../services/validate.js';

const original = { date_issued: '2026-09-01', invoice_prefix: 'SI', client_name: 'Test', product_service: 'Service', amount: 100, payment_status: 'Pending', amount_paid: 0 };
describe('automatic delivery-based deadlines', () => {
  it('adds 30 calendar days across leap years and year boundaries', () => {
    expect(dueDateFromDelivery('2024-02-29')).toBe('2024-03-30');
    expect(dueDateFromDelivery('2026-12-15')).toBe('2027-01-14');
    expect(dueDateFromDelivery('2026-02-30')).toBe(null);
    expect(dueDateFromDelivery('')).toBe(null);
  });
  it('ignores manual deadlines and tracks delivery dates', () => {
    const valid = validateInvoice({ ...original, delivery_date: '2026-09-15', due_date: '2099-01-01' });
    expect(valid.errors).toEqual({});
    expect(valid.value.due_date).toBe('2026-10-15');
    expect(validateInvoice({ ...original, due_date: '2026-01-01' }).value.due_date).toBe(null);
    expect(validateInvoice({ ...original, delivery_date: '2026-09-16' }).value.due_date).toBe('2026-10-16');
  });
});
