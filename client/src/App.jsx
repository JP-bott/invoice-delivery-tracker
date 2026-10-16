import { useState } from 'react';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Menu, Settings as SettingsIcon } from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import Invoices from './pages/Invoices.jsx';
import Settings from './pages/Settings.jsx';
import { today } from './utils/dates.js';

const link = ({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`;
export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen md:flex">
      <aside className={`${open ? 'block' : 'hidden'} md:block w-full md:w-56 shrink-0 border-r border-slate-200 bg-white p-4`}>
        <div className="mb-4 font-semibold">Invoice Tracker</div>
        <nav aria-label="Main" className="space-y-1" onClick={() => setOpen(false)}>
          <NavLink to="/" end className={link}><LayoutDashboard size={16} />Dashboard</NavLink>
          <NavLink to="/invoices" className={link}><Receipt size={16} />Invoices & Transactions</NavLink>
          <NavLink to="/settings" className={link}><SettingsIcon size={16} />Settings</NavLink>
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}><Menu /></button>
          <span className="ml-auto text-sm text-slate-500">{today()}</span>
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
