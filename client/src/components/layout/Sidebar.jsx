import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PanelLeftClose, PanelLeftOpen, PlusCircle, Receipt, ReceiptText, Settings as SettingsIcon, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Invoices', icon: Receipt, end: true },
  { to: '/invoices?new=1', label: 'Add Invoice', icon: PlusCircle, match: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function Item({ item, collapsed, onNavigate }) {
  const { to, label, icon: Icon, end, match } = item;
  const base = 'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors';
  return (
    <NavLink to={to} end={end} onClick={onNavigate} title={collapsed ? label : undefined}
      className={({ isActive }) => `${base} ${collapsed ? 'justify-center' : ''} ${isActive && match !== false ? 'bg-brand-soft text-brand-ink' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'}`}
      aria-label={collapsed ? label : undefined}>
      {({ isActive }) => {
        const active = isActive && match !== false;
        return <>
          {active && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-brand" aria-hidden="true" />}
          <Icon size={18} aria-hidden="true" className="shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </>;
      }}
    </NavLink>
  );
}

export function Brand({ collapsed }) {
  return (
    <div className={`flex h-[var(--topbar-h)] items-center gap-2.5 ${collapsed ? 'justify-center' : 'px-1'}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-fg shadow-sm"><ReceiptText size={17} aria-hidden="true" /></span>
      {!collapsed && <div className="min-w-0 leading-tight"><p className="truncate text-sm font-semibold text-fg">Invoice Tracker</p><p className="truncate text-[11px] text-fg-subtle">Billing & deliveries</p></div>}
    </div>
  );
}

// Desktop: persistent sidebar that can collapse to icons. Mobile: off-canvas drawer.
export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  return (
    <>
      <aside aria-label="Sidebar" className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface px-3 transition-[width] duration-200 md:flex ${collapsed ? 'w-[var(--sidebar-w-collapsed)]' : 'w-[var(--sidebar-w)]'}`}>
        <Brand collapsed={collapsed} />
        <nav aria-label="Main" className="mt-3 flex flex-1 flex-col gap-1">
          {NAV.map((item) => <Item key={item.to} item={item} collapsed={collapsed} />)}
        </nav>
        <div className="border-t border-line py-3">
          <button type="button" onClick={onToggleCollapse} className={`btn btn-ghost w-full ${collapsed ? 'btn-icon !w-full' : 'justify-start'}`} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed}>
            {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <><PanelLeftClose size={18} aria-hidden="true" />Collapse</>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <div className="anim-fade absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside role="dialog" aria-modal="true" aria-label="Navigation" className="anim-slide absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface px-3 shadow-pop">
            <div className="flex items-center justify-between"><Brand /><button type="button" className="btn btn-ghost btn-icon" onClick={onCloseMobile} aria-label="Close menu"><X size={18} /></button></div>
            <nav aria-label="Main" className="mt-3 flex flex-col gap-1">
              {NAV.map((item) => <Item key={item.to} item={item} onNavigate={onCloseMobile} />)}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
