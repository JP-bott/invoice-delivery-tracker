import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api } from '../../utils/api.js';
import { TYPE_LABEL } from '../../utils/customFields.js';
import { useToast } from '../Toast.jsx';
import Modal from '../Modal.jsx';
import { EmptyState, Skeleton } from '../ui.jsx';
import FieldEditorModal from './FieldEditorModal.jsx';
import { ExpandableList, OptionChips } from './Expandable.jsx';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Settings > Invoice fields: add, edit, reorder, delete (archive), restore and permanently remove custom fields.
export default function InvoiceFieldsSection() {
  const toast = useToast();
  const [fields, setFields] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [editor, setEditor] = useState(null), [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/api/invoice-fields?includeArchived=1').then((rows) => { setFields(rows); setError(''); }).catch((e) => setError(e.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  const active = fields.filter((f) => !f.archived), archived = fields.filter((f) => f.archived);

  const act = async (fn, message) => {
    setBusy(true);
    try { await fn(); toast.success(message); await load(); } catch (e) { toast.error(e.message); }
    setBusy(false); setConfirm(null);
  };
  const move = (index, step) => {
    const ids = active.map((f) => f.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    act(() => api('/api/invoice-fields/order', { method: 'PUT', body: { ids } }), 'Order updated');
  };
  const remove = () => act(() => api(`/api/invoice-fields/${confirm.field.id}${confirm.kind === 'purge' ? '?permanent=1' : ''}`, { method: 'DELETE' }), confirm.kind === 'purge' ? 'Field and its values permanently deleted' : 'Field deleted');
  const restore = (field) => act(() => api(`/api/invoice-fields/${field.id}/restore`, { method: 'POST' }), 'Field restored');
  const iconBtn = 'btn btn-ghost btn-icon !h-8 !w-8';

  return (
    <section className="card card-pad" aria-labelledby="fields-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="fields-heading" className="section-title">Invoice fields</h3><p className="mt-1 text-sm text-fg-muted">Extra fields for the Add and Edit Invoice forms. Values are saved with each invoice and are searchable and filterable.</p></div>
        <button type="button" className="btn btn-primary" onClick={() => setEditor({})}><Plus size={16} aria-hidden="true" />Add Field</button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-danger-ink">{error}</p>}
      <div className="border-t border-line">
        {loading ? <div className="space-y-2 py-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          : !active.length ? <EmptyState compact icon={SlidersHorizontal} title="No custom fields yet" description="Add a field such as PO Number, Region or Rush order." />
          : <ExpandableList className="divide-y divide-line" items={active} limit={6} render={(f, i) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-fg">{f.label}
                  <span className="badge badge-neutral">{TYPE_LABEL[f.input_type]}</span>
                  {f.required && <span className="badge badge-warning">Required</span>}
                  {!f.show_in_table && <span className="badge badge-neutral">Not in list</span>}
                </p>
                {f.input_type === 'dropdown' && <OptionChips options={f.options} limit={4} />}
              </div>
              <span className="flex shrink-0 gap-1">
                <button type="button" className={iconBtn} onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`Move ${f.label} up`} title="Move up"><ChevronUp size={15} /></button>
                <button type="button" className={iconBtn} onClick={() => move(i, 1)} disabled={busy || i === active.length - 1} aria-label={`Move ${f.label} down`} title="Move down"><ChevronDown size={15} /></button>
                <button type="button" className={iconBtn} onClick={() => setEditor(f)} aria-label={`Edit ${f.label}`} title="Edit"><Pencil size={15} /></button>
                <button type="button" className={`${iconBtn} hover:!bg-danger-soft hover:!text-danger-ink`} onClick={() => setConfirm({ kind: 'archive', field: f })} aria-label={`Delete ${f.label}`} title="Delete"><Trash2 size={15} /></button>
              </span>
            </li>)} />}
      </div>
      {archived.length > 0 && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-medium text-fg-muted">Deleted fields ({archived.length})</summary>
          <p className="mt-2 text-xs text-fg-muted">Hidden from forms, search and filters. Their saved values are kept, and return if you restore the field.</p>
          <ul className="mt-1 divide-y divide-line">{archived.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-sm text-fg-muted">{f.label} <span className="text-xs text-fg-subtle">· {TYPE_LABEL[f.input_type]} · {plural(f.value_count, 'saved value')}</span></span>
              <span className="flex gap-1">
                <button type="button" className="btn btn-secondary !h-8" onClick={() => restore(f)} disabled={busy}><RotateCcw size={14} aria-hidden="true" />Restore</button>
                <button type="button" className="btn btn-ghost !h-8 hover:!bg-danger-soft hover:!text-danger-ink" onClick={() => setConfirm({ kind: 'purge', field: f })} disabled={busy}>Delete permanently</button>
              </span>
            </li>))}</ul>
        </details>)}

      {editor && <FieldEditorModal field={editor.id ? editor : null} onClose={() => setEditor(null)} onSaved={(saved, wasEdit) => { setEditor(null); toast.success(wasEdit ? 'Field updated' : 'Field added'); load(); }} />}
      {confirm && (
        <Modal title={confirm.kind === 'purge' ? 'Delete permanently?' : 'Delete field?'} onClose={() => !busy && setConfirm(null)} width="max-w-md"
          footer={<><button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button><button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : confirm.kind === 'purge' ? 'Delete permanently' : 'Delete field'}</button></>}>
          {confirm.kind === 'purge'
            ? <p className="text-sm text-fg">This permanently erases <b>{confirm.field.label}</b>{confirm.field.value_count > 0 ? <> and the values saved on <b>{plural(confirm.field.value_count, 'invoice')}</b></> : ''}. This can’t be undone. The invoices themselves are not affected.</p>
            : <p className="text-sm text-fg">Remove <b>{confirm.field.label}</b> from the Add and Edit Invoice forms, search and filters? {confirm.field.value_count > 0 ? <>The values saved on <b>{plural(confirm.field.value_count, 'invoice')}</b> are kept and come back if you restore the field under “Deleted fields”.</> : 'No invoices have a value in this field.'}</p>}
        </Modal>)}
    </section>
  );
}
