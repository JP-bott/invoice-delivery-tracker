import Modal from '../Modal.jsx';

export default function DeleteDialog({ invoice, onConfirm, onCancel }) {
  return (
    <Modal title="Delete invoice" onClose={onCancel} width="max-w-sm">
      <p>Delete invoice <b>{invoice.invoice_no}</b>?</p>
      <div className="flex justify-end gap-2 pt-2">
        <button className="text-sm" onClick={onCancel}>Cancel</button>
        <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white" onClick={onConfirm}>Delete</button>
      </div>
    </Modal>
  );
}
