import { Loader2, TriangleAlert } from 'lucide-react';
import { peso } from '../../utils/api.js';
import Modal from '../Modal.jsx';

export default function DeleteDialog({ invoice, onConfirm, onCancel, busy }) {
  return (
    <Modal title="Delete invoice?" description="This permanently removes the invoice and cannot be undone." onClose={onCancel} width="max-w-md"
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}{busy ? 'Deleting…' : 'Delete invoice'}</button>
      </>}>
      <div className="flex gap-3 rounded-lg border border-danger/25 bg-danger-soft p-3">
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 text-sm"><p className="num font-semibold text-fg">{invoice.invoice_no}</p><p className="truncate text-fg-muted">{invoice.client_name} · <span className="num">{peso(invoice.amount)}</span></p></div>
      </div>
    </Modal>
  );
}
