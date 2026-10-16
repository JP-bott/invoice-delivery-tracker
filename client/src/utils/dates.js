const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD
export const today = (now = new Date()) => fmt.format(now);
const add = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const p = (n) => String(n).padStart(2, '0');
const eom = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function range(preset, now = new Date()) {
  const t = today(now), [y, m] = t.split('-').map(Number);
  const mo = (yy, mm) => ({ dateFrom: `${yy}-${p(mm)}-01`, dateTo: `${yy}-${p(mm)}-${p(eom(yy, mm))}` });
  switch (preset) {
    case 'today': return { dateFrom: t, dateTo: t };
    case 'last7': return { dateFrom: add(t, -6), dateTo: t };
    case 'last30': return { dateFrom: add(t, -29), dateTo: t };
    case 'month': return mo(y, m);
    case 'prevMonth': return m === 1 ? mo(y - 1, 12) : mo(y, m - 1);
    case 'year': return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
    default: return {};
  }
}
