import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PanelLeftClose, PanelLeftOpen, Receipt, ReceiptText, Settings as SettingsIcon, FileCog, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
  { to: '/document-converter', label: 'Document Converter', icon: FileCog },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function Item({ item, collapsed, onNavigate }) {
  const { to, label, icon: Icon, end } = item;
  return (
    <NavLink to={to} end={end} onClick={onNavigate} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
      className={({ isActive }) => `nav-item group ${isActive ? 'is-active' : ''} ${collapsed ? 'justify-center !px-0' : ''}`}>
      <span className="nav-chip"><Icon size={18} aria-hidden="true" className="nav-icon shrink-0" /></span>
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
      {!collapsed && <div className="min-w-0 leading-tight"><p className="truncate text-[0.9375rem] font-semibold tracking-tight text-fg">Invoice Tracker</p><p className="truncate text-[11px] font-medium text-fg-subtle">Billing &amp; deliveries</p></div>}
    </div>
  );
}

const Label = ({ collapsed }) => (collapsed ? <div className="mx-2 my-2 border-t border-line" aria-hidden="true" /> : <p className="eyebrow px-3 pb-1.5 pt-2">Menu</p>);

// Desktop: persistent sidebar that can collapse to icons. Mobile: off-canvas drawer.
export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  return (
    <>
      <aside aria-label="Sidebar" className={`sticky top-0 hidden h-dvh shrink-0 flex-col sidebar-shell border-r border-line px-3 transition-[width] duration-200 ease-out md:flex ${collapsed ? 'w-[var(--sidebar-w-collapsed)]' : 'w-[var(--sidebar-w)]'}`}>
        <div className="sidebar-brand -mx-3 px-3"><Brand collapsed={collapsed} /></div>
        <nav aria-label="Main" className="mt-3 flex flex-1 flex-col gap-1">
          <Label collapsed={collapsed} />
          {NAV.map((item) => <Item key={item.to} item={item} collapsed={collapsed} />)}
        </nav>
        <div className="border-t border-line py-3">
          <button type="button" onClick={onToggleCollapse} className={`nav-item w-full ${collapsed ? 'justify-center !px-0' : ''}`} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed} title={collapsed ? 'Expand sidebar' : undefined}>
            {collapsed ? <span className="nav-chip"><PanelLeftOpen size={18} aria-hidden="true" className="nav-icon" /></span> : <><span className="nav-chip"><PanelLeftClose size={18} aria-hidden="true" className="nav-icon" /></span><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <div className="anim-fade absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside role="dialog" aria-modal="true" aria-label="Navigation" className="anim-slide absolute inset-y-0 left-0 sidebar-shell flex w-72 max-w-[85vw] flex-col border-r border-line px-3 shadow-pop">
            <div className="sidebar-brand -mx-3 flex items-center justify-between px-3"><Brand /><button type="button" className="btn btn-ghost btn-icon" onClick={onCloseMobile} aria-label="Close menu"><X size={18} /></button></div>
            <nav aria-label="Main" className="mt-3 flex flex-col gap-1">
              <Label />
              {NAV.map((item) => <Item key={item.to} item={item} onNavigate={onCloseMobile} />)}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
