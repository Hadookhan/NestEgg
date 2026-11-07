import { create } from 'zustand';
import * as G from './lib/geometry.js';
import { suggestProducts } from './lib/suggest.js';
import { gbp } from './lib/finance.js';

let counter = 0;
const newUid = () => `i${Date.now().toString(36)}${(counter++).toString(36)}`;

export const HOTBAR_SIZE = 9;

export const useStore = create((set, get) => ({
  sessionId: null,
  room: null,
  products: [],
  productById: {},
  inventory: [], // [{ uid, productId }] - first 9 are the hotbar
  placed: [], // [{ uid, x, z, rot }]
  selectedUid: null,
  armedUid: null, // hotbar item waiting for a click on the floor
  blockedUid: null, // flashes red when a move is refused
  dragging: false,
  view: 'plan', // 'plan' | 'stand'
  heatmap: false,
  gyro: false,
  panel: null, // 'inventory' | 'find' | 'plan' | 'room'
  toast: null,
  prefs: {
    roomType: 'bedroom', theme: 'scandi', tone: 'any', budget: 600, tenancyMonths: 12, includeUsed: true,
  },
  money: { savings: 400, income: 1150, fixed: 850, paydayDay: 25, buffer: 150 },

  // ---------- helpers ----------
  productOf: (uid) => {
    const { inventory, productById } = get();
    const entry = inventory.find((i) => i.uid === uid);
    return entry ? productById[entry.productId] : null;
  },
  placedWithProducts: () => {
    const { placed, productOf } = get();
    return placed.map((pl) => ({ ...pl, product: productOf(pl.uid) })).filter((pl) => pl.product);
  },
  notify: (msg) => set({ toast: { msg, id: Date.now() } }),

  // ---------- setup ----------
  setSession: (sessionId) => set({ sessionId }),
  setProducts: (list) => set({ products: list, productById: Object.fromEntries(list.map((p) => [p.id, p])) }),
  addProduct: (p) => {
    const products = [...get().products.filter((q) => q.id !== p.id), p];
    get().setProducts(products);
  },
  setRoom: (room) => {
    // Keep items that still fit the new room; return the rest to the inventory.
    const others = [];
    const kept = [];
    for (const pl of get().placedWithProducts()) {
      if (G.canPlace(pl.product, pl.x, pl.z, pl.rot, room, others)) {
        kept.push({ uid: pl.uid, x: pl.x, z: pl.z, rot: pl.rot });
        others.push({ ...pl, rect: G.rectAt(pl.product, pl.x, pl.z, pl.rot) });
      }
    }
    set({ room, placed: kept });
  },
  restore: (state) => {
    if (!state) return;
    set({
      inventory: state.inventory || [],
      placed: state.placed || [],
      prefs: { ...get().prefs, ...(state.prefs || {}) },
      money: { ...get().money, ...(state.money || {}) },
    });
  },
  snapshot: () => {
    const { inventory, placed, prefs, money } = get();
    return { inventory, placed, prefs, money };
  },

  setPref: (key, value) => set({ prefs: { ...get().prefs, [key]: value } }),
  setMoney: (key, value) => set({ money: { ...get().money, [key]: value } }),
  setView: (view) => set({ view, selectedUid: view === 'stand' ? null : get().selectedUid, armedUid: null }),
  toggleHeatmap: () => set({ heatmap: !get().heatmap }),
  setGyro: (gyro) => set({ gyro }),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
  setDragging: (dragging) => set({ dragging }),
  select: (uid) => set({ selectedUid: uid, armedUid: null }),
  arm: (uid) => set({ armedUid: get().armedUid === uid ? null : uid, selectedUid: null }),

  // ---------- inventory ----------
  addToInventory: (productId, { silent = false } = {}) => {
    const uid = newUid();
    set({ inventory: [...get().inventory, { uid, productId }] });
    if (!silent) get().notify(`Added ${get().productById[productId]?.name ?? 'item'} to your inventory`);
    return uid;
  },
  removeFromInventory: (uid) => set({
    inventory: get().inventory.filter((i) => i.uid !== uid),
    placed: get().placed.filter((p) => p.uid !== uid),
    selectedUid: get().selectedUid === uid ? null : get().selectedUid,
    armedUid: get().armedUid === uid ? null : get().armedUid,
  }),
  moveToHotbar: (uid) => {
    const inv = get().inventory;
    const entry = inv.find((i) => i.uid === uid);
    if (!entry) return;
    set({ inventory: [entry, ...inv.filter((i) => i.uid !== uid)] });
  },

  // ---------- room placement ----------
  placeAt: (uid, x, z) => {
    const { room, productOf, placedWithProducts } = get();
    const p = productOf(uid);
    if (!room || !p) return false;
    const others = G.rectsOf(placedWithProducts(), uid);
    const spot = G.findNearestFree(p, x, z, room, others);
    if (!spot) {
      get().notify(`There's no free space for the ${p.name.toLowerCase()} there`);
      return false;
    }
    set({
      placed: [...get().placed.filter((pl) => pl.uid !== uid), { uid, ...spot }],
      selectedUid: uid,
      armedUid: null,
    });
    return true;
  },
  moveItem: (uid, x, z) => {
    const { room, productOf, placed, placedWithProducts } = get();
    const p = productOf(uid);
    const cur = placed.find((pl) => pl.uid === uid);
    if (!p || !cur) return false;
    const c = G.clampCentre(p, G.snap(x), G.snap(z), cur.rot, room);
    if (c.x === cur.x && c.z === cur.z) return true;
    const others = G.rectsOf(placedWithProducts(), uid);
    if (!G.canPlace(p, c.x, c.z, cur.rot, room, others)) {
      if (get().blockedUid !== uid) {
        set({ blockedUid: uid });
        setTimeout(() => get().blockedUid === uid && set({ blockedUid: null }), 350);
      }
      return false;
    }
    set({ placed: placed.map((pl) => (pl.uid === uid ? { ...pl, ...c } : pl)) });
    return true;
  },
  rotate: (uid) => {
    const { room, productOf, placed, placedWithProducts } = get();
    const p = productOf(uid);
    const cur = placed.find((pl) => pl.uid === uid);
    if (!p || !cur) return;
    const rot = (cur.rot + 1) % 4;
    const others = G.rectsOf(placedWithProducts(), uid);
    const c = G.clampCentre(p, cur.x, cur.z, rot, room);
    const spot = G.canPlace(p, c.x, c.z, rot, room, others)
      ? { ...c, rot }
      : G.findNearestFree(p, cur.x, cur.z, room, others, [rot], 60);
    if (!spot) return get().notify('Not enough space to turn it here. Move it somewhere clearer first.');
    set({ placed: placed.map((pl) => (pl.uid === uid ? { ...pl, ...spot } : pl)) });
  },
  unplace: (uid) => set({
    placed: get().placed.filter((pl) => pl.uid !== uid),
    selectedUid: get().selectedUid === uid ? null : get().selectedUid,
  }),
  clearRoom: () => set({ placed: [], selectedUid: null }),

  swapProduct: (uid, newProductId) => {
    const { productById, placed, room, placedWithProducts } = get();
    const oldP = get().productOf(uid);
    const newP = productById[newProductId];
    set({ inventory: get().inventory.map((i) => (i.uid === uid ? { ...i, productId: newProductId } : i)) });
    const cur = placed.find((pl) => pl.uid === uid);
    if (cur) {
      const others = G.rectsOf(placedWithProducts(), uid);
      const c = G.clampCentre(newP, cur.x, cur.z, cur.rot, room);
      if (G.canPlace(newP, c.x, c.z, cur.rot, room, others)) {
        set({ placed: get().placed.map((pl) => (pl.uid === uid ? { ...pl, ...c } : pl)) });
      } else {
        get().unplace(uid);
      }
    }
    if (oldP) get().notify(`Swapped in the ${newP.name.toLowerCase()} and saved ${gbp(oldP.price - newP.price)}`);
  },

  suggest: () => {
    const { products, inventory, productById, prefs, room } = get();
    const inventoryProducts = inventory.map((i) => productById[i.productId]).filter(Boolean);
    const ids = suggestProducts({ products, inventoryProducts, prefs, room });
    if (!ids.length) {
      get().notify('Nothing more to suggest within this budget. Raise the budget or allow second-hand.');
      return;
    }
    ids.forEach((id) => get().addToInventory(id, { silent: true }));
    const total = ids.reduce((s, id) => s + productById[id].price, 0);
    get().notify(`Added ${ids.length} suggested items (${gbp(total)}). Use Suggest place to lay them out.`);
  },

  autoPlaceAll: () => {
    const { room, inventory, placed, productOf, placedWithProducts } = get();
    if (!room) return;
    const placedIds = new Set(placed.map((p) => p.uid));
    const toPlace = inventory
      .filter((i) => !placedIds.has(i.uid))
      .map((i) => ({ uid: i.uid, product: productOf(i.uid) }))
      .filter((i) => i.product);
    if (!toPlace.length) {
      get().notify('Everything in your inventory is already in the room.');
      return;
    }
    const { added, failed } = G.autoPlace(toPlace, placedWithProducts(), room);
    set({ placed: [...placed, ...added.map(({ uid, x, z, rot }) => ({ uid, x, z, rot }))], selectedUid: null });
    get().notify(
      failed.length
        ? `Placed ${added.length} items. ${failed.length} didn't fit: ${failed.map((f) => f.product.name.toLowerCase()).join(', ')}.`
        : `Placed ${added.length} items.`,
    );
  },
}));
