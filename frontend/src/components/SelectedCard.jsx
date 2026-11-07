import { useStore } from '../store.js';
import { cheaperFits, costPerYear, gbp, netCost, resaleValue } from '../lib/finance.js';

const PRIORITY = { essential: 'Essential', soon: 'Buy soon', later: 'Can wait' };

export default function SelectedCard() {
  const uid = useStore((s) => s.selectedUid);
  const prefs = useStore((s) => s.prefs);
  const products = useStore((s) => s.products);
  const p = useStore((s) => (s.selectedUid ? s.productOf(s.selectedUid) : null));
  if (!uid || !p) return null;

  const months = prefs.tenancyMonths;
  const swaps = cheaperFits(p, products, prefs);
  const { rotate, unplace, swapProduct, select } = useStore.getState();

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
      <div className="row">
        <button className="btn small" onClick={() => rotate(uid)}>Rotate <kbd>R</kbd></button>
        <button className="btn small ghost" onClick={() => unplace(uid)}>Take out of room</button>
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
