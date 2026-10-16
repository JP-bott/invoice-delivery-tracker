const formatter = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatAmount(value) {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw) return '';
  const number = Number(raw);
  return Number.isFinite(number) ? formatter.format(number) : value;
}
