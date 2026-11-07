import { useStore } from '../store.js';
import { gbp } from '../lib/finance.js';
import { heatColour } from './Furniture.jsx';

export default function HeatmapKey() {
  const placed = useStore((s) => s.placed);
  const productById = useStore((s) => s.productById);
  const prices = placed.map((p) => productById[p.productId]?.price).filter((n) => n != null);

  if (!prices.length) {
    return <div className="heat-key"><p className="small">Place items to see where your money goes.</p></div>;
  }
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `${heatColour(t)} ${t * 100}%`).join(', ');

  return (
    <div className="heat-key" role="img" aria-label={`Cost heatmap from ${gbp(lo)} in green to ${gbp(hi)} in red`}>
      <p className="small strong">Price of each item</p>
      <div className="heat-bar" style={{ background: `linear-gradient(90deg, ${stops})` }} />
      <div className="heat-labels num small">
        <span>{gbp(lo)}</span>
        {hi > lo && <span>{gbp((lo + hi) / 2)}</span>}
        <span>{gbp(hi)}</span>
      </div>
      <p className="fine">Cheapest in green, most expensive in red</p>
    </div>
  );
}
