import { useStore, HOTBAR_SIZE } from '../store.js';
import { gbp } from '../lib/finance.js';

export default function Hotbar() {
  const inventory = useStore((s) => s.inventory);
  const productById = useStore((s) => s.productById);
  const placed = useStore((s) => s.placed);
  const armedUid = useStore((s) => s.armedUid);
  const selectedUid = useStore((s) => s.selectedUid);
  const room = useStore((s) => s.room);
  const placedSet = new Set(placed.map((p) => p.uid));
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
          const inRoom = placedSet.has(entry.uid);
          return (
            <li key={entry.uid}>
              <button
                className={`slot ${inRoom ? 'in-room' : ''} ${armedUid === entry.uid ? 'armed' : ''} ${selectedUid === entry.uid ? 'selected' : ''}`}
                draggable={!!room}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/nestegg-uid', entry.uid);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => {
                  const s = useStore.getState();
                  if (inRoom) s.select(entry.uid);
                  else if (room) s.arm(entry.uid);
                }}
                title={`${p.name}: ${gbp(p.price)}. ${inRoom ? 'In the room.' : 'Drag into the room, or click then click the floor.'}`}
              >
                <span className="slot-key">{i + 1}</span>
                <span className="swatch" style={{ background: p.colour }} />
                <span className="slot-name">{p.name}</span>
                <span className="slot-price num">{gbp(p.price)}</span>
                {inRoom && <span className="slot-dot" aria-label="In the room" />}
              </button>
            </li>
          );
        })}
      </ol>
      <button className="btn all-items" onClick={() => useStore.getState().openPanel('inventory')}>
        All items <span className="count">{inventory.length}</span>
        <kbd>E</kbd>
      </button>
    </div>
  );
}
