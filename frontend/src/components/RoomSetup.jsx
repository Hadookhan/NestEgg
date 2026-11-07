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
  const [base, setBase] = useState(import.meta.env.VITE_PUBLIC_URL || null);
  const setRoom = useStore((s) => s.setRoom);
  const close = useStore((s) => s.closePanel);

  useEffect(() => {
    if (base) return;
    api.host()
      .then(({ lan_ip }) => setBase(`${window.location.protocol}//${lan_ip}:${window.location.port || 80}`))
      .catch(() => setBase(window.location.origin));
  }, [base]);

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
          {scanUrl && (
            <div className="qr">
              <QRCodeSVG value={scanUrl} size={168} bgColor="#F7F8F4" fgColor="#1E2A2B" />
            </div>
          )}
          <p className="fine">Phone and computer need to be on the same Wi-Fi. Or open <span className="code">{scanUrl}</span></p>
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
