import { useStore } from '../store.js';
import { cheaperFits, costPerYear, gbp, netCost, resaleValue } from '../lib/finance.js';
import { clearanceOf, isMounted } from '../lib/furniture.js';
import { clearanceConflicts } from '../lib/geometry.js';

const PRIORITY = { essential: 'Essential', soon: 'Buy soon', later: 'Can wait' };

export default function SelectedCard() {
  const uid = useStore((s) => s.selectedUid);
  const prefs = useStore((s) => s.prefs);
  const products = useStore((s) => s.products);
  const p = useStore((s) => (s.selectedUid ? s.productOf(s.selectedUid) : null));
  const placed = useStore((s) => s.placed);
  if (!uid || !p) return null;

  const all = useStore.getState().placedWithProducts();
  const me = all.find((a) => a.uid === uid);
  const { front, around, why } = clearanceOf(p);
  const { blockedBy, blocking } = me ? clearanceConflicts(me, all) : { blockedBy: [], blocking: [] };
  const names = (list) => list.map((o) => o.product.name.toLowerCase()).join(', ');
  const mounted = isMounted(p);
  const room = useStore.getState().room;
  const y = me?.y || 0;
  const maxY = Math.max(0, (room?.height || 240) - p.h);

  const months = prefs.tenancyMonths;
  const swaps = cheaperFits(p, products, prefs);
  const { rotate, unplace, swapProduct, select } = useStore.getState();
  void placed; // re-render when anything moves, so warnings stay current

  return (
    <div className="card selected-card" role="dialog" aria-label={p.name}>
      <div className="card-head">
        <h3>{p.name}</h3>
        <button className="icon-btn" aria-label="Close" onClick={() => select(null)}>×</button>
      </div>
      <p className="muted small">
        {p.w} × {p.d} × {p.h} cm. {PRIORITY[p.priority]}. {p.condition === 'used' ? 'Second-hand.' : 'New.'}
      </p>
      <dl className="receipt compact">
        <div><dt>Price</dt><dd className="num">{gbp(p.price)}</dd></div>
        <div><dt>Resale after {months} months</dt><dd className="num">−{gbp(resaleValue(p, months))}</dd></div>
        <div className="total"><dt>Real cost</dt><dd className="num">{gbp(netCost(p, months))}</dd></div>
        <div><dt>Per year of use</dt><dd className="num">{gbp(costPerYear(p))}</dd></div>
      </dl>
      {(front > 0 || around > 0) && (
        <p className="clear-note small">
          {why}. Keeps {around || front} cm clear{around ? ' all round' : ' in front'} (shaded on the floor).
        </p>
      )}
      {blockedBy.length > 0 && (
        <p className="warn-note small">Blocked by the {names(blockedBy)}. Move one of them so it can be used properly.</p>
      )}
      {blocking.length > 0 && (
        <p className="warn-note small">This is in the way of the {names(blocking)}.</p>
      )}
      {mounted && (
        <label className="field height-field">
          <span className="field-row">
            Height off the floor <strong className="num">{y} cm</strong>
          </span>
          <input type="range" min="0" max={maxY} step="5" value={y}
            onChange={(e) => useStore.getState().setHeight(uid, Number(e.target.value))} />
          <span className="fine">Or press ↑ and ↓, or hold Shift while dragging. Drag it along any wall to move it.</span>
        </label>
      )}
      <div className="row">
        {!mounted && <button className="btn small" onClick={() => rotate(uid)}>Rotate <kbd>R</kbd></button>}
        <button className="btn small ghost" onClick={() => unplace(uid)}>Back to inventory</button>
        <button className="btn small ghost danger" onClick={() => useStore.getState().bin(uid)}>Bin</button>
      </div>
      {p.url && <a className="link small" href={p.url} target="_blank" rel="noreferrer">View listing</a>}

      {swaps.length > 0 && (
        <div className="swaps">
          <h4>Cheaper options that fit this spot</h4>
          <ul>
            {swaps.map((q) => (
              <li key={q.id}>
                <span className="swatch" style={{ background: q.colour }} />
                <span className="swap-name">
                  {q.name}
                  <span className="muted small"> Real cost {gbp(netCost(q, months))}</span>
                </span>
                <button className="btn small" onClick={() => swapProduct(uid, q.id)}>
                  Swap, save {gbp(p.price - q.price)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
