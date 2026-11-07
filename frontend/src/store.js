import { create } from 'zustand';
import * as G from './lib/geometry.js';
import { customPreset, suggestProducts } from './lib/suggest.js';
import { defaultHeight, isMounted } from './lib/furniture.js';
import { gbp } from './lib/finance.js';

let counter = 0;
const newUid = () => `i${Date.now().toString(36)}${(counter++).toString(36)}`;

export const HOTBAR_SIZE = 9;

export const useStore = create((set, get) => ({
  sessionId: null,
  room: null,
  products: [],
  productById: {},
  inventory: [], // items not yet in the room: [{ uid, productId }]. The first 9 are the hotbar.
  placed: [], // items in the room: [{ uid, productId, x, z, rot, y }] (y = cm off the floor)
  binned: null, // last binned item, for undo
  selectedUid: null,
  armedUid: null, // hotbar item waiting for a click on the floor
  blockedUid: null, // flashes red when a move is refused
  dragging: false,
  overBin: false, // a room item is being dragged over the bin
  view: 'plan', // 'plan' | 'stand'
  heatmap: false,
  gyro: false,
  panel: null, // 'inventory' | 'find' | 'plan' | 'room'
  toast: null,
  prefs: {
    roomType: 'bedroom', theme: 'scandi', tone: 'any', budget: 600, tenancyMonths: 12, includeUsed: true,
    custom: {}, // custom room: { [category]: { on, count, budget } }
  },
  clearedRoom: null, // for undoing Clear room
  money: { savings: 400, income: 1150, fixed: 850, paydayDay: 25, buffer: 150 },

  // ---------- helpers ----------
  productOf: (uid) => {
    const { inventory, placed, productById } = get();
    const entry = placed.find((p) => p.uid === uid) || inventory.find((i) => i.uid === uid);
    return entry ? productById[entry.productId] : null;
  },
  placedWithProducts: () => {
    const { placed, productById } = get();
    return placed.map((pl) => ({ ...pl, product: productById[pl.productId] })).filter((pl) => pl.product);
  },
  /** Everything the user has picked: in the room and still in the inventory. */
  allItems: () => {
    const { placed, inventory, productById } = get();
    return [...placed, ...inventory]
      .map((e) => ({ uid: e.uid, product: productById[e.productId] }))
      .filter((e) => e.product);
  },
  notify: (msg, action = null) => set({ toast: { msg, action, id: Date.now() } }),

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
    const returned = [];
    for (const pl of get().placedWithProducts()) {
      if (G.canPlace(pl.product, pl.x, pl.z, pl.rot, room, others, pl.y || 0)) {
        kept.push({ uid: pl.uid, productId: pl.productId, x: pl.x, z: pl.z, rot: pl.rot, y: pl.y || 0 });
        others.push({ ...pl, rect: G.rectAt(pl.product, pl.x, pl.z, pl.rot) });
      } else {
        returned.push({ uid: pl.uid, productId: pl.productId });
      }
    }
    set({ room, placed: kept, inventory: [...returned, ...get().inventory] });
  },
  restore: (state) => {
    if (!state) return;
    let inventory = state.inventory || [];
    let placed = state.placed || [];
    // Older saves kept placed items in the inventory too; move them out.
    const byUid = Object.fromEntries(inventory.map((i) => [i.uid, i.productId]));
    placed = placed.map((p) => ({ ...p, productId: p.productId || byUid[p.uid] })).filter((p) => p.productId);
    const placedUids = new Set(placed.map((p) => p.uid));
    inventory = inventory.filter((i) => !placedUids.has(i.uid));
    set({
      inventory,
      placed,
      prefs: { ...get().prefs, ...(state.prefs || {}) },
      money: { ...get().money, ...(state.money || {}) },
    });
  },
  snapshot: () => {
    const { inventory, placed, prefs, money } = get();
    return { inventory, placed, prefs, money };
  },

  setPref: (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    // Switching to a custom room for the first time: start from the previous room type's items.
    if (key === 'roomType' && value === 'custom' && !Object.keys(prefs.custom || {}).length) {
      prefs.custom = customPreset(get().prefs.roomType, get().products);
      set({ prefs, panel: 'custom' });
      return;
    }
    set({ prefs });
  },
  setCustom: (custom) => set({ prefs: { ...get().prefs, custom } }),
  setMoney: (key, value) => set({ money: { ...get().money, [key]: value } }),
  setView: (view) => set({ view, selectedUid: view === 'stand' ? null : get().selectedUid, armedUid: null }),
  toggleHeatmap: () => set({ heatmap: !get().heatmap }),
  setGyro: (gyro) => set({ gyro }),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
  setDragging: (dragging) => set({ dragging, overBin: dragging ? get().overBin : false }),
  setOverBin: (overBin) => get().overBin !== overBin && set({ overBin }),
  select: (uid) => set({ selectedUid: uid, armedUid: null }),
  arm: (uid) => set({ armedUid: get().armedUid === uid ? null : uid, selectedUid: null }),

  // ---------- inventory and bin ----------
  addToInventory: (productId, { silent = false } = {}) => {
    const uid = newUid();
    set({ inventory: [...get().inventory, { uid, productId }] });
    if (!silent) get().notify(`Added ${get().productById[productId]?.name ?? 'item'} to your inventory`);
    return uid;
  },
  moveToHotbar: (uid) => {
    const inv = get().inventory;
    const entry = inv.find((i) => i.uid === uid);
    if (!entry) return;
    set({ inventory: [entry, ...inv.filter((i) => i.uid !== uid)] });
  },
  bin: (uid) => {
    const { inventory, placed } = get();
    const invIndex = inventory.findIndex((i) => i.uid === uid);
    const pl = placed.find((p) => p.uid === uid);
    if (invIndex === -1 && !pl) return;
    const p = get().productOf(uid);
    set({
      binned: pl ? { from: 'room', entry: pl } : { from: 'inventory', entry: inventory[invIndex], index: invIndex },
      inventory: inventory.filter((i) => i.uid !== uid),
      placed: placed.filter((x) => x.uid !== uid),
      selectedUid: get().selectedUid === uid ? null : get().selectedUid,
      armedUid: get().armedUid === uid ? null : get().armedUid,
      overBin: false,
    });
    get().notify(`Binned ${p?.name ?? 'item'}`, { label: 'Undo', run: () => get().undoBin() });
  },
  undoBin: () => {
    const b = get().binned;
    if (!b) return;
    if (b.from === 'room') {
      // Put it back where it was if that spot is still free; otherwise back in the inventory.
      const p = get().productById[b.entry.productId];
      const others = G.rectsOf(get().placedWithProducts());
      if (p && get().room && G.canPlace(p, b.entry.x, b.entry.z, b.entry.rot, get().room, others, b.entry.y || 0)) {
        set({ placed: [...get().placed, b.entry] });
      } else {
        set({ inventory: [{ uid: b.entry.uid, productId: b.entry.productId }, ...get().inventory] });
      }
    } else {
      const inv = [...get().inventory];
      inv.splice(Math.min(b.index, inv.length), 0, b.entry);
      set({ inventory: inv });
    }
    set({ binned: null, toast: null });
  },

  // ---------- room placement ----------
  /** Move an inventory item into the room near (x, z). It leaves the inventory. */
  placeAt: (uid, x, z) => {
    const { room, inventory, productById, placedWithProducts } = get();
    const entry = inventory.find((i) => i.uid === uid);
    const p = entry && productById[entry.productId];
    if (!room || !p) return false;
    const spot = G.findNearestFree(p, x, z, room, G.rectsOf(placedWithProducts()), undefined, undefined, defaultHeight(p));
    if (!spot) {
      get().notify(`There's no free space for the ${p.name.toLowerCase()} there`);
      return false;
    }
    set({
      inventory: inventory.filter((i) => i.uid !== uid),
      placed: [...get().placed, { uid, productId: entry.productId, ...spot }],
      selectedUid: uid,
      armedUid: null,
    });
    return true;
  },
  moveItem: (uid, x, z) => {
    const { room, placed, productById, placedWithProducts } = get();
    const cur = placed.find((pl) => pl.uid === uid);
    const p = cur && productById[cur.productId];
    if (!p) return false;
    // Wall items slide along the walls and turn to face the room; floor items keep their rotation.
    const c = isMounted(p)
      ? G.wallSnap(p, x, z, room)
      : { ...G.clampCentre(p, G.snap(x), G.snap(z), cur.rot, room), rot: cur.rot };
    if (c.x === cur.x && c.z === cur.z && c.rot === cur.rot) return true;
    const others = G.rectsOf(placedWithProducts(), uid);
    if (!G.canPlace(p, c.x, c.z, c.rot, room, others, cur.y || 0)) {
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
    const { room, placed, productById, placedWithProducts } = get();
    const cur = placed.find((pl) => pl.uid === uid);
    const p = cur && productById[cur.productId];
    if (!p) return;
    if (isMounted(p)) return get().notify('Wall items face the room automatically. Drag it to another wall to turn it.');
    const rot = (cur.rot + 1) % 4;
    const others = G.rectsOf(placedWithProducts(), uid);
    const c = G.clampCentre(p, cur.x, cur.z, rot, room);
    const spot = G.canPlace(p, c.x, c.z, rot, room, others)
      ? { ...c, rot }
      : G.findNearestFree(p, cur.x, cur.z, room, others, [rot], 60);
    if (!spot) return get().notify('Not enough space to turn it here. Move it somewhere clearer first.');
    set({ placed: placed.map((pl) => (pl.uid === uid ? { ...pl, ...spot } : pl)) });
  },
  /** Raise or lower a wall-mounted item. Returns false if something is in the way. */
  setHeight: (uid, y) => {
    const { room, placed, productById, placedWithProducts } = get();
    const cur = placed.find((pl) => pl.uid === uid);
    const p = cur && productById[cur.productId];
    if (!p || !isMounted(p)) return false;
    const ny = Math.min(Math.max(0, Math.round(y)), (room.height || 240) - p.h);
    if (ny === (cur.y || 0)) return true;
    const others = G.rectsOf(placedWithProducts(), uid);
    if (!G.canPlace(p, cur.x, cur.z, cur.rot, room, others, ny)) {
      if (get().blockedUid !== uid) {
        set({ blockedUid: uid });
        setTimeout(() => get().blockedUid === uid && set({ blockedUid: null }), 350);
      }
      return false;
    }
    set({ placed: placed.map((pl) => (pl.uid === uid ? { ...pl, y: ny } : pl)) });
    return true;
  },
  nudgeHeight: (uid, dy) => {
    const cur = get().placed.find((pl) => pl.uid === uid);
    if (cur) get().setHeight(uid, (cur.y || 0) + dy);
  },

  /** Take an item out of the room and put it back at the front of the inventory. */
  unplace: (uid) => {
    const pl = get().placed.find((p) => p.uid === uid);
    if (!pl) return;
    set({
      placed: get().placed.filter((p) => p.uid !== uid),
      inventory: [{ uid, productId: pl.productId }, ...get().inventory],
      selectedUid: get().selectedUid === uid ? null : get().selectedUid,
    });
  },
  /** Move every item in the room back to the inventory (with undo). */
  clearRoom: () => {
    const { placed, inventory } = get();
    if (!placed.length) return get().notify('The room is already empty.');
    set({
      clearedRoom: { placed, inventory },
      inventory: [...placed.map(({ uid, productId }) => ({ uid, productId })), ...inventory],
      placed: [],
      selectedUid: null,
      armedUid: null,
    });
    get().notify(`Moved ${placed.length} items back to your inventory`, { label: 'Undo', run: () => get().undoClear() });
  },
  undoClear: () => {
    const c = get().clearedRoom;
    if (!c) return;
    set({ placed: c.placed, inventory: c.inventory, clearedRoom: null, toast: null });
  },

  swapProduct: (uid, newProductId) => {
    const { productById, room, placedWithProducts } = get();
    const oldP = get().productOf(uid);
    const newP = productById[newProductId];
    set({ inventory: get().inventory.map((i) => (i.uid === uid ? { ...i, productId: newProductId } : i)) });
    const cur = get().placed.find((pl) => pl.uid === uid);
    if (cur) {
      const others = G.rectsOf(placedWithProducts(), uid);
      const c = G.clampCentre(newP, cur.x, cur.z, cur.rot, room);
      if (G.canPlace(newP, c.x, c.z, cur.rot, room, others, cur.y || 0)) {
        set({ placed: get().placed.map((pl) => (pl.uid === uid ? { ...pl, ...c, productId: newProductId } : pl)) });
      } else {
        set({ placed: get().placed.map((pl) => (pl.uid === uid ? { ...pl, productId: newProductId } : pl)) });
        get().unplace(uid);
      }
    }
    if (oldP) get().notify(`Swapped in the ${newP.name.toLowerCase()} and saved ${gbp(oldP.price - newP.price)}`);
  },

  suggest: () => {
    const { products, prefs, room, productById } = get();
    const inventoryProducts = get().allItems().map((i) => i.product);
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
    const { room, inventory, productById, placedWithProducts } = get();
    if (!room) return;
    const toPlace = inventory
      .map((i) => ({ uid: i.uid, productId: i.productId, product: productById[i.productId] }))
      .filter((i) => i.product);
    if (!toPlace.length) {
      get().notify('Your inventory is empty, so there is nothing to place.');
      return;
    }
    const { added, failed, squeezed } = G.autoPlace(toPlace, placedWithProducts(), room);
    const addedUids = new Set(added.map((a) => a.uid));
    set({
      placed: [...get().placed, ...added.map(({ uid, productId, x, z, rot, y }) => ({ uid, productId, x, z, rot, y: y || 0 }))],
      inventory: inventory.filter((i) => !addedUids.has(i.uid)),
      selectedUid: null,
    });
    const parts = [`Placed ${added.length} items.`];
    if (squeezed) parts.push(`${squeezed} had to go where doors or walkways are tight; select them to see.`);
    if (failed.length) parts.push(`${failed.length} didn't fit and stayed in your inventory: ${failed.map((f) => f.product.name.toLowerCase()).join(', ')}.`);
    get().notify(parts.join(' '));
  },
}));
