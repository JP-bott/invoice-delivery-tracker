import { useEffect, useState } from 'react';
import { Check, Circle, Clock3, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api, peso } from '../../utils/api.js';
import Modal from '../Modal.jsx';
import { useToast } from '../Toast.jsx';

const tone = {
  neutral: 'border-line bg-surface-2 text-fg-muted',
  info: 'border-info/40 bg-info-soft text-info-ink',
  warning: 'border-warning/40 bg-warning-soft text-warning-ink',
  success: 'border-success/40 bg-success-soft text-success-ink',
  danger: 'border-danger/40 bg-danger-soft text-danger-ink',
};
const dateLabel = (s) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
}).format(new Date(s));
const eligible = (invoice) => ['Pending', 'Partially Paid'].includes(invoice.payment_status) && invoice.outstanding > 0;
export default function PaymentTimelineModal({ invoice, onClose }) {
  const toast = useToast();
  const [data, setData] = useState({ events: [], stages: [], can_edit: false });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [editor, setEditor] = useState(null);
  const [chosen, setChosen] = useState(null), [note, setNote] = useState('');
  const load = async () => {
    try { setData(await api(`/api/invoices/${invoice.id}/timeline`)); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [invoice.id]);
  const edit = (event) => { setEditor(event); setChosen(event.stage_id); setNote(event.note); };
  const reset = () => { setEditor(null); setChosen(null); setNote(''); };
  const save = async (e) => {
    e.preventDefault();
    if (!chosen || busy) return;
    setBusy(true);
    try {
      const url = `/api/invoices/${invoice.id}/timeline${editor ? `/${editor.id}` : ''}`;
      await api(url, { method: editor ? 'PUT' : 'POST', body: { stage_id: chosen, note } });
      toast.success(editor ? 'Timeline update saved' : 'Timeline updated');
      reset(); await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const remove = async (event) => {
    if (busy || !window.confirm('Delete this timeline entry?')) return;
    setBusy(true);
    try {
      await api(`/api/invoices/${invoice.id}/timeline/${event.id}`, { method: 'DELETE' });
      if (editor?.id === event.id) reset();
      toast.success('Timeline entry deleted'); await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const latest = data.events.at(-1), canEdit = data.can_edit && eligible(invoice);
  const selection = [...data.stages];
  if (editor && !selection.some((stage) => stage.id === editor.stage_id)) {
    selection.push({ id: editor.stage_id, label: editor.stage_label, tone: editor.stage_tone, description: 'Archived stage (historical entry)' });
  }
  return (
    <Modal title="Payment tracking timeline" description={`${invoice.invoice_no} · ${invoice.client_name}`}
      width="max-w-2xl" onClose={onClose} footer={<button className="btn btn-secondary" onClick={onClose}>Close</button>}>
      <div className="rounded-xl border border-line bg-surface-2/60 p-4">
        <p className="eyebrow">Current collection stage</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div><p className="text-lg font-semibold text-fg">{latest?.stage_label || (invoice.payment_status === 'Paid' ? 'Payment received' : 'Awaiting tracking update')}</p>
            <p className="mt-1 text-xs text-fg-muted">{latest ? dateLabel(latest.created_at) : 'No tracking updates yet'}</p></div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${tone[latest?.stage_tone] || tone.neutral}`}>{invoice.payment_status}</span>
        </div>
        {latest?.note && <p className="mt-3 whitespace-pre-wrap text-sm text-fg-muted">{latest.note}</p>}
        <div className="mt-3 border-t border-line pt-3 text-sm text-fg-muted">Outstanding <strong className="num ml-1 text-fg">{peso(invoice.outstanding)}</strong></div>
      </div>
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      <section aria-label="Chronological payment progress">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="section-title">Activity timeline</h3>
          <span className="text-xs text-fg-subtle">{data.events.length} update{data.events.length === 1 ? '' : 's'}</span>
        </div>
        {loading ? <p className="text-sm text-fg-muted">Loading payment history…</p> : !data.events.length ?
          <div className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-fg-muted">No history recorded. Add a stage below to start tracking payment progress.</div> :
          <ol className="relative ml-3 border-l-2 border-line">
            {data.events.map((event, index) => <li key={event.id} className="relative pb-7 pl-7 last:pb-2">
              <span className={`absolute -left-[13px] top-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-surface ${tone[event.stage_tone] || tone.neutral}`}>
                {index === data.events.length - 1 ? <Clock3 size={13} /> : <Check size={13} />}
              </span>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{event.stage_label}</p>
                  <p className="mt-1 text-xs text-fg-subtle">{dateLabel(event.created_at)}</p>
                  {event.note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm text-fg-muted">{event.note}</p>}
                  {event.updated_at !== event.created_at && <p className="mt-1 text-xs text-fg-subtle">Edited {dateLabel(event.updated_at)}</p>}
                </div>
                {canEdit && <div className="flex shrink-0 gap-1">
                  <button className="btn btn-ghost btn-icon !h-8 !w-8" aria-label={`Edit ${event.stage_label}`} onClick={() => edit(event)}><Pencil size={14}/></button>
                  <button className="btn btn-ghost btn-icon !h-8 !w-8" aria-label={`Delete ${event.stage_label}`} onClick={() => remove(event)}><Trash2 size={14}/></button>
                </div>}
              </div>
            </li>)}
          </ol>}
      </section>
      {canEdit && <form className="rounded-xl border border-line p-4" onSubmit={save}>
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="section-title">{editor ? 'Edit tracking update' : 'Add tracking update'}</h3>
          {editor && <button type="button" className="btn btn-ghost !h-8" onClick={reset}><X size={14}/>Cancel edit</button>}</div>
        <p className="mb-3 text-xs text-fg-muted">Select a stage from the visual progression. Stages are managed under Settings.</p>
        <div role="group" aria-label="Select payment progress stage" className="grid gap-2 sm:grid-cols-2">
          {selection.map((stage) => <button key={stage.id} type="button" onClick={() => setChosen(stage.id)}
            aria-pressed={chosen === stage.id} className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${chosen === stage.id ? 'border-brand bg-brand-soft/40 ring-1 ring-brand' : 'border-line hover:bg-surface-2'}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${tone[stage.tone] || tone.neutral}`}>{chosen === stage.id ? <Check size={16}/> : <Circle size={16}/>}</span>
            <span className="min-w-0"><span className="block text-sm font-medium text-fg">{stage.label}</span>
              {stage.description && <span className="mt-0.5 block text-xs text-fg-muted">{stage.description}</span>}</span>
          </button>)}
        </div>
        <label className="label mt-4" htmlFor="payment-timeline-note">Reason / progress update</label>
        <textarea id="payment-timeline-note" className="input min-h-24" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Client confirmed the payment request is awaiting finance approval. Follow up on Friday."/>
        <div className="mt-3 flex justify-end"><button type="submit" disabled={!chosen || busy} className="btn btn-primary"><Save size={15}/>{busy ? 'Saving…' : editor ? 'Save changes' : 'Add update'}</button></div>
      </form>}
      {!canEdit && !loading && <p className="text-sm text-fg-muted">Tracking history is read-only when this invoice is paid, cancelled, or has no outstanding balance.</p>}
    </Modal>
  );
}
