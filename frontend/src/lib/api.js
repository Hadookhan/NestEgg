async function handle(res) {
  if (!res.ok) {
    let msg;
    try {
      const body = await res.json();
      msg = typeof body.detail === 'string' ? body.detail : body.detail?.[0]?.msg;
    } catch {
      /* not JSON */
    }
    throw new Error(msg || `The server returned an error (${res.status}).`);
  }
  return res.json();
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  health: () => fetch('/api/health').then(handle),
  host: () => fetch('/api/host').then(handle),
  createSession: () => fetch('/api/sessions', { method: 'POST' }).then(handle),
  getSession: (id) => fetch(`/api/sessions/${id}`).then(handle),
  saveState: (id, state) => fetch(`/api/sessions/${id}/state`, json('PUT', state)).then(handle),
  manualRoom: (id, body) => fetch(`/api/sessions/${id}/manual`, json('POST', body)).then(handle),
  panorama: (id, form) => fetch(`/api/sessions/${id}/panorama`, { method: 'POST', body: form }).then(handle),
  products: (params = {}) => fetch('/api/products?' + new URLSearchParams(params)).then(handle),
  normalise: (body) => fetch('/api/normalise', json('POST', body)).then(handle),
};
