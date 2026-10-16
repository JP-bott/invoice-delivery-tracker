import { STATUSES, inputClass } from '../../utils/constants.js';

export default function FilterBar({ f, setF, onClear }) {
  const field = (k, label, type = 'text') => (
    <input type={type} aria-label={label} placeholder={type === 'text' ? label : ''} className={inputClass} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {field('q', 'Search…')}{field('client', 'Client contains')}{field('product', 'Product contains')}
      <select aria-label="Payment status" className={inputClass} value={f.paymentStatus} onChange={(e) => setF({ ...f, paymentStatus: e.target.value })}><option value="">Any payment</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      <select aria-label="Delivery status" className={inputClass} value={f.deliveryStatus} onChange={(e) => setF({ ...f, deliveryStatus: e.target.value })}><option value="">Any delivery</option><option>Pending</option><option>Delivered</option></select>
      {field('dateFrom', 'Date from', 'date')}{field('dateTo', 'Date to', 'date')}
      <button className="text-sm text-indigo-600" onClick={onClear}>Clear Filters</button>
    </div>
  );
}
