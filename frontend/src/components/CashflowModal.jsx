import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store.js';
import { gbp, planPurchases } from '../lib/finance.js';

const FIELDS = [
  { key: 'savings', label: 'Savings you can use now', prefix: '£' },
  { key: 'income', label: 'Monthly take-home pay or loan', prefix: '£' },
  { key: 'fixed', label: 'Monthly rent, bills and food', prefix: '£' },
  { key: 'buffer', label: 'Never go below', prefix: '£' },
  { key: 'paydayDay', label: 'Payday (day of month)', prefix: '' },
];

function PurchaseDot({ cx, cy, payload }) {
  if (!payload?.spent) return <circle cx={cx} cy={cy} r={3} fill="#1E2A2B" />;
  return <circle cx={cx} cy={cy} r={7} fill="#E0A526" stroke="#1E2A2B" strokeWidth={1.5} />;
}

export default function CashflowModal() {
  const money = useStore((s) => s.money);
  const inventory = useStore((s) => s.inventory);
  const placed = useStore((s) => s.placed);
  const productById = useStore((s) => s.productById);
  const { setMoney, closePanel, select } = useStore.getState();

  const items = useMemo(
    () => [...placed, ...inventory].map((i) => ({ uid: i.uid, product: productById[i.productId] })).filter((i) => i.product),
    [placed, inventory, productById],
  );
  const plan = useMemo(() => planPurchases(items, money), [items, money]);

  let headline;
  if (!items.length) headline = 'Add items to plan purchases.';
  else if (plan.doneLabel === 'Today') headline = `You can buy everything today and keep ${gbp(plan.buffer)} spare.`;
  else if (plan.doneLabel) headline = `Fully furnished by ${plan.doneLabel}, never dropping below ${gbp(plan.buffer)}.`;
  else if (plan.monthly <= 0) headline = 'Your monthly costs use all your income, so nothing more can be bought. Lower the buffer or swap to cheaper items.';
  else headline = `${plan.remaining.length} items don't fit in the next 12 months. Swap them for cheaper options or remove them.`;

  return (
    <div className="modal-backdrop" onClick={closePanel}>
      <div className="modal wide" role="dialog" aria-label="Plan when to buy" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>Plan when to buy</h2>
          <button className="icon-btn" aria-label="Close" onClick={closePanel}>×</button>
        </div>

        <div className="money-inputs">
          {FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <span className="prefixed">
                {f.prefix && <span>{f.prefix}</span>}
                <input type="number" min={f.key === 'paydayDay' ? 1 : 0} max={f.key === 'paydayDay' ? 28 : undefined}
                  value={money[f.key]} onChange={(e) => setMoney(f.key, Number(e.target.value))} />
              </span>
            </label>
          ))}
        </div>

        <p className={`headline ${plan.doneLabel ? 'good' : 'warn'}`}>{headline}</p>

        {items.length > 0 && (
          <div className="chart">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={plan.series} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="#D5DCD6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#5B6966' }} />
                <YAxis tickFormatter={(v) => gbp(v)} width={64} tick={{ fontSize: 12, fill: '#5B6966' }} />
                <Tooltip
                  formatter={(v, name) => [gbp(v), name === 'balance' ? 'Balance after buying' : name]}
                  labelFormatter={(l) => l}
                />
                <ReferenceLine y={plan.buffer} stroke="#B23A3A" strokeDasharray="5 4"
                  label={{ value: 'Your buffer', position: 'insideBottomRight', fill: '#B23A3A', fontSize: 12 }} />
                <Line type="stepAfter" dataKey="balance" stroke="#2E6B4E" strokeWidth={2.5}
                  dot={<PurchaseDot />} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <ol className="phases">
          {plan.phases.map((ph) => (
            <li key={ph.index}>
              <div className="phase-head">
                <strong>{ph.label}</strong>
                <span className="num">{gbp(ph.spent)}</span>
              </div>
              <p>{ph.items.map((it) => it.product.name).join(', ')}</p>
            </li>
          ))}
          {plan.remaining.length > 0 && (
            <li className="later">
              <div className="phase-head"><strong>Not within 12 months</strong></div>
              <p>
                {plan.remaining.map((it, i) => (
                  <span key={it.uid}>
                    {i > 0 && ', '}
                    <button className="link" onClick={() => { closePanel(); if (placed.some((p) => p.uid === it.uid)) select(it.uid); }}>{it.product.name}</button>
                  </span>
                ))}
              </p>
            </li>
          )}
        </ol>
        <p className="fine">
          Buys essentials first, then items you need soon, then the rest. This is a planning aid, not financial advice.
        </p>
      </div>
    </div>
  );
}
