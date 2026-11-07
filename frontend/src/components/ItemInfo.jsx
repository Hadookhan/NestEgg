import { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { cheaperFits, costPerYear, gbp, netCost, resaleValue, categoryLabel } from '../lib/finance.js';
import { clearanceOf, isMounted } from '../lib/furniture.js';
import { clearanceConflicts } from '../lib/geometry.js';

const PRIORITY = { essential: 'Essential', soon: 'Buy soon', later: 'Can wait' };

/** Details popup for one item, opened with its 'i' button (hotbar or selection bar). */
export default function ItemInfo() {
  const uid = useStore((s) => s.infoUid);
  const anchorX = useStore((s) => s.infoAnchorX);
  const prefs = useStore((s) => s.prefs);
  const products = useStore((s) => s.products);
  const p = useStore((s) => (s.infoUid ? s.productOf(s.infoUid) : null));
  const placed = useStore((s) => s.placed);
  const ref = useRef(null);

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!uid) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-info-button]')) {
        useStore.getState().closeInfo();
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [uid]);

  if (!uid || !p) return null;

  const all = useStore.getState().placedWithProducts();
  const me = all.find((a) => a.uid === uid);
  const inRoom = !!placed.find((x) => x.uid === uid);
  const { front, around, why } = clearanceOf(p);
  const { blockedBy, blocking } = me ? clearanceConflicts(me, all) : { blockedBy: [], blocking: [] };
  const names = (list) => list.map((o) => o.product.name.toLowerCase()).join(', ');
  const months = prefs.tenancyMonths;
  const swaps = cheaperFits(p, products, prefs);
  const { swapProduct, closeInfo } = useStore.getState();

  // Sit just above the hotbar, lined up with the button that opened it.
  const style = anchorX != null
    ? { left: `clamp(12px, calc(${anchorX}px - 160px), calc(100% - 332px))` }
    : { right: '14px', top: '64px', bottom: 'auto' };

  return (
    <div ref={ref} className="card item-info" style={style} role="dialog" aria-label={`${p.name} details`}>
      <div className="card-head">
        <h3>{p.name}</h3>
        <button className="icon-btn" aria-label="Close details" onClick={closeInfo}>×</button>
      </div>
      <p className="muted small">
        {categoryLabel(p.category)}. {p.w} × {p.d} × {p.h} cm. {PRIORITY[p.priority]}.{' '}
        {p.condition === 'used' ? 'Second-hand.' : 'New.'}
        {me && isMounted(p) ? ` Hung ${me.y || 0} cm off the floor.` : ''}
        {inRoom ? ' In your room.' : ' In your inventory.'}
      </p>
      <dl className="receipt compact">
        <div><dt>Price</dt><dd className="num">{gbp(p.price)}</dd></div>
        <div><dt>Resale after {months} months</dt><dd className="num">−{gbp(resaleValue(p, months))}</dd></div>
        <div className="total"><dt>Real cost</dt><dd className="num">{gbp(netCost(p, months))}</dd></div>
        <div><dt>Per year of use</dt><dd className="num">{gbp(costPerYear(p))}</dd></div>
      </dl>
      {(front > 0 || around > 0) && (
        <p className="clear-note small">
          {why}. Keeps {around || front} cm clear{around ? ' all round' : ' in front'}.
        </p>
      )}
      {blockedBy.length > 0 && <p className="warn-note small">Blocked by the {names(blockedBy)}.</p>}
      {blocking.length > 0 && <p className="warn-note small">In the way of the {names(blocking)}.</p>}
      {p.url && <a className="link small" href={p.url} target="_blank" rel="noreferrer">View listing</a>}

      {swaps.length > 0 && (
        <div className="swaps">
          <h4>Cheaper options that fit the same space</h4>
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
