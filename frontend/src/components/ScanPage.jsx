import { useState } from 'react';
import { api } from '../lib/api.js';
import { ManualForm } from './RoomSetup.jsx';

export default function ScanPage({ sessionId }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [height, setHeight] = useState(150);
  const [door, setDoor] = useState('south');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('scan');

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus('idle');
  };

  const send = async () => {
    setStatus('sending');
    setMessage('');
    const form = new FormData();
    form.append('file', file);
    form.append('camera_height', String(height));
    form.append('door_wall', door);
    try {
      const room = await api.panorama(sessionId, form);
      setStatus('done');
      setMessage(`Room measured at ${(room.width / 100).toFixed(1)} m by ${(room.depth / 100).toFixed(1)} m.`);
    } catch (e) {
      setStatus('error');
      setMessage(e.message);
    }
  };

  if (status === 'done') {
    return (
      <div className="phone">
        <h1>Done</h1>
        <p>{message}</p>
        <p>Your room is now on your computer. You can put your phone away.</p>
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="brand"><span className="brand-mark" aria-hidden="true" />NestEgg</div>
      <h1>Scan your room</h1>

      <div className="segmented small" role="tablist">
        <button role="tab" aria-selected={mode === 'scan'} onClick={() => setMode('scan')}>360° photo</button>
        <button role="tab" aria-selected={mode === 'manual'} onClick={() => setMode('manual')}>Measurements</button>
      </div>

      {mode === 'scan' ? (
        <>
          <ol className="steps">
            <li>Stand in the middle of the room.</li>
            <li>Hold your phone at chest height and take a full 360° panorama, so the floor and ceiling are visible all the way round.</li>
            <li>Upload it below.</li>
          </ol>
          <label className="upload">
            <input type="file" accept="image/*" capture="environment" onChange={pick} />
            {preview ? <img src={preview} alt="Your panorama" /> : <span>Take or choose a 360° photo</span>}
          </label>
          <label className="field">
            <span>Phone height from the floor (cm)</span>
            <input type="number" min="80" max="200" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Where is the door, facing the far wall?</span>
            <select value={door} onChange={(e) => setDoor(e.target.value)}>
              <option value="south">Behind me</option>
              <option value="north">In front of me</option>
              <option value="west">To my left</option>
              <option value="east">To my right</option>
            </select>
          </label>
          <button className="btn primary wide" disabled={!file || status === 'sending'} onClick={send}>
            {status === 'sending' ? 'Measuring your room… (up to a minute)' : 'Send to my computer'}
          </button>
          {status === 'error' && (
            <div className="error">
              <p>{message}</p>
              <button className="link" onClick={() => setMode('manual')}>Enter measurements instead</button>
            </div>
          )}
        </>
      ) : (
        <ManualForm sessionId={sessionId} compact onDone={(room) => {
          setStatus('done');
          setMessage(`Room set to ${(room.width / 100).toFixed(1)} m by ${(room.depth / 100).toFixed(1)} m.`);
        }} />
      )}
    </div>
  );
}
