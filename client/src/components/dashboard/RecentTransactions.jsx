import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { today } from '../../utils/dates.js';
import StatusBadge, { OverdueBadge } from '../StatusBadge.jsx';
import ChartCard from './ChartCard.jsx';

const daysLate = (due, now) => Math.round((Date.parse(now) - Date.parse(due)) / 86400000);

export default function RecentTransactions({ data }) {
  const now = today();
  return (
    <ChartCard title="Recent invoices" description="Latest eight, including cancelled" data={data} action={<Link to="/invoices" className="btn btn-ghost btn-sm">View all<ArrowRight size={14} aria-hidden="true" /></Link>}>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Recent invoices</caption>
          <thead className="border-y border-line bg-surface-2/60"><tr><th scope="col" className="th !pl-4 sm:!pl-5">Invoice</th><th scope="col" className="th">Client</th><th scope="col" className="th">Issued</th><th scope="col" className="th">Due</th><th scope="col" className="th !text-right">Amount</th><th scope="col" className="th">Payment</th><th scope="col" className="th !pr-4 sm:!pr-5">Delivery</th></tr></thead>
          <tbody>
            {data.map((r) => {
              const overdue = r.due_date && r.due_date < now && r.outstanding > 0 && ['Pending', 'Partially Paid'].includes(r.payment_status);
              return (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/40">
                  <td className="td num !pl-4 font-medium sm:!pl-5">{r.invoice_no}</td><td className="td max-w-[14rem] truncate">{r.client_name}</td>
                  <td className="td num text-fg-muted">{r.date_issued}</td>
                  <td className="td num whitespace-nowrap text-fg-muted">{r.due_date || '—'}{overdue && <span className="ml-2"><OverdueBadge days={daysLate(r.due_date, now)} /></span>}</td>
                  <td className="td num text-right font-medium">{peso(r.amount)}</td>
                  <td className="td"><StatusBadge status={r.payment_status} /></td>
                  <td className="td !pr-4 sm:!pr-5"><StatusBadge status={r.deliveryStatus === 'Delivered' ? 'Delivered' : 'Pending'} label={r.deliveryStatus} /></td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
