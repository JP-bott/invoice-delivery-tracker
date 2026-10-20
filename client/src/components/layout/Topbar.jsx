import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Moon, Plus, Search, Sun } from 'lucide-react';
import { today } from '../../utils/dates.js';

const TITLES = { '/': 'Dashboard', '/invoices': 'Invoices', '/settings': 'Settings' };
const longDate = (iso) => new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export default function Topbar({ theme, onToggleTheme, onOpenMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/invoices?q=${encodeURIComponent(term)}` : '/invoices');
  };
  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-3 border-b border-line bg-surface/85 px-[var(--page-pad)] backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <button type="button" className="btn btn-ghost btn-icon -ml-2 md:hidden" onClick={onOpenMenu} aria-label="Open menu"><Menu size={20} /></button>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 text-sm text-fg-muted sm:block">
        <span className="text-fg-subtle">Invoice Tracker</span><span className="mx-2 text-fg-subtle" aria-hidden="true">/</span><span className="font-medium text-fg">{TITLES[pathname] || 'Dashboard'}</span>
      </nav>
      <form role="search" onSubmit={submit} className="relative ml-auto w-full max-w-xs flex-1 sm:flex-none sm:basis-72">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <input type="search" aria-label="Search invoices, clients or products" placeholder="Search invoices, clients…" className="input !h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <span className="num hidden whitespace-nowrap text-sm text-fg-muted xl:block">{longDate(today())}</span>
      <button type="button" className="btn btn-ghost btn-icon" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
        {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </button>
      <button type="button" className="btn btn-primary max-sm:btn-icon" onClick={() => navigate('/invoices?new=1')} aria-label="Add invoice"><Plus size={16} aria-hidden="true" /><span className="hidden sm:inline">Add Invoice</span></button>
    </header>
  );
}
