import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../utils/api.js';
import Modal from '../Modal.jsx';

// Add / edit one registered client: Name, TIN and Address.
export default function ClientEditorModal({ client, onClose, onSaved }) {
  const editing = Boolean(client?.id);
  const [name, setName] = useState(client?.name ?? ''), [tin, setTin] = useState(client?.tin ?? ''), [address, setAddress] = useState(client?.address ?? '');
  const [errs, setErrs] = useState({}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const aria = (key) => ({ 'aria-invalid': Boolean(errs[key]), 'aria-describedby': errs[key] ? `client-${key}-error` : undefined });
  const cls = (key) => `input ${errs[key] ? 'input-error' : ''}`;
  const problem = (key) => errs[key] && <span id={`client-${key}-error`} role="alert" className="mt-1 block text-xs font-normal text-danger-ink">{errs[key]}</span>;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) { setErrs({ name: 'Enter the client name.' }); setError(''); return; }
    setBusy(true);
    try {
      const saved = await api(editing ? `/api/clients/${client.id}` : '/api/clients', { method: editing ? 'PUT' : 'POST', body: { name, tin, address } });
      onSaved(saved, editing);
    } catch (e) { setErrs(e.fields || {}); setError(Object.keys(e.fields || {}).length ? '' : e.message); setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit client' : 'Add client'} description={editing ? 'Invoices already saved keep the details they were saved with.' : 'It will be suggested when you type its name in the Add Invoice form.'}
      onClose={() => !busy && onClose()} width="max-w-lg" dismissOnBackdrop={false}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="client-form" className="btn btn-primary min-w-32" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}{busy ? 'Saving…' : editing ? 'Save changes' : 'Add client'}</button>
      </>}>
      <form id="client-form" onSubmit={submit} className="space-y-4" noValidate>
        <label className="label block" htmlFor="client-name">
          <span className="mb-1.5 block">Name<span className="ml-0.5 text-danger" aria-hidden="true">*</span></span>
          <input id="client-name" data-autofocus className={cls('name')} {...aria('name')} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Trading Corp." required />
          {problem('name')}
        </label>
        <label className="label block" htmlFor="client-tin">
          <span className="mb-1.5 block">TIN<span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span></span>
          <input id="client-tin" className={`${cls('tin')} num`} {...aria('tin')} value={tin} maxLength={30} inputMode="numeric" autoComplete="off" onChange={(e) => setTin(e.target.value)} placeholder="123-456-789-00000" />
          {problem('tin')}
        </label>
        <label className="label block" htmlFor="client-address">
          <span className="mb-1.5 block">Address<span className="ml-1.5 text-xs font-normal text-fg-subtle">Optional</span></span>
          <textarea id="client-address" rows="3" className={`${cls('address')} resize-y`} {...aria('address')} value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} placeholder="Street, barangay, city, province" />
          {problem('address')}
        </label>
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      </form>
    </Modal>
  );
}
