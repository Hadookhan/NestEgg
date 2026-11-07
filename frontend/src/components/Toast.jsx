import { useEffect } from 'react';
import { useStore } from '../store.js';

export default function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => useStore.setState({ toast: null }), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      {toast.msg}
    </div>
  );
}
