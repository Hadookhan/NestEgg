import { useMemo } from 'react';
import { useStore } from '../store.js';
import { ROOM_TYPES, summarise, gbp } from '../lib/finance.js';

const THEMES = [
  { key: 'minimal', label: 'Minimal' },
  { key: 'scandi', label: 'Scandi' },
  { key: 'industrial', label: 'Industrial' },
  { key: 'cosy', label: 'Cosy' },
  { key: 'bold', label: 'Bold' },
];
const TONES = [
  { key: 'any', label: 'Any colours' },
  { key: 'light', label: 'Light and airy' },
  { key: 'wood', label: 'Warm woods' },
  { key: 'dark', label: 'Dark and moody' },
  { key: 'colour', label: 'Bold colour' },
];

export default function SidePanel() {
  const prefs = useStore((s) => s.prefs);
  const room = useStore((s) => s.room);
  const inventory = useStore((s) => s.inventory);
  const placed = useStore((s) => s.placed);
  const productById = useStore((s) => s.productById);
  const { setPref, suggest, openPanel } = useStore.getState();

  // Money covers everything picked: items in the room and items still in the inventory.
  const inRoom = useMemo(
    () => [...placed, ...inventory].map((i) => productById[i.productId]).filter(Boolean),
    [placed, inventory, productById],
  );
  const sum = useMemo(() => summarise(inRoom, prefs), [inRoom, prefs]);

  return (
    <aside className="side">
      <section className="side-section">
        <div className="side-head">
          <h2>Your room</h2>
          <button className="link" onClick={() => openPanel('room')}>{room ? 'Rescan' : 'Set up'}</button>
        </div>
        {room ? (
          <p className="room-dims">
            {(room.width / 100).toFixed(1)} m by {(room.depth / 100).toFixed(1)} m
            <span className="muted"> ({room.source === 'horizonnet' ? 'from scan' : room.source === 'demo' ? 'sample room' : 'measured'})</span>
          </p>
        ) : (
          <p className="muted">Scan or measure your room to start.</p>
        )}

        <label className="field">
          <span>Room type</span>
          <select value={prefs.roomType} onChange={(e) => setPref('roomType', e.target.value)}>
            {ROOM_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>

        <div className="field">
          <span>Style</span>
          <div className="chips">
            {THEMES.map((t) => (
              <button key={t.key} className={`chip ${prefs.theme === t.key ? 'on' : ''}`}
                aria-pressed={prefs.theme === t.key} onClick={() => setPref('theme', t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Colours</span>
          <select value={prefs.tone} onChange={(e) => setPref('tone', e.target.value)}>
            {TONES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>

        <label className="field">
          <span className="field-row">Budget <strong className="num">{gbp(prefs.budget)}</strong></span>
          <input type="range" min="100" max="3000" step="25" value={prefs.budget}
            onChange={(e) => setPref('budget', Number(e.target.value))} />
        </label>

        <label className="field">
          <span className="field-row">Staying for <strong className="num">{prefs.tenancyMonths} months</strong></span>
          <input type="range" min="3" max="36" step="1" value={prefs.tenancyMonths}
            onChange={(e) => setPref('tenancyMonths', Number(e.target.value))} />
        </label>

        <label className="check">
          <input type="checkbox" checked={prefs.includeUsed} onChange={(e) => setPref('includeUsed', e.target.checked)} />
          Include second-hand
        </label>

        <button className="btn wide" onClick={suggest} disabled={!room}>Suggest items for this room</button>
      </section>

      <section className="side-section money">
        <h2>Your money</h2>
        <div className="envelopes">
          {sum.envelopes.map((e) => {
            const pct = e.budget > 0 ? Math.min(100, (e.spent / e.budget) * 100) : 100;
            return (
              <div key={e.key} className={`envelope ${e.over ? 'over' : ''}`}>
                <div className="field-row">
                  <span>{e.label}</span>
                  <span className="num">{gbp(e.spent)} of {gbp(e.budget)}</span>
                </div>
                <div className="bar"><div style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>

        <dl className="receipt">
          <div><dt>Upfront</dt><dd className={`num ${sum.overBudget ? 'over-text' : ''}`}>{gbp(sum.upfront)}</dd></div>
          <div><dt>Back when you move out</dt><dd className="num">−{gbp(sum.resale)}</dd></div>
          <div className="total"><dt>Real cost to you</dt><dd className="num">{gbp(sum.net)}</dd></div>
          <div><dt>Per year of use</dt><dd className="num">{gbp(sum.perYear)}</dd></div>
        </dl>
        <p className="fine">
          For everything in your room and inventory. Resale and lifespan are estimates.
        </p>
        <button className="btn wide primary" onClick={() => openPanel('plan')} disabled={!inRoom.length}>
          Plan when to buy
        </button>
      </section>
    </aside>
  );
}
