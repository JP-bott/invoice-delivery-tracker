// Due dates are 30 calendar days after delivery, not 30 local-time 24-hour periods.
export const PAYMENT_TERM_DAYS = 30;

export function dueDateFromDelivery(deliveryDate) {
  if (typeof deliveryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return null;
  const date = new Date(deliveryDate + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== deliveryDate) return null;
  date.setUTCDate(date.getUTCDate() + PAYMENT_TERM_DAYS);
  return date.toISOString().slice(0, 10);
}
