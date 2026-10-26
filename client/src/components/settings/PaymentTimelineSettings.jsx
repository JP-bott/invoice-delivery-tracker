import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Trash2, X, GitCommitVertical } from 'lucide-react';
import { api } from '../../utils/api.js';
import { useToast } from '../Toast.jsx';
import { Skeleton } from '../ui.jsx';
const tones = [
  ['neutral', 'Neutral'], ['info', 'In progress'], ['warning', 'Waiting'], ['success', 'Confirmation'], ['danger', 'Blocked'],
];
const blank = { label: '', description: '', tone: 'info' };
export default function PaymentTimelineSettings() {
  const toast = useToast();
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => {
    try { setItems(await api('/api/timeline-stages')); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault(); if (busy) return; setBusy(true);
    try {
      await api(form.id ? `/api/timeline-stages/${form.id}` : '/api/timeline-stages', {
        method: form.id ? 'PUT' : 'POST', body: form,
      });
      toast.success(form.id ? 'Stage updated' : 'Stage added'); setForm(null); await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const archive = async (item) => {
    if (!window.confirm(`Archive "${item.label}"? Past timeline updates will remain unchanged.`)) return;
    try { await api(`/api/timeline-stages/${item.id}`, { method: 'DELETE' }); toast.success('Stage archived'); await load(); }
    catch (err) { setError(err.message); }
  };
  const move = async (index, offset) => {
    const arr = items.map((v) => v.id), target = index + offset;
    if (target < 0 || target >= arr.length || busy) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    setBusy(true);
    try { setItems(await api('/api/timeline-stages/order', { method: 'PUT', body: { ids: arr } })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <section className="card card-pad" aria-labelledby="timeline-settings-title">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><h3 className="section-title" id="timeline-settings-title">Payment timeline stages</h3>
        <p className="mt-1 text-sm text-fg-muted">Manage the milestones shown in each unpaid invoice's payment tracking modal. Completed updates are retained if a stage is renamed or archived.</p></div>
      <button type="button" className="btn btn-primary shrink-0" onClick={() => setForm({ ...blank })}><Plus size={15}/>Add stage</button>
    </div>
    {error && <p className="mb-3 text-sm text-danger-ink" role="alert">{error}</p>}
    {loading ? <Skeleton className="h-32"/> :
      <ol className="relative ml-3 border-l-2 border-line">{items.map((item, index) =>
        <li key={item.id} className="relative flex items-start justify-between gap-2 pb-5 pl-6 last:pb-1">
          <span className="absolute -left-[13px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-fg-muted"><GitCommitVertical size={14}/></span>
          <div className="min-w-0"><p className="text-sm font-semibold text-fg">{item.label}</p><p className="mt-0.5 text-xs text-fg-muted">{item.description || 'No description'}</p>
            <span className="mt-1 inline-block text-xs text-fg-subtle">{tones.find((t) => t[0] === item.tone)?.[1]}</span></div>
          <div className="flex shrink-0 gap-0.5">
            <button type="button" className="btn btn-ghost btn-icon !h-8 !w-8" title="Move earlier" aria-label={`Move ${item.label} earlier`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14}/></button>
            <button type="button" className="btn btn-ghost btn-icon !h-8 !w-8" title="Move later" aria-label={`Move ${item.label} later`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14}/></button>
            <button type="button" className="btn btn-ghost btn-icon !h-8 !w-8" aria-label={`Edit ${item.label}`} onClick={() => setForm(item)}><Pencil size={14}/></button>
            <button type="button" className="btn btn-ghost btn-icon !h-8 !w-8" aria-label={`Archive ${item.label}`} onClick={() => archive(item)}><Trash2 size={14}/></button>
          </div>
        </li>)}</ol>}
    {form && <form onSubmit={save} className="mt-4 space-y-3 rounded-xl border border-line bg-surface-2/40 p-4">
      <div className="flex justify-between gap-3"><h4 className="text-sm font-semibold">{form.id ? 'Edit stage' : 'New stage'}</h4><button type="button" className="btn btn-ghost btn-icon !h-7 !w-7" onClick={() => setForm(null)}><X size={15}/></button></div>
      <div><label htmlFor="stage-name" className="label">Stage name</label><input id="stage-name" className="input" required maxLength={70} minLength={2} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Awaiting check release"/></div>
      <div><label htmlFor="stage-description" className="label">Description</label><textarea id="stage-description" className="input min-h-20" maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></div>
      <div><p className="label">Stage appearance</p><div role="group" aria-label="Stage appearance" className="flex flex-wrap gap-2">{tones.map(([value,label]) =>
        <button key={value} type="button" aria-pressed={form.tone === value} className={`rounded-lg border px-3 py-1.5 text-xs ${form.tone === value ? 'border-brand bg-brand-soft font-semibold' : 'border-line'}`} onClick={() => setForm({ ...form, tone: value })}>{label}</button>)}</div></div>
      <div className="flex justify-end"><button type="submit" disabled={busy} className="btn btn-primary"><Save size={15}/>{busy ? 'Saving…' : 'Save stage'}</button></div>
    </form>}
  </section>;
}
