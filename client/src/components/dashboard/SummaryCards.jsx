import { peso } from '../../utils/api.js';
import { cardClass } from '../../utils/constants.js';

export default function SummaryCards({ s }) {
  const cards = [['Total Invoices', s.totalInvoices], ['Total Invoice Value', peso(s.totalValue)], ['Total Collected', peso(s.totalCollected)], ['Outstanding Balance', peso(s.outstandingBalance)], ['Pending Payments', peso(s.pendingPayments)], ['Delivered Orders', s.deliveredOrders], ['Pending Deliveries', s.pendingDeliveries]];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(([l, v]) => <div key={l} className={cardClass}><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-lg font-semibold">{v}</div></div>)}
    </div>
  );
}
