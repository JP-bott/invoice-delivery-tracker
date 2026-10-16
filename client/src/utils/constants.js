export const STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Cancelled'];
export const STATUS_COLORS = { Paid: '#16a34a', 'Partially Paid': '#f59e0b', Pending: '#64748b', Cancelled: '#dc2626' };
export const BADGE = {
  Paid: 'bg-green-100 text-green-700', 'Partially Paid': 'bg-amber-100 text-amber-700',
  Pending: 'bg-slate-100 text-slate-600', Cancelled: 'bg-red-100 text-red-700', Delivered: 'bg-green-100 text-green-700',
};
export const PRESETS = [['today', 'Today'], ['last7', 'Last 7 Days'], ['last30', 'Last 30 Days'], ['month', 'This Month'], ['lastMonth', 'Last Month'], ['quarter', 'This Quarter'], ['year', 'This Year'], ['all', 'All Time'], ['custom', 'Custom Range']];
export const PAGE_SIZES = [10, 25, 50, 100];
export const inputClass = 'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';
export const cardClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
