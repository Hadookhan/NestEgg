import { useEffect } from 'react';
import { useStore } from '../store.js';

export default function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => useStore.setState({ toast: null }), toast.action ? 6000 : 4200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.msg}</span>
      {toast.action && (
        <button className="toast-action" onClick={toast.action.run}>{toast.action.label}</button>
      )}
    </div>
  );
}
