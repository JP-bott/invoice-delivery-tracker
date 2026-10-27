import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Moon, Plus, Search, Sun, X } from 'lucide-react';
import { today } from '../../utils/dates.js';

const TITLES = { '/': 'Dashboard', '/invoices': 'Invoices', '/document-converter': 'Document Converter', '/settings': 'Settings' };

// Today's date in Asia/Manila (the zone every "as of today" figure uses), split for the date tile.
const dateParts = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const f = (o) => new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', ...o }).format(d);
  return { month: f({ month: 'short' }), day: f({ day: 'numeric' }), weekday: f({ weekday: 'long' }), full: f({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
};
const isTyping = (el) => Boolean(el) && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

// Top bar, in three zones: where you are (left), find an invoice (middle), today and actions (right).
// Add Invoice is the only filled control; everything else stays quiet so the eye lands on the page title first.
export default function Topbar({ theme, onToggleTheme, onOpenMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const input = useRef(null);
  const iso = today(), date = dateParts(iso), title = TITLES[pathname] || 'Dashboard';

  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/invoices?q=${encodeURIComponent(term)}` : '/invoices');
  };

  useEffect(() => { // "/" jumps to search from anywhere except a field you are typing in
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { // a hairline of depth appears only once the page has scrolled under the bar
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header data-scrolled={scrolled} className="topbar sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-3 border-b border-line bg-surface/85 px-[var(--page-pad)] backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <button type="button" className="btn btn-ghost btn-icon -ml-2 md:hidden" onClick={onOpenMenu} aria-label="Open menu"><Menu size={20} /></button>

      <nav aria-label="Breadcrumb" className="hidden shrink-0 items-baseline gap-2 sm:flex">
        <span className="hidden text-[13px] text-fg-subtle lg:inline">Invoice Tracker</span>
        <span className="hidden text-fg-subtle/60 lg:inline" aria-hidden="true">/</span>
        <span aria-current="page" className="text-[15px] font-semibold tracking-tight text-fg">{title}</span>
      </nav>

      <form role="search" onSubmit={submit} className="relative min-w-0 flex-1 transition-[max-width] duration-200 ease-out sm:ml-2 sm:max-w-md sm:focus-within:max-w-xl lg:ml-6">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <input ref={input} type="search" aria-label="Search invoices, clients or products" aria-keyshortcuts="/" placeholder="Search invoices, clients…" className="search-input"
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') { if (q) setQ(''); else e.currentTarget.blur(); } }} />
        {q
          ? <button type="button" className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg" aria-label="Clear search" onClick={() => { setQ(''); input.current?.focus(); }}><X size={14} aria-hidden="true" /></button>
          : !focused && <kbd className="kbd hidden md:inline-flex" aria-hidden="true">/</kbd>}
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <time dateTime={iso} aria-label={`Today is ${date.full}, Manila time`} className="hidden items-center gap-2.5 pr-1 md:flex">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-center leading-none ring-1 ring-inset ring-line" aria-hidden="true">
            <span><span className="block text-[11px] font-medium text-fg-subtle">{date.month}</span><span className="num mt-0.5 block text-[15px] font-semibold text-fg">{date.day}</span></span>
          </span>
          <span className="hidden leading-tight xl:block" aria-hidden="true"><span className="block text-[13px] font-medium text-fg">{date.weekday}</span><span className="block text-[11px] text-fg-subtle">Manila time</span></span>
        </time>
        <span className="mx-0.5 hidden h-5 w-px bg-line md:block" aria-hidden="true" />
        <button type="button" className="btn btn-ghost btn-icon" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="btn btn-primary max-sm:btn-icon" onClick={() => navigate('/invoices?new=1')} aria-label="Add invoice"><Plus size={16} aria-hidden="true" /><span className="hidden sm:inline">Add Invoice</span></button>
      </div>
    </header>
  );
}
