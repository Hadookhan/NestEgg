import { ALLOCATION, ENVELOPE_OF, netCost, totalBudget } from './finance.js';
import { fitsRoom } from './geometry.js';

// What a first-time mover needs in each room, in buying order: [category, count].
export const RECIPES = {
  bedroom: [['bed', 1], ['wardrobe', 1], ['bedside', 1], ['drawers', 1], ['desk', 1], ['office_chair', 1],
    ['floor_lamp', 1], ['wall_art', 1], ['mirror', 1]],
  living_room: [['sofa', 1], ['coffee_table', 1], ['tv', 1], ['bookshelf', 1], ['armchair', 1], ['tv_stand', 1],
    ['coat_hooks', 1], ['floor_lamp', 1], ['wall_art', 1]],
  home_office: [['desk', 1], ['office_chair', 1], ['bookshelf', 1], ['wall_shelf', 1], ['filing_cabinet', 1], ['floor_lamp', 1]],
  dining: [['dining_table', 1], ['dining_chair', 4], ['sideboard', 1], ['wall_art', 1]],
  bathroom: [['bath_cabinet', 1], ['bath_wall_cabinet', 1], ['towel_stand', 1], ['bath_shelf', 1], ['hamper', 1], ['stool', 1]],
};

/** Every category that exists in the catalogue, for the custom room editor. */
export const allCategories = (products) => [...new Set(products.map((p) => p.category))];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};

/**
 * A starting point for a custom room: the items a room type normally needs,
 * each budgeted at a typical (median) catalogue price.
 */
export function customPreset(roomType, products) {
  const out = {};
  for (const [cat, count] of RECIPES[roomType] || []) {
    const prices = products.filter((p) => p.category === cat).map((p) => p.price);
    out[cat] = { on: true, count, budget: Math.ceil((median(prices) * count) / 5) * 5 };
  }
  return out;
}

/**
 * Returns product ids to add. Prefers the chosen theme and colour tone, and
 * among equals picks the lowest cost after resale (not just the lowest price).
 * Normal rooms share the budget between envelopes; a custom room gives each
 * item type its own budget, which is never exceeded.
 */
export function suggestProducts({ products, inventoryProducts, prefs, room }) {
  const { roomType, theme, tone, includeUsed, tenancyMonths } = prefs;
  const custom = roomType === 'custom' ? prefs.custom || {} : null;
  const budget = totalBudget(prefs);
  const alloc = ALLOCATION[roomType] || {};

  const spentBy = {}; // by envelope, or by category for custom rooms
  let total = 0;
  const haveCount = {};
  const keyOf = (cat) => (custom ? cat : ENVELOPE_OF[cat] || 'finishing');
  for (const p of inventoryProducts) {
    spentBy[keyOf(p.category)] = (spentBy[keyOf(p.category)] || 0) + p.price;
    total += p.price;
    haveCount[p.category] = (haveCount[p.category] || 0) + 1;
  }

  const recipe = custom
    ? Object.entries(custom).filter(([, v]) => v.on && v.count > 0).map(([cat, v]) => [cat, Number(v.count)])
    : RECIPES[roomType] || [];

  const score = (p) => (p.styles.includes(theme) ? 2 : 0) + (tone !== 'any' && p.tone === tone ? 1 : 0);
  const picks = [];

  for (const [cat, count] of recipe) {
    const need = count - (haveCount[cat] || 0);
    if (need <= 0) continue;
    const candidates = products.filter(
      (p) => p.category === cat && (custom || p.rooms.includes(roomType)) &&
        (includeUsed || p.condition !== 'used') && (!room || fitsRoom(p, room)),
    );
    if (!candidates.length) continue;

    const key = keyOf(cat);
    const keyBudget = custom ? Number(custom[cat].budget) || 0 : budget * (alloc[key] || 0);
    const affordable = candidates.filter(
      (p) => (spentBy[key] || 0) + p.price * need <= keyBudget && total + p.price * need <= budget,
    );
    // In normal rooms, essentials may borrow from other envelopes within the total budget.
    const fallback = custom ? [] : candidates.filter(
      (p) => p.priority === 'essential' && total + p.price * need <= budget,
    );
    const pool = affordable.length ? affordable : fallback;
    if (!pool.length) continue;

    pool.sort((a, b) => score(b) - score(a) || netCost(a, tenancyMonths) - netCost(b, tenancyMonths));
    const pick = pool[0];
    for (let i = 0; i < need; i++) picks.push(pick.id);
    spentBy[key] = (spentBy[key] || 0) + pick.price * need;
    total += pick.price * need;
  }
  return picks;
}
