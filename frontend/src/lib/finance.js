// Money logic. All estimates are deliberately simple and labelled as estimates in the UI.

export const ENVELOPES = [
  { key: 'sleep', label: 'Sleep' },
  { key: 'storage', label: 'Storage' },
  { key: 'seating', label: 'Seating' },
  { key: 'surfaces', label: 'Tables and desks' },
  { key: 'finishing', label: 'Finishing touches' },
];

export const ENVELOPE_OF = {
  bed: 'sleep', bedside: 'sleep',
  wardrobe: 'storage', drawers: 'storage', bookshelf: 'storage', filing_cabinet: 'storage',
  sideboard: 'storage', bath_cabinet: 'storage', bath_shelf: 'storage', hamper: 'storage', shoe_rack: 'storage',
  sofa: 'seating', armchair: 'seating', office_chair: 'seating', dining_chair: 'seating', stool: 'seating',
  desk: 'surfaces', coffee_table: 'surfaces', tv_stand: 'surfaces', dining_table: 'surfaces',
  floor_lamp: 'finishing', mirror: 'finishing', towel_stand: 'finishing',
};

// Share of the total budget each envelope gets, by room type.
export const ALLOCATION = {
  bedroom: { sleep: 0.55, storage: 0.25, seating: 0.05, surfaces: 0.1, finishing: 0.05 },
  living_room: { storage: 0.15, seating: 0.55, surfaces: 0.22, finishing: 0.08 },
  home_office: { storage: 0.15, seating: 0.4, surfaces: 0.38, finishing: 0.07 },
  dining: { storage: 0.1, seating: 0.4, surfaces: 0.45, finishing: 0.05 },
  bathroom: { storage: 0.7, seating: 0.1, finishing: 0.2 },
};

export const ROOM_TYPES = [
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'living_room', label: 'Living room' },
  { key: 'home_office', label: 'Home office' },
  { key: 'dining', label: 'Kitchen diner' },
  { key: 'bathroom', label: 'Bathroom' },
];

export const gbp = (n) =>
  '£' + Math.round(n).toLocaleString('en-GB');

/**
 * Estimated resale value when you move out after `months`.
 * resaleRate is the share of the price you'd get back after about a year.
 */
export function resaleValue(p, months) {
  const r = p.resaleRate ?? 0.25;
  let frac;
  if (months <= 12) frac = r + (1 - r) * 0.35 * (1 - months / 12);
  else frac = r * Math.pow(0.85, (months - 12) / 12);
  if (months / 12 >= (p.lifespanYears || 5)) frac = Math.min(frac, 0.05);
  return Math.round(p.price * frac);
}

export const netCost = (p, months) => p.price - resaleValue(p, months);
export const costPerYear = (p) => p.price / Math.max(1, p.lifespanYears || 5);

export function summarise(products, prefs) {
  const months = prefs.tenancyMonths;
  const alloc = ALLOCATION[prefs.roomType] || {};
  const upfront = products.reduce((s, p) => s + p.price, 0);
  const resale = products.reduce((s, p) => s + resaleValue(p, months), 0);
  const perYear = products.reduce((s, p) => s + costPerYear(p), 0);
  const envelopes = ENVELOPES.map((e) => {
    const spent = products.filter((p) => (ENVELOPE_OF[p.category] || 'finishing') === e.key)
      .reduce((s, p) => s + p.price, 0);
    const budget = prefs.budget * (alloc[e.key] || 0);
    return { ...e, budget, spent, over: spent > budget + 0.5 };
  }).filter((e) => e.budget > 0 || e.spent > 0);
  return { upfront, resale, net: upfront - resale, perYear, envelopes, overBudget: upfront > prefs.budget };
}

/** Cheaper products of the same kind that fit in the same footprint. */
export function cheaperFits(p, all, prefs) {
  return all
    .filter((q) => q.id !== p.id && q.category === p.category && q.price < p.price &&
      q.w <= p.w && q.d <= p.d && (prefs.includeUsed || q.condition !== 'used'))
    .sort((a, b) => netCost(a, prefs.tenancyMonths) - netCost(b, prefs.tenancyMonths))
    .slice(0, 3);
}

function paydayDates(day, count) {
  const now = new Date();
  const dates = [now];
  const dd = Math.min(Math.max(day, 1), 28);
  let d = new Date(now.getFullYear(), now.getMonth(), dd);
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dd);
  for (let i = 0; i < count; i++) {
    dates.push(new Date(d.getFullYear(), d.getMonth() + i, dd));
  }
  return dates;
}

const PRIORITY_ORDER = { essential: 0, soon: 1, later: 2 };

// Within a priority tier, what matters most to actually live in the room.
const NEED_RANK = [
  'bed', 'sofa', 'dining_table', 'bath_cabinet', 'desk', 'office_chair', 'dining_chair',
  'wardrobe', 'drawers', 'bedside', 'coffee_table', 'bookshelf', 'towel_stand', 'bath_shelf',
  'armchair', 'tv_stand', 'sideboard', 'filing_cabinet', 'floor_lamp', 'mirror', 'hamper', 'stool', 'shoe_rack',
];
const needRank = (cat) => {
  const i = NEED_RANK.indexOf(cat);
  return i === -1 ? NEED_RANK.length : i;
};

/**
 * Buy essentials first, then 'soon', then 'later', never letting the balance
 * fall below the safety buffer. Within a tier, the most-needed items go first;
 * anything not yet affordable waits while cheaper items in the same tier go ahead.
 * Each payday adds take-home pay minus rent and bills.
 */
export function planPurchases(items, money, horizon = 12) {
  const tierOf = (it) => PRIORITY_ORDER[it.product.priority] ?? 1;
  const queue = [...items].sort(
    (a, b) => tierOf(a) - tierOf(b) || needRank(a.product.category) - needRank(b.product.category) ||
      a.product.price - b.product.price,
  );
  const dates = paydayDates(Number(money.paydayDay) || 25, horizon);
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const monthly = (Number(money.income) || 0) - (Number(money.fixed) || 0);
  const buffer = Number(money.buffer) || 0;

  let balance = Number(money.savings) || 0;
  const series = [];
  const phases = [];
  let doneIndex = queue.length === 0 ? 0 : null;

  for (let m = 0; m <= horizon; m++) {
    if (m > 0) balance += monthly;
    const bought = [];
    while (queue.length) {
      const tier = tierOf(queue[0]);
      const idx = queue.findIndex((it) => tierOf(it) === tier && balance - it.product.price >= buffer);
      if (idx === -1) break; // finish this tier before starting the next
      const [it] = queue.splice(idx, 1);
      balance -= it.product.price;
      bought.push(it);
    }
    const label = m === 0 ? 'Today' : fmt(dates[m]);
    const spent = bought.reduce((s, it) => s + it.product.price, 0);
    series.push({ label, balance: Math.round(balance), spent: Math.round(spent) });
    if (bought.length) phases.push({ index: m, label, items: bought, spent, balanceAfter: balance });
    if (!queue.length && doneIndex === null) doneIndex = m;
  }

  const shown = doneIndex === null ? series : series.slice(0, Math.max(doneIndex + 3, 4));
  return {
    series: shown,
    phases,
    doneLabel: doneIndex === null ? null : series[doneIndex].label,
    remaining: queue,
    monthly,
    buffer,
  };
}
