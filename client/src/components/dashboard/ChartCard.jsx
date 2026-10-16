import { cardClass } from '../../utils/constants.js';
export default function ChartCard({ title, data, children }) {
  return (
    <section className={cardClass}>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {data?.length ? children : <p className="py-16 text-center text-sm text-slate-400">No data for these filters</p>}
    </section>
  );
}
