import { ALLOCATION, ENVELOPE_OF, netCost } from './finance.js';
import { fitsRoom } from './geometry.js';

// What a first-time mover needs in each room, in buying order: [category, count].
export const RECIPES = {
  bedroom: [['bed', 1], ['wardrobe', 1], ['bedside', 1], ['drawers', 1], ['desk', 1], ['office_chair', 1], ['floor_lamp', 1], ['mirror', 1]],
  living_room: [['sofa', 1], ['coffee_table', 1], ['bookshelf', 1], ['armchair', 1], ['tv_stand', 1], ['floor_lamp', 1]],
  home_office: [['desk', 1], ['office_chair', 1], ['bookshelf', 1], ['filing_cabinet', 1], ['floor_lamp', 1]],
  dining: [['dining_table', 1], ['dining_chair', 4], ['sideboard', 1]],
  bathroom: [['bath_cabinet', 1], ['towel_stand', 1], ['bath_shelf', 1], ['hamper', 1], ['stool', 1]],
};

/**
 * Returns product ids to add. Respects each budget envelope and the total
 * budget, prefers the chosen theme and colour tone, and among equals picks
 * the item with the lowest cost after resale (not just the lowest price).
 */
export function suggestProducts({ products, inventoryProducts, prefs, room }) {
  const { roomType, theme, tone, budget, includeUsed, tenancyMonths } = prefs;
  const alloc = ALLOCATION[roomType] || {};
  const spentByEnv = {};
  let total = 0;
  const haveCount = {};
  for (const p of inventoryProducts) {
    const env = ENVELOPE_OF[p.category] || 'finishing';
    spentByEnv[env] = (spentByEnv[env] || 0) + p.price;
    total += p.price;
    haveCount[p.category] = (haveCount[p.category] || 0) + 1;
  }

  const score = (p) => (p.styles.includes(theme) ? 2 : 0) + (tone !== 'any' && p.tone === tone ? 1 : 0);
  const picks = [];

  for (const [cat, count] of RECIPES[roomType] || []) {
    const need = count - (haveCount[cat] || 0);
    if (need <= 0) continue;
    const candidates = products.filter(
      (p) => p.category === cat && p.rooms.includes(roomType) &&
        (includeUsed || p.condition !== 'used') && (!room || fitsRoom(p, room)),
    );
    if (!candidates.length) continue;

    const env = ENVELOPE_OF[cat] || 'finishing';
    const envBudget = budget * (alloc[env] || 0);
    const affordable = candidates.filter(
      (p) => (spentByEnv[env] || 0) + p.price * need <= envBudget && total + p.price * need <= budget,
    );
    // Essentials may borrow from other envelopes, as long as the total budget holds.
    const essentialFallback = candidates.filter(
      (p) => p.priority === 'essential' && total + p.price * need <= budget,
    );
    const pool = affordable.length ? affordable : essentialFallback;
    if (!pool.length) continue;

    pool.sort((a, b) => score(b) - score(a) || netCost(a, tenancyMonths) - netCost(b, tenancyMonths));
    const pick = pool[0];
    for (let i = 0; i < need; i++) picks.push(pick.id);
    spentByEnv[env] = (spentByEnv[env] || 0) + pick.price * need;
    total += pick.price * need;
  }
  return picks;
}
