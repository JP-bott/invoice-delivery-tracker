import { peso } from '../../utils/api.js';
import { STATUS_COLORS } from '../../utils/constants.js';
import ChartCard from './ChartCard.jsx';

export default function RecentTransactions({ data }) {
  return (
    <ChartCard title="Recent Transactions" data={data}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Recent transactions</caption>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2 pr-3">{r.invoice_no}</td><td className="pr-3">{r.client_name}</td><td className="pr-3">{r.date_issued}</td><td className="pr-3">{peso(r.amount)}</td>
                <td className="pr-3"><span style={{ color: STATUS_COLORS[r.payment_status] }}>{r.payment_status}</span></td><td>{r.deliveryStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
