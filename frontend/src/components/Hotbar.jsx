import { useState } from 'react';
import { useStore, HOTBAR_SIZE } from '../store.js';
import { gbp } from '../lib/finance.js';

function Bin() {
  const overBin = useStore((s) => s.overBin);
  const dragging = useStore((s) => s.dragging);
  const selectedUid = useStore((s) => s.selectedUid);
  const [htmlOver, setHtmlOver] = useState(false);
  const active = overBin || htmlOver;

  return (
    <button
      data-bin
      className={`bin ${active ? 'over' : ''} ${dragging ? 'ready' : ''}`}
      aria-label={selectedUid ? 'Bin the selected item' : 'Bin: drag an item here to bin it'}
      title="Drag an item here to bin it"
      onDragOver={(e) => { e.preventDefault(); setHtmlOver(true); }}
      onDragLeave={() => setHtmlOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setHtmlOver(false);
        const uid = e.dataTransfer.getData('text/nestegg-uid');
        if (uid) useStore.getState().bin(uid);
      }}
      onClick={() => {
        const s = useStore.getState();
        if (s.selectedUid) s.bin(s.selectedUid);
        else s.notify('Drag an item from the hotbar or the room onto the bin to bin it.');
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
      </svg>
      Bin
    </button>
  );
}

export default function Hotbar() {
  const inventory = useStore((s) => s.inventory);
  const productById = useStore((s) => s.productById);
  const armedUid = useStore((s) => s.armedUid);
  const infoUid = useStore((s) => s.infoUid);
  const room = useStore((s) => s.room);
  const slots = Array.from({ length: HOTBAR_SIZE }, (_, i) => inventory[i] || null);

  return (
    <div className="hotbar-wrap">
      <ol className="hotbar" aria-label="Inventory hotbar">
        {slots.map((entry, i) => {
          if (!entry) {
            return (
              <li key={`empty-${i}`} className="slot empty">
                <span className="slot-key">{i + 1}</span>
              </li>
            );
          }
          const p = productById[entry.productId];
          if (!p) return null;
          return (
            <li key={entry.uid}>
              <div
                role="button"
                tabIndex={0}
                className={`slot ${armedUid === entry.uid ? 'armed' : ''} ${infoUid === entry.uid ? 'info-open' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/nestegg-uid', entry.uid);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => room && useStore.getState().arm(entry.uid)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && room) { e.preventDefault(); useStore.getState().arm(entry.uid); }
                }}
                aria-label={`${p.name}, ${gbp(p.price)}. Press to place.`}
              >
                <span className="slot-key">{i + 1}</span>
                <span className="swatch" style={{ background: p.colour }} />
                <button
                  className={`info-btn slot-info ${infoUid === entry.uid ? 'on' : ''}`}
                  data-info-button
                  draggable={false}
                  aria-label={`Details for ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const stage = e.currentTarget.closest('.stage');
                    const r = e.currentTarget.getBoundingClientRect();
                    const sr = stage ? stage.getBoundingClientRect() : { left: 0 };
                    useStore.getState().toggleInfo(entry.uid, Math.round(r.left + r.width / 2 - sr.left));
                  }}
                >
                  i
                </button>
                <span className="slot-name">{p.name}</span>
                <span className="slot-price num">{gbp(p.price)}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <button className="btn all-items" onClick={() => useStore.getState().openPanel('inventory')}>
        All items <span className="count">{inventory.length}</span>
        <kbd>E</kbd>
      </button>
      <Bin />
    </div>
  );
}
