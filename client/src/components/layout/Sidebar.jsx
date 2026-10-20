import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PanelLeftClose, PanelLeftOpen, Receipt, ReceiptText, Settings as SettingsIcon, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function Item({ item, collapsed, onNavigate }) {
  const { to, label, icon: Icon, end } = item;
  return (
    <NavLink to={to} end={end} onClick={onNavigate} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
      className={({ isActive }) => `nav-item group ${isActive ? 'is-active' : ''} ${collapsed ? 'justify-center !px-0' : ''}`}>
      <Icon size={18} aria-hidden="true" className="nav-icon shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

// Company logo: put your file at client/public/logo.png (or logo.jpg). Falls back to a simple icon if neither exists.
export function Logo({ size = 'h-9 w-9' }) {
  const [src, setSrc] = useState('/logo.png');
  if (!src) return <span className={`flex ${size} shrink-0 items-center justify-center rounded-lg bg-brand text-brand-fg`}><ReceiptText size={18} aria-hidden="true" /></span>;
  return <img src={src} alt="" width="36" height="36" className={`${size} shrink-0 rounded-lg object-contain`} onError={() => setSrc(src === '/logo.png' ? '/logo.jpg' : null)} />;
}

export function Brand({ collapsed }) {
  return (
    <div className={`flex h-[var(--topbar-h)] items-center gap-2.5 ${collapsed ? 'justify-center' : 'px-1.5'}`}>
      <Logo />
      {!collapsed && <div className="min-w-0 leading-tight"><p className="truncate text-sm font-semibold text-fg">Invoice Tracker</p><p className="truncate text-[11px] text-fg-subtle">Billing &amp; deliveries</p></div>}
    </div>
  );
}

const Label = ({ collapsed }) => (collapsed ? <div className="mx-2 my-2 border-t border-line" aria-hidden="true" /> : <p className="eyebrow px-3 pb-1 pt-2">Menu</p>);

// Desktop: persistent sidebar that can collapse to icons. Mobile: off-canvas drawer.
export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  return (
    <>
      <aside aria-label="Sidebar" className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface px-3 transition-[width] duration-200 ease-out md:flex ${collapsed ? 'w-[var(--sidebar-w-collapsed)]' : 'w-[var(--sidebar-w)]'}`}>
        <Brand collapsed={collapsed} />
        <nav aria-label="Main" className="mt-2 flex flex-1 flex-col gap-0.5">
          <Label collapsed={collapsed} />
          {NAV.map((item) => <Item key={item.to} item={item} collapsed={collapsed} />)}
        </nav>
        <div className="border-t border-line py-3">
          <button type="button" onClick={onToggleCollapse} className={`nav-item w-full ${collapsed ? 'justify-center !px-0' : ''}`} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed} title={collapsed ? 'Expand sidebar' : undefined}>
            {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" className="nav-icon" /> : <><PanelLeftClose size={18} aria-hidden="true" className="nav-icon" /><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <div className="anim-fade absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside role="dialog" aria-modal="true" aria-label="Navigation" className="anim-slide absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface px-3 shadow-pop">
            <div className="flex items-center justify-between"><Brand /><button type="button" className="btn btn-ghost btn-icon" onClick={onCloseMobile} aria-label="Close menu"><X size={18} /></button></div>
            <nav aria-label="Main" className="mt-2 flex flex-col gap-0.5">
              <Label />
              {NAV.map((item) => <Item key={item.to} item={item} onNavigate={onCloseMobile} />)}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
