import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES } from '../../utils/constants.js';

export default function Pagination({ total, page, pageSize, onPage, onPageSize }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
      <span className="num" aria-live="polite">{total ? `Showing ${from}–${to} of ${total} records` : '0 records'}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2"><span className="hidden sm:inline">Rows per page</span>
          <select aria-label="Rows per page" className="input !h-8 !w-auto" value={pageSize} onChange={(e) => onPageSize(+e.target.value)}>{PAGE_SIZES.map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn btn-secondary btn-sm" aria-label="Previous page"><ChevronLeft size={14} aria-hidden="true" /><span className="hidden sm:inline">Prev</span></button>
        <span className="num min-w-14 text-center text-fg">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="btn btn-secondary btn-sm" aria-label="Next page"><span className="hidden sm:inline">Next</span><ChevronRight size={14} aria-hidden="true" /></button>
      </div>
    </nav>
  );
}
