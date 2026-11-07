import { useEffect, useState } from 'react';
import Editor from './components/Editor.jsx';
import ScanPage from './components/ScanPage.jsx';
import { api } from './lib/api.js';

function parseHash() {
  const m = window.location.hash.match(/^#\/(plan|scan)\/([a-z0-9]+)/);
  return m ? { page: m[1], id: m[2] } : null;
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // No session in the URL: start one. No login needed; the link is the session.
  useEffect(() => {
    if (route) return;
    api.createSession()
      .then((s) => { window.location.hash = `#/plan/${s.id}`; })
      .catch(() => setError("Can't reach the NestEgg server. Start the backend (see README), then reload."));
  }, [route]);

  if (error) return <div className="phone"><h1>Not connected</h1><p>{error}</p></div>;
  if (!route) return <div className="phone"><p className="muted">Starting…</p></div>;
  if (route.page === 'scan') return <ScanPage sessionId={route.id} />;
  return <Editor key={route.id} sessionId={route.id} />;
}
