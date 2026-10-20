import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { api } from '../../utils/api.js';
import { FIELD_TYPES, allowedTypes, optionProblem } from '../../utils/customFields.js';
import Modal from '../Modal.jsx';

// Add / edit one custom invoice field, including its dropdown options.
export default function FieldEditorModal({ field, onClose, onSaved }) {
  const editing = Boolean(field?.id);
  const [label, setLabel] = useState(field?.label ?? ''), [type, setType] = useState(field?.input_type ?? 'text');
  const [required, setRequired] = useState(Boolean(field?.required)), [showInTable, setShowInTable] = useState(field?.show_in_table ?? true);
  const [options, setOptions] = useState(field?.options ?? []), [draft, setDraft] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const types = allowedTypes(field);
  const locked = editing && types.length < FIELD_TYPES.length;
  const used = field?.value_count ?? 0;

  const addOption = () => {
    const value = draft.trim();
    if (!value) return true;
    if (options.some((o) => o.trim().toLowerCase() === value.toLowerCase())) { setError(`"${value}" is already in the list.`); return false; }
    setOptions([...options, value]); setDraft(''); setError(''); return true;
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!label.trim()) { setError('Enter a field label.'); return; }
    const finalOptions = type === 'dropdown' ? [...options, ...(draft.trim() ? [draft.trim()] : [])] : [];
    const problem = type === 'dropdown' ? optionProblem(finalOptions) : '';
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const saved = await api(editing ? `/api/invoice-fields/${field.id}` : '/api/invoice-fields', {
        method: editing ? 'PUT' : 'POST',
        body: { label, input_type: type, required, show_in_table: showInTable, options: finalOptions },
      });
      onSaved(saved, editing);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit field' : 'Add invoice field'} description={editing ? 'Changes apply to the Add and Edit Invoice forms right away.' : 'It will appear in the Add and Edit Invoice forms.'}
      onClose={() => !busy && onClose()} width="max-w-lg" dismissOnBackdrop={false}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="invoice-field-form" className="btn btn-primary min-w-32" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}{busy ? 'Saving…' : editing ? 'Save changes' : 'Add field'}</button>
      </>}>
      <form id="invoice-field-form" onSubmit={submit} className="space-y-4">
        <label className="label block" htmlFor="field-label">
          <span className="mb-1.5 block">Label<span className="ml-0.5 text-danger" aria-hidden="true">*</span></span>
          <input id="field-label" data-autofocus className="input" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. PO Number" required />
        </label>
        <label className="label block" htmlFor="field-type">
          <span className="mb-1.5 block">Input type</span>
          <select id="field-type" className="input" value={type} onChange={(e) => { setType(e.target.value); setError(''); }} disabled={types.length === 1}>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {locked && <span className="mt-1 block text-xs font-normal text-fg-muted">{used} invoice{used === 1 ? ' has' : 's have'} a value saved here, so {types.length === 1 ? 'the type is locked' : 'the type can only switch between Text and Long text'}. To use another type, delete this field and add a new one.</span>}
        </label>
        {type === 'dropdown' && (
          <fieldset className="space-y-2">
            <legend className="label mb-1">Dropdown options</legend>
            {options.length > 0 && <ul className="space-y-2">{options.map((option, i) => (
              <li key={i} className="flex gap-2">
                <input className="input" aria-label={`Option ${i + 1}`} value={option} maxLength={100} onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))} />
                <button type="button" className="btn btn-ghost btn-icon !h-9 !w-9 shrink-0 hover:!bg-danger-soft hover:!text-danger-ink" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label={`Remove option ${option || i + 1}`} title="Remove"><X size={15} /></button>
              </li>))}</ul>}
            <div className="flex gap-2">
              <input className="input" aria-label="New option" value={draft} maxLength={100} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} placeholder="Type an option, press Enter" />
              <button type="button" className="btn btn-secondary shrink-0" onClick={addOption}><Plus size={15} aria-hidden="true" />Add</button>
            </div>
            <p className="text-xs text-fg-muted">Renaming or removing an option never changes invoices that already use it.</p>
          </fieldset>
        )}
        <div className="space-y-2.5 border-t border-line pt-4">
          <label className="flex items-start gap-2.5 text-sm text-fg"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" checked={required} onChange={(e) => setRequired(e.target.checked)} /><span>Required<span className="block text-xs text-fg-muted">{type === 'checkbox' ? 'The box must be checked to save an invoice.' : 'An invoice cannot be saved while this is empty.'}</span></span></label>
          <label className="flex items-start gap-2.5 text-sm text-fg"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" checked={showInTable} onChange={(e) => setShowInTable(e.target.checked)} /><span>Show as a column in the invoice list<span className="block text-xs text-fg-muted">The value is always searchable and available in the form.</span></span></label>
        </div>
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      </form>
    </Modal>
  );
}
