import { useStore, HOTBAR_SIZE } from '../store.js';
import { gbp, netCost } from '../lib/finance.js';

export default function InventoryModal() {
  const inventory = useStore((s) => s.inventory);
  const productById = useStore((s) => s.productById);
  const placed = useStore((s) => s.placed);
  const months = useStore((s) => s.prefs.tenancyMonths);
  const room = useStore((s) => s.room);
  const { closePanel, moveToHotbar, removeFromInventory, arm, unplace, openPanel } = useStore.getState();
  const placedSet = new Set(placed.map((p) => p.uid));
  const total = inventory.reduce((s, i) => s + (productById[i.productId]?.price || 0), 0);

  return (
    <div className="modal-backdrop" onClick={closePanel}>
      <div className="modal wide" role="dialog" aria-label="All items" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>All items</h2>
          <button className="icon-btn" aria-label="Close" onClick={closePanel}>×</button>
        </div>
        <p className="muted">
          {inventory.length} items, {gbp(total)} upfront. The first {HOTBAR_SIZE} sit in your hotbar.
        </p>

        {inventory.length === 0 ? (
          <div className="empty-state">
            <p>Your inventory is empty. Get suggestions from the side panel, or search for something specific.</p>
            <button className="btn primary" onClick={() => openPanel('find')}>Find item</button>
          </div>
        ) : (
          <ul className="inv-list">
            {inventory.map((entry, i) => {
              const p = productById[entry.productId];
              if (!p) return null;
              const inRoom = placedSet.has(entry.uid);
              return (
                <li key={entry.uid} className={i < HOTBAR_SIZE ? 'in-hotbar' : ''}>
                  <span className="slot-key">{i < HOTBAR_SIZE ? i + 1 : ''}</span>
                  <span className="swatch" style={{ background: p.colour }} />
                  <span className="inv-name">
                    {p.name}
                    <span className="muted small"> {p.w} × {p.d} cm{p.condition === 'used' ? ', second-hand' : ''}</span>
                  </span>
                  <span className="num">{gbp(p.price)}</span>
                  <span className="num muted small">real {gbp(netCost(p, months))}</span>
                  <span className="inv-actions">
                    {inRoom ? (
                      <button className="btn small ghost" onClick={() => unplace(entry.uid)}>Take out</button>
                    ) : (
                      <button className="btn small" disabled={!room}
                        onClick={() => { arm(entry.uid); closePanel(); }}>
                        Place
                      </button>
                    )}
                    {i >= HOTBAR_SIZE && (
                      <button className="btn small ghost" onClick={() => moveToHotbar(entry.uid)}>To hotbar</button>
                    )}
                    <button className="btn small ghost danger" onClick={() => removeFromInventory(entry.uid)}>Remove</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
