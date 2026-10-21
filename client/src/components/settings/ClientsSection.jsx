import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../../utils/api.js';
import { matchClients } from '../../utils/clients.js';
import { useToast } from '../Toast.jsx';
import Modal from '../Modal.jsx';
import { EmptyState, Skeleton } from '../ui.jsx';
import ClientEditorModal from './ClientEditorModal.jsx';
import { ExpandableList } from './Expandable.jsx';

const SEARCH_FROM = 6; // a search box appears once the list is longer than the compact view

// Settings > Clients: add, edit, search and delete the clients the Add Invoice form suggests.
export default function ClientsSection() {
  const toast = useToast();
  const [clients, setClients] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null), [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/api/clients').then((rows) => { setClients(rows); setError(''); }).catch((e) => setError(e.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  const shown = useMemo(() => matchClients(clients, search), [clients, search]);

  const remove = async () => {
    setBusy(true);
    try { await api(`/api/clients/${confirm.id}`, { method: 'DELETE' }); toast.success('Client deleted'); await load(); } catch (e) { toast.error(e.message); }
    setBusy(false); setConfirm(null);
  };
  const iconBtn = 'btn btn-ghost btn-icon !h-8 !w-8';

  return (
    <section className="card card-pad" aria-labelledby="clients-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="clients-heading" className="section-title">Clients</h3><p className="mt-1 text-sm text-fg-muted">Registered clients are suggested as you type in the Add and Edit Invoice forms, which then fill in the TIN and address.</p></div>
        <button type="button" className="btn btn-primary" onClick={() => setEditor({})}><Plus size={16} aria-hidden="true" />Add Client</button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-danger-ink">{error}</p>}
      {clients.length > SEARCH_FROM && <input type="search" className="input mb-3" aria-label="Search clients" placeholder="Search clients by name or TIN" value={search} onChange={(e) => setSearch(e.target.value)} />}
      <div className="border-t border-line">
        {loading ? <div className="space-y-2 py-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          : !clients.length ? <EmptyState compact icon={Users} title="No clients yet" description="Add a client with its name, TIN and address to reuse them on invoices." />
          : !shown.length ? <EmptyState compact icon={Users} title="No clients match" description={`Nothing matches “${search.trim()}”.`} />
          : <ExpandableList className="divide-y divide-line" items={shown} limit={6} render={(c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-fg">{c.name}</p>
                <p className="mt-0.5 text-xs text-fg-muted">TIN: {c.tin ? <span className="num text-fg">{c.tin}</span> : <span className="text-fg-subtle">Not set</span>}</p>
                <p className="break-words text-xs text-fg-muted">Address: {c.address ? <span className="text-fg">{c.address}</span> : <span className="text-fg-subtle">Not set</span>}</p>
              </div>
              <span className="flex shrink-0 gap-1">
                <button type="button" className={iconBtn} onClick={() => setEditor(c)} aria-label={`Edit ${c.name}`} title="Edit"><Pencil size={15} /></button>
                <button type="button" className={`${iconBtn} hover:!bg-danger-soft hover:!text-danger-ink`} onClick={() => setConfirm(c)} aria-label={`Delete ${c.name}`} title="Delete"><Trash2 size={15} /></button>
              </span>
            </li>)} />}
      </div>
      {editor && <ClientEditorModal client={editor.id ? editor : null} onClose={() => setEditor(null)} onSaved={(saved, wasEdit) => { setEditor(null); toast.success(wasEdit ? 'Client updated' : 'Client added'); load(); }} />}
      {confirm && (
        <Modal title="Delete client?" description="Existing invoices will keep this client’s name, TIN and address." onClose={() => !busy && setConfirm(null)} width="max-w-md"
          footer={<><button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button><button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete client'}</button></>}>
          <p className="text-sm text-fg">Delete <b>{confirm.name}</b> from the registered clients? It will no longer be suggested on new invoices.</p>
        </Modal>)}
    </section>
  );
}
