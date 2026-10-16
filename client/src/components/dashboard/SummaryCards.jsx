import { peso } from '../../utils/api.js';
import { cardClass } from '../../utils/constants.js';

export default function SummaryCards({ s, onOpenInvoices }) {
  const cards = [
    ['Total Invoices', s.totalInvoices, {}], ['Total Invoice Value', peso(s.totalValue)], ['Total Collected', peso(s.totalCollected)],
    ['Outstanding Balance', peso(s.outstandingBalance)], ['Pending Payments', peso(s.pendingPayments)],
    ['Delivered Orders', s.deliveredOrders, { deliveryStatus: 'Delivered' }], ['Pending Deliveries', s.pendingDeliveries, { deliveryStatus: 'Pending' }],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(([label, value, query]) => {
        const content = <><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></>;
        return onOpenInvoices && query ? <button key={label} type="button" className={`${cardClass} text-left transition hover:border-indigo-300 hover:shadow-md`} onClick={() => onOpenInvoices(query)} aria-label={`View invoices for ${label}`}>{content}</button> : <div key={label} className={cardClass}>{content}</div>;
      })}
    </div>
  );
}
