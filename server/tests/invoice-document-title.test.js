import { describe, expect, it } from 'vitest';
import { invoiceDocumentTitle } from '../../shared/invoiceNumber.js';

describe('SI and SVI invoice document labels', () => {
  it('uses Sales Invoice for saved SI numbers', () => {
    expect(invoiceDocumentTitle({ invoice_no: 'SI - 0001' })).toBe('Sales Invoice');
    expect(invoiceDocumentTitle({ invoice_no: 'SI0006' })).toBe('Sales Invoice');
  });
  it('uses Service Invoice for saved SVI numbers', () => {
    expect(invoiceDocumentTitle({ invoice_no: 'SVI - 0021' })).toBe('Service Invoice');
  });
  it('uses form selection when a new invoice has no assigned number', () => {
    expect(invoiceDocumentTitle({ invoice_prefix: 'SI' })).toBe('Sales Invoice');
    expect(invoiceDocumentTitle({ invoice_prefix: 'SVI' })).toBe('Service Invoice');
  });
  it('prefers the persisted type over a stale form selection', () => {
    expect(invoiceDocumentTitle({ invoice_no: 'SI - 0002', invoice_prefix: 'SVI' })).toBe('Sales Invoice');
  });
  it('keeps a service label for unknown legacy invoice numbers', () => {
    expect(invoiceDocumentTitle({ invoice_no: 'OLD-002' })).toBe('Service Invoice');
  });
});
