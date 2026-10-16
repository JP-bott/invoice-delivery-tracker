export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div role={toast.bad ? 'alert' : 'status'} className={`fixed bottom-4 right-4 rounded-lg px-4 py-2 text-sm text-white ${toast.bad ? 'bg-red-600' : 'bg-slate-800'}`}>
      {toast.msg}
    </div>
  );
}
