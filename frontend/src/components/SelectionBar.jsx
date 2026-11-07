import { useStore } from '../store.js';
import { gbp } from '../lib/finance.js';
import { isMounted } from '../lib/furniture.js';
import { clearanceConflicts } from '../lib/geometry.js';

/** Slim toolbar for the item selected in the room. Details live behind its 'i' button. */
export default function SelectionBar() {
  const uid = useStore((s) => s.selectedUid);
  const p = useStore((s) => (s.selectedUid ? s.productOf(s.selectedUid) : null));
  const placed = useStore((s) => s.placed);
  const infoUid = useStore((s) => s.infoUid);
  if (!uid || !p) return null;

  const all = useStore.getState().placedWithProducts();
  const me = all.find((a) => a.uid === uid);
  if (!me) return null;
  const blocked = clearanceConflicts(me, all).blockedBy.length > 0;
  const mounted = isMounted(p);
  const { rotate, unplace, bin, nudgeHeight, toggleInfo, select } = useStore.getState();
  void placed; // re-render when anything moves

  return (
    <div className="selection-bar" role="toolbar" aria-label={`${p.name} actions`}>
      <span className="swatch" style={{ background: p.colour }} />
      <span className="sel-name" title={p.name}>{p.name}</span>
      <span className="num sel-price">{gbp(p.price)}</span>
      {blocked && <span className="sel-warn" title="Something is in its way">Blocked</span>}
      <button className={`info-btn ${infoUid === uid ? 'on' : ''}`} data-info-button
        aria-label="Details" title="Details (I)" onClick={() => toggleInfo(uid, null)}>i</button>
      {mounted ? (
        <>
          <button className="btn small" aria-label="Raise" title="Raise (↑)" onClick={() => nudgeHeight(uid, 5)}>↑</button>
          <span className="num small sel-height">{me.y || 0} cm</span>
          <button className="btn small" aria-label="Lower" title="Lower (↓)" onClick={() => nudgeHeight(uid, -5)}>↓</button>
        </>
      ) : (
        <button className="btn small" title="Rotate (R)" onClick={() => rotate(uid)}>Rotate</button>
      )}
      <button className="btn small ghost" title="Back to inventory (Delete)" onClick={() => unplace(uid)}>Unplace</button>
      <button className="btn small ghost danger" onClick={() => bin(uid)}>Bin</button>
      <button className="icon-btn" aria-label="Deselect" onClick={() => select(null)}>×</button>
    </div>
  );
}
