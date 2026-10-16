export const STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Cancelled'];
// Chart colours reference CSS tokens (index.css) so they follow the light/dark theme.
export const STATUS_COLORS = { Paid: 'var(--success)', 'Partially Paid': 'var(--warning)', Pending: 'var(--chart-muted)', Cancelled: 'var(--danger)' };
export const AGING_COLORS = {
  overdue: 'var(--aging-overdue)', today: 'var(--aging-today)', week: 'var(--aging-week)', month: 'var(--aging-month)',
  next30: 'var(--aging-next30)', upcoming: 'var(--aging-upcoming)', noDue: 'var(--aging-noDue)',
};
export const PRESETS = [['today', 'Today'], ['last7', 'Last 7 Days'], ['last30', 'Last 30 Days'], ['month', 'This Month'], ['lastMonth', 'Last Month'], ['quarter', 'This Quarter'], ['year', 'This Year'], ['all', 'All Time'], ['custom', 'Custom Range']];
export const PAGE_SIZES = [10, 25, 50, 100];
export const inputClass = 'input';
export const cardClass = 'card card-pad';
