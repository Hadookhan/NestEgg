import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';

export function ManualForm({ sessionId, onDone, compact }) {
  const [form, setForm] = useState({ width: 340, depth: 300, height: 240, door_wall: 'south' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'door_wall' ? e.target.value : Number(e.target.value) });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const room = await api.manualRoom(sessionId, form);
      onDone?.(room);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`manual ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <label className="field"><span>Width (cm)</span>
        <input type="number" min="120" max="1500" value={form.width} onChange={set('width')} /></label>
      <label className="field"><span>Length (cm)</span>
        <input type="number" min="120" max="1500" value={form.depth} onChange={set('depth')} /></label>
      <label className="field"><span>Ceiling (cm)</span>
        <input type="number" min="200" max="400" value={form.height} onChange={set('height')} /></label>
      <label className="field"><span>Door is on the</span>
        <select value={form.door_wall} onChange={set('door_wall')}>
          <option value="south">Near wall</option>
          <option value="north">Far wall</option>
          <option value="west">Left wall</option>
          <option value="east">Right wall</option>
        </select>
      </label>
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Use these measurements'}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export default function RoomSetup({ sessionId, inModal }) {
  const envBase = import.meta.env.VITE_PUBLIC_URL || '';
  const [base, setBase] = useState(envBase || null);
  const [candidates, setCandidates] = useState([]);
  const [wslNat, setWslNat] = useState(false);
  const setRoom = useStore((s) => s.setRoom);
  const close = useStore((s) => s.closePanel);
  const port = window.location.port || '80';
  const toUrl = (ip) => `http://${ip}:${port}`;

  useEffect(() => {
    // Ask the dev server (where the phone connects) for its addresses; fall back to the backend.
    fetch('/__nestegg/host')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() => api.host())
      .then(({ lan_ip, candidates: c, wslNat: w }) => {
        setCandidates(c || []);
        setWslNat(!!w);
        if (!envBase) setBase(lan_ip ? toUrl(lan_ip) : null);
      })
      .catch(() => { if (!envBase) setBase(window.location.origin); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanUrl = base ? `${base.replace(/\/$/, '')}/#/scan/${sessionId}` : '';
  const done = (room) => { setRoom(room); close(); };
  const useSample = () =>
    api.manualRoom(sessionId, { width: 360, depth: 320, height: 245, door_wall: 'south', door_offset: 300 })
      .then((room) => done({ ...room, source: 'demo' }))
      .catch((e) => useStore.getState().notify(e.message));

  return (
    <div className={`setup ${inModal ? 'in-modal' : ''}`}>
      {inModal && (
        <div className="card-head">
          <h2>Set up your room</h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>×</button>
        </div>
      )}
      {!inModal && <h1 className="setup-title">First, get your room into NestEgg</h1>}
      <div className="setup-grid">
        <section className="setup-scan">
          <h2>Scan with your phone</h2>
          <p>Scan this code with your phone camera. Stand in the middle of the room and take a 360° photo, and it will appear here.</p>
          {wslNat && !envBase && (
            <div className="warn-note small">
              <p><strong>The planner is running inside WSL, which phones can't reach.</strong></p>
              <p>Easiest fix: stop <span className="code">npm run dev</span> here and run it from Windows PowerShell instead (the backend can stay in WSL). Or turn on WSL mirrored networking. Run <span className="code">npm run doctor</span> for step-by-step instructions.</p>
            </div>
          )}
          {scanUrl && !(wslNat && !envBase) && (
            <div className="qr">
              <QRCodeSVG value={scanUrl} size={168} bgColor="#F7F8F4" fgColor="#1E2A2B" />
            </div>
          )}
          <p className="fine">Phone and computer need to be on the same Wi-Fi. Or type this into the phone's browser: <span className="code">{scanUrl}</span></p>
          {envBase && envBase.startsWith('http://') && candidates.length > 0 &&
            !candidates.some((c) => envBase.includes(`//${c.ip}:`)) && (
            <p className="warn-note small">
              This link uses {envBase}, which this computer no longer has (addresses change when you switch Wi-Fi or hotspot).
              Clear VITE_PUBLIC_URL in frontend/.env and restart npm run dev.
            </p>
          )}
          {candidates.length > 1 && !envBase && (
            <label className="field">
              <span>Wrong address? This computer has several. Pick the Wi-Fi one:</span>
              <select value={base || ''} onChange={(e) => setBase(e.target.value)}>
                {candidates.map((c) => (
                  <option key={c.ip} value={toUrl(c.ip)}>{c.ip} ({c.kind || c.note})</option>
                ))}
              </select>
            </label>
          )}
          <details className="trouble">
            <summary>Phone can't open the link?</summary>
            <ol>
              <li>On the phone, type the address above into the browser yourself. If it never loads, the phone can't reach this computer. It isn't the QR code or the browser.</li>
              <li>Check the address matches the "Network:" line that <span className="code">npm run dev</span> printed.</li>
              <li>Allow port {port} through this computer's firewall. On Windows, set the Wi-Fi to a Private network.</li>
              <li>Event and university Wi-Fi often blocks devices from seeing each other. Connect both to a phone hotspot instead, or use a tunnel (see README).</li>
              <li>If the browser changes the address to https://, type it again starting with http://.</li>
            </ol>
          </details>
          <p className="waiting"><span className="pulse" aria-hidden="true" />Waiting for your phone</p>
        </section>
        <section>
          <h2>Or enter measurements</h2>
          <ManualForm sessionId={sessionId} onDone={done} />
          <button className="link" onClick={useSample}>Try a sample room instead</button>
        </section>
      </div>
    </div>
  );
}
