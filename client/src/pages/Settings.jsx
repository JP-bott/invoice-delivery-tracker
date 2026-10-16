import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../utils/api.js';
import Toast from '../components/Toast.jsx';

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function Settings() {
  const [options, setOptions] = useState([]), [name, setName] = useState(''), [editing, setEditing] = useState(null), [loading, setLoading] = useState(true), [toast, setToast] = useState(null), [error, setError] = useState('');
  const note = (message, bad = false) => { setToast({ msg: message, bad }); setTimeout(() => setToast(null), 3000); };
  const load = () => { setLoading(true); api('/api/products').then(setOptions).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const save = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) { setError('Enter a product or service name.'); return; }
    try {
      await api(editing ? `/api/products/${editing.id}` : '/api/products', { method: editing ? 'PUT' : 'POST', body: { name: value } });
      setName(''); setEditing(null); setError(''); note(editing ? 'Option updated' : 'Option added'); load();
    } catch (e) { setError(e.message); note(e.message, true); }
  };
  const edit = (option) => { setEditing(option); setName(option.name); setError(''); };
  const cancel = () => { setEditing(null); setName(''); setError(''); };
  const remove = async (option) => {
    if (!window.confirm(`Delete "${option.name}"? Existing invoices will keep this value.`)) return;
    try { await api(`/api/products/${option.id}`, { method: 'DELETE' }); note('Option deleted'); load(); } catch (e) { note(e.message, true); }
  };
  const ActionIcon = editing ? Save : Plus;
  return (
    <div className="max-w-3xl space-y-5">
      <div><h1 className="text-xl font-semibold">Settings</h1><p className="mt-1 text-sm text-slate-500">Manage the options available when recording an invoice.</p></div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="products-heading">
        <div className="mb-4"><h2 id="products-heading" className="font-semibold text-slate-900">Product/Service Options</h2><p className="mt-1 text-sm text-slate-500">These options appear in the Add and Edit Invoice forms.</p></div>
        <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="product-option-name">Product or service name</label>
          <input id="product-option-name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Consulting Services" />
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><ActionIcon size={16} />{editing ? 'Save Changes' : 'Add Option'}</button>
          {editing && <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={cancel}><X size={16} />Cancel</button>}
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
          {loading ? <p className="py-6 text-center text-sm text-slate-500">Loading options...</p> : !options.length ? <p className="py-6 text-center text-sm text-slate-500">No product or service options configured yet.</p> : options.map((option) => (
            <div key={option.id} className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm text-slate-800">{option.name}</span>
              <span className="flex shrink-0 gap-1">
                <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600" onClick={() => edit(option)} aria-label={`Edit ${option.name}`} title="Edit"><Pencil size={16} /></button>
                <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => remove(option)} aria-label={`Delete ${option.name}`} title="Delete"><Trash2 size={16} /></button>
              </span>
            </div>
          ))}
        </div>
      </section>
      <Toast toast={toast} />
    </div>
  );
}
