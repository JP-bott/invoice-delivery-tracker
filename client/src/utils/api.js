export const peso = (n) => '₱' + new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
export async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body && JSON.stringify(opts.body) });
  if (r.status === 204) return null;
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'Request failed'), { fields: j.error?.fields || {} });
  return j;
}
export const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
