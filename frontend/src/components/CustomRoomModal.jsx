import { useMemo } from 'react';
import { useStore } from '../store.js';
import { ENVELOPES, ENVELOPE_OF, ROOM_TYPES, categoryLabel, gbp, totalBudget } from '../lib/finance.js';
import { allCategories, customPreset } from '../lib/suggest.js';

export default function CustomRoomModal() {
  const products = useStore((s) => s.products);
  const prefs = useStore((s) => s.prefs);
  const { setCustom, closePanel, suggest } = useStore.getState();
  const custom = prefs.custom || {};

  // Every item type in the catalogue, grouped the same way as the budget envelopes.
  const groups = useMemo(() => {
    const cats = allCategories(products);
    return ENVELOPES.map((e) => ({
      ...e,
      cats: cats.filter((c) => (ENVELOPE_OF[c] || 'finishing') === e.key).sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
    })).filter((g) => g.cats.length);
  }, [products]);

  const cheapest = useMemo(() => {
    const out = {};
    for (const p of products) {
      if (prefs.includeUsed || p.condition !== 'used') out[p.category] = Math.min(out[p.category] ?? Infinity, p.price);
    }
    return out;
  }, [products, prefs.includeUsed]);

  const update = (cat, patch) => {
    const cur = custom[cat] || { on: false, count: 1, budget: Math.ceil((cheapest[cat] || 0) * 1.5 / 5) * 5 };
    setCustom({ ...custom, [cat]: { ...cur, ...patch } });
  };
  const total = totalBudget(prefs);
  const chosen = Object.values(custom).filter((c) => c.on).length;

  return (
    <div className="modal-backdrop" onClick={closePanel}>
      <div className="modal wide" role="dialog" aria-label="Custom room budgets" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>Custom room budgets</h2>
          <button className="icon-btn" aria-label="Close" onClick={closePanel}>×</button>
        </div>
        <p className="muted">
          Tick what this room needs, how many, and the most you want to spend on each. Suggestions never go over an item's budget.
        </p>

        <div className="row">
          <label className="field grow">
            <span>Start from a room type</span>
            <select defaultValue="" onChange={(e) => e.target.value && setCustom(customPreset(e.target.value, products))}>
              <option value="">Choose to replace the list below…</option>
              {ROOM_TYPES.filter((r) => r.key !== 'custom').map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <div className="custom-total">
            <span className="muted small">Total budget</span>
            <strong className="num">{gbp(total)}</strong>
          </div>
        </div>

        {groups.map((g) => (
          <fieldset key={g.key} className="custom-group">
            <legend>{g.label}</legend>
            {g.cats.map((cat) => {
              const c = custom[cat] || { on: false, count: 1, budget: 0 };
              const tooLow = c.on && cheapest[cat] != null && c.budget < cheapest[cat] * c.count;
              return (
                <div key={cat} className={`custom-row ${c.on ? 'on' : ''}`}>
                  <label className="check">
                    <input type="checkbox" checked={!!c.on} onChange={(e) => update(cat, { on: e.target.checked })} />
                    {categoryLabel(cat)}
                  </label>
                  <label className="mini">
                    <span className="sr-only">How many</span>
                    <input type="number" min="1" max="8" value={c.count} disabled={!c.on}
                      onChange={(e) => update(cat, { count: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} />
                    <span className="muted small">×</span>
                  </label>
                  <label className="mini prefixed">
                    <span>£</span>
                    <input type="number" min="0" step="5" value={c.budget} disabled={!c.on}
                      aria-label={`Budget for ${categoryLabel(cat)}`}
                      onChange={(e) => update(cat, { budget: Math.max(0, Number(e.target.value) || 0) })} />
                  </label>
                  <span className={`small ${tooLow ? 'over-text' : 'muted'}`}>
                    {cheapest[cat] != null ? `from ${gbp(cheapest[cat])} each` : ''}
                  </span>
                </div>
              );
            })}
          </fieldset>
        ))}

        <div className="row">
          <button className="btn primary" disabled={!chosen}
            onClick={() => { closePanel(); suggest(); }}>
            Suggest items within these budgets
          </button>
          <button className="btn ghost" onClick={closePanel}>Done</button>
        </div>
      </div>
    </div>
  );
}
