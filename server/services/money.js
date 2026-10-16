export function toCentavos(v) {
  const s = String(v).trim();
  const plain = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s) ? s.replace(/,/g, '') : '';
  if (!plain) throw new Error('Invalid amount (max 2 decimals)');
  const [p, c = ''] = plain.split('.');
  return Number(p) * 100 + Number(c.padEnd(2, '0'));
}
export const toPesos = (c) => c / 100;
