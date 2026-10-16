import { BADGE } from '../utils/constants.js';
export default function StatusBadge({ status }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${BADGE[status]}`}>{status}</span>;
}
