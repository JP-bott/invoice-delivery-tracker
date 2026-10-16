export function toCentavos(v) {
  const s = String(v).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Invalid amount (max 2 decimals)');
  const [p, c = ''] = s.split('.');
  return Number(p) * 100 + Number(c.padEnd(2, '0'));
}
export const toPesos = (c) => c / 100;
