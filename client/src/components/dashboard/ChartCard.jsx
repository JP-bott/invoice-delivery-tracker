import { BarChart3 } from 'lucide-react';
import { EmptyState } from '../ui.jsx';

export default function ChartCard({ title, description, data, action, className = '', children }) {
  return (
    <section className={`card card-pad min-w-0 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="section-title">{title}</h2>{description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}</div>
        {action}
      </div>
      {data?.length ? children : <EmptyState compact icon={BarChart3} title="No data for these filters" description="Try a wider date range or clear the filters." />}
    </section>
  );
}

export const ChartTooltip = ({ active, payload, label, format, labelKey }) => {
  if (!active || !payload?.length) return null;
  const heading = labelKey ? payload[0].payload[labelKey] : label;
  return (
    <div className="chart-tooltip">
      {heading != null && <p className="mb-1 font-semibold">{heading}</p>}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} aria-hidden="true" />
          <span className="chart-tooltip-muted">{p.name}</span><span className="num ml-auto pl-3 font-medium">{format ? format(p.value, p) : p.value}</span>
        </p>))}
    </div>
  );
};
