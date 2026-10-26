import { useCallback, useEffect, useState } from 'react';
import { Package, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../../utils/api.js';
import { useToast } from '../Toast.jsx';
import Modal from '../Modal.jsx';
import { EmptyState, Skeleton } from '../ui.jsx';
import { ExpandableList } from './Expandable.jsx';

// Mounted only when the Products / Services settings page is open.
// Existing CRUD behaviour and API endpoints are preserved.
export default function ProductsSection() {
  const toast = useToast();
  const [options, setOptions] = useState([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await api('/api/products');
      setOptions(items);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) { setError('Enter a product or service name.'); return; }
    setBusy(true);
    try {
      await api(editing ? `/api/products/${editing.id}` : '/api/products', {
        method: editing ? 'PUT' : 'POST',
        body: { name: value },
      });
      setName('');
      setEditing(null);
      setError('');
      toast.success(editing ? 'Option updated' : 'Option added');
      await load();
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (option) => {
    setEditing(option);
    setName(option.name);
    setError('');
  };
  const cancel = () => {
    setEditing(null);
    setName('');
    setError('');
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/products/${confirm.id}`, { method: 'DELETE' });
      toast.success('Option deleted');
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const ActionIcon = editing ? Save : Plus;

  return (
    <section className="card card-pad" aria-labelledby="products-heading">
      <div className="mb-4">
        <h2 id="products-heading" className="section-title">Product / Service options</h2>
        <p className="mt-1 text-sm text-fg-muted">Manage the products and services available in the Add and Edit Invoice forms.</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="product-option-name">Product or service name</label>
        <input
          id="product-option-name"
          className={`input ${error ? 'input-error' : ''}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'product-option-error' : undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Consulting Services"
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <ActionIcon size={16} aria-hidden="true" />
          {editing ? 'Save Changes' : 'Add Option'}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>
            <X size={16} aria-hidden="true" />Cancel
          </button>
        )}
      </form>
      {error && <p id="product-option-error" role="alert" className="mt-2 text-sm text-danger-ink">{error}</p>}
      <div className="mt-5 border-t border-line">
        {loading ? (
          <div className="space-y-2 py-4"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
        ) : !options.length ? (
          <EmptyState compact icon={Package} title="No options yet" description="Add your first product or service above." />
        ) : (
          <ExpandableList className="divide-y divide-line" items={options} limit={6} render={(option) => (
            <li key={option.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-fg">{option.name}</span>
              <span className="flex shrink-0 gap-1">
                <button type="button" className="btn btn-ghost btn-icon !h-8 !w-8" onClick={() => edit(option)} aria-label={`Edit ${option.name}`} title="Edit"><Pencil size={15} /></button>
                <button type="button" className="btn btn-ghost btn-icon !h-8 !w-8 hover:!bg-danger-soft hover:!text-danger-ink" onClick={() => setConfirm(option)} aria-label={`Delete ${option.name}`} title="Delete"><Trash2 size={15} /></button>
              </span>
            </li>
          )} />
        )}
      </div>
      {confirm && (
        <Modal title="Delete option?" description="Existing invoices will keep this value." onClose={() => !busy && setConfirm(null)} width="max-w-md"
          footer={<>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete option'}</button>
          </>}>
          <p className="text-sm text-fg">Delete <b>{confirm.name}</b> from the list of product and service options?</p>
        </Modal>
      )}
    </section>
  );
}
