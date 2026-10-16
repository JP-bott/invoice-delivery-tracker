import { PAGE_SIZES } from '../../utils/constants.js';

export default function Pagination({ total, page, pageSize, onPage, onPageSize }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>{total} records</span>
      <div className="flex items-center gap-2">
        <select aria-label="Rows per page" className="rounded border px-1 py-1" value={pageSize} onChange={(e) => onPageSize(+e.target.value)}>{PAGE_SIZES.map((n) => <option key={n}>{n}</option>)}</select>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="disabled:opacity-40">Prev</button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
