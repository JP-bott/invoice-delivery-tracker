import { Ban, CheckCircle2, CircleDashed, Clock3, Truck } from 'lucide-react';

// Status is always communicated by icon + text + colour, never colour alone.
const MAP = {
  Paid: ['badge-success', CheckCircle2],
  'Partially Paid': ['badge-warning', CircleDashed],
  Pending: ['badge-neutral', Clock3],
  Cancelled: ['badge-muted', Ban],
  Delivered: ['badge-success', Truck],
};

export default function StatusBadge({ status, label }) {
  const [tone, Icon] = MAP[status] || ['badge-neutral', Clock3];
  return <span className={`badge ${tone}`}><Icon size={12} aria-hidden="true" />{label || status}</span>;
}

export function OverdueBadge({ days }) {
  return <span className="badge badge-danger" title="Unpaid and past its due date"><Clock3 size={12} aria-hidden="true" />Overdue{days ? ` · ${days}d` : ''}</span>;
}
