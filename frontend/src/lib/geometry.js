// All room and furniture measurements are in centimetres.
// Room: x runs 0..width (west to east), z runs 0..depth (north to south).
// A placed item is { uid, x, z, rot } where x/z is the footprint centre and
// rot (0-3) says which wall the item's back faces: 0 north, 1 west, 2 south, 3 east.
// y is the height of the item's underside off the floor (0 for floor furniture;
// wall-mounted items like TVs and pictures can be raised and lowered).

import { ABOVE_FLOOR_SPACE, arePartners, clearanceOf, defaultHeight, isMounted, ruleOf } from './furniture.js';

export const GRID = 50; // visible tiles
export const SNAP = 10; // drag snapping
export const DOOR_DEPTH = 90; // keep-clear zone inside the door

export const snap = (v) => Math.round(v / SNAP) * SNAP;

export function footprint(p, rot) {
  return rot % 2 === 0 ? { w: p.w, d: p.d } : { w: p.d, d: p.w };
}

export function rectAt(p, x, z, rot) {
  const f = footprint(p, rot);
  return { x1: x - f.w / 2, x2: x + f.w / 2, z1: z - f.d / 2, z2: z + f.d / 2 };
}

const EPS = 0.01;
export function overlaps(a, b, pad = 0) {
  return a.x1 < b.x2 + pad - EPS && a.x2 + pad > b.x1 + EPS && a.z1 < b.z2 + pad - EPS && a.z2 + pad > b.z1 + EPS;
}

export function inside(r, room) {
  return r.x1 >= -EPS && r.z1 >= -EPS && r.x2 <= room.width + EPS && r.z2 <= room.depth + EPS;
}

export function doorRect(room) {
  const d = room.door;
  if (!d) return null;
  const w = d.width || 80;
  const o = d.offset;
  switch (d.wall) {
    case 'north': return { x1: o - w / 2, x2: o + w / 2, z1: 0, z2: DOOR_DEPTH };
    case 'south': return { x1: o - w / 2, x2: o + w / 2, z1: room.depth - DOOR_DEPTH, z2: room.depth };
    case 'west': return { x1: 0, x2: DOOR_DEPTH, z1: o - w / 2, z2: o + w / 2 };
    case 'east': return { x1: room.width - DOOR_DEPTH, x2: room.width, z1: o - w / 2, z2: o + w / 2 };
    default: return null;
  }
}

/** Rects of placed items, as [{ uid, rect, product, x, z, rot }]. */
export function rectsOf(placedWithProducts, exceptUid) {
  return placedWithProducts
    .filter((pl) => pl.uid !== exceptUid)
    .map((pl) => ({ ...pl, rect: rectAt(pl.product, pl.x, pl.z, pl.rot) }));
}

const DOOR_HEIGHT = 210;
const yOf = (o) => o.y || 0;

/** Two height ranges overlap (touching is fine: a TV can rest on a stand). */
const verticalOverlap = (y1, h1, y2, h2) => y1 < y2 + h2 - EPS && y2 < y1 + h1 - EPS;

function flushToWall(r, rot, room) {
  if (rot === 0) return Math.abs(r.z1) < 1;
  if (rot === 1) return Math.abs(r.x1) < 1;
  if (rot === 2) return Math.abs(r.z2 - room.depth) < 1;
  return Math.abs(r.x2 - room.width) < 1;
}

const WALL_OF_ROT = ['north', 'west', 'south', 'east'];

/** A wall item can't hang across the door opening. */
function inDoorway(r, rot, y, room) {
  const d = room.door;
  if (!d || WALL_OF_ROT[rot] !== d.wall || y >= DOOR_HEIGHT) return false;
  const half = (d.width || 80) / 2;
  const [a1, a2] = rot % 2 === 0 ? [r.x1, r.x2] : [r.z1, r.z2];
  return a1 < d.offset + half && a2 > d.offset - half;
}

export function canPlace(p, x, z, rot, room, others, y = 0) {
  const r = rectAt(p, x, z, rot);
  if (!inside(r, room)) return false;
  if (y < -EPS || y + p.h > (room.height || 240) + EPS) return false;
  if (isMounted(p)) {
    if (!flushToWall(r, rot, room) || inDoorway(r, rot, y, room)) return false;
  } else {
    const dr = doorRect(room);
    if (dr && overlaps(r, dr)) return false;
  }
  return !others.some((o) => overlaps(r, o.rect) && verticalOverlap(y, p.h, yOf(o), o.product.h));
}

/** Snap a wall item to the wall nearest (x, z), facing into the room. */
export function wallSnap(p, x, z, room) {
  const d = [z, x, room.depth - z, room.width - x]; // distance to north, west, south, east
  const rot = d.indexOf(Math.min(...d));
  const f = footprint(p, rot);
  const along = (v, len, half) => Math.min(Math.max(snap(v), half), len - half);
  if (rot === 0) return { x: along(x, room.width, f.w / 2), z: f.d / 2, rot };
  if (rot === 2) return { x: along(x, room.width, f.w / 2), z: room.depth - f.d / 2, rot };
  if (rot === 1) return { x: f.w / 2, z: along(z, room.depth, f.d / 2), rot };
  return { x: room.width - f.w / 2, z: along(z, room.depth, f.d / 2), rot };
}

export function clampCentre(p, x, z, rot, room) {
  const f = footprint(p, rot);
  return {
    x: Math.min(Math.max(x, f.w / 2), room.width - f.w / 2),
    z: Math.min(Math.max(z, f.d / 2), room.depth - f.d / 2),
  };
}

export function fitsRoom(p, room) {
  const a = Math.min(p.w, p.d), b = Math.max(p.w, p.d);
  return a <= Math.min(room.width, room.depth) && b <= Math.max(room.width, room.depth);
}

/** Search outward from (x, z) for the nearest valid spot. */
export function findNearestFree(p, x, z, room, others, rots = [0, 1, 2, 3], maxR = 150, y = null) {
  if (isMounted(p)) {
    const h = y ?? defaultHeight(p);
    const cands = wallCandidates(p, room, 'corner')
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const c of cands) if (canPlace(p, c.x, c.z, c.rot, room, others, h)) return { ...c, y: h };
    return null;
  }
  for (let r = 0; r <= maxR; r += SNAP) {
    for (let dx = -r; dx <= r; dx += SNAP) {
      for (let dz = -r; dz <= r; dz += SNAP) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const rot of rots) {
          const c = clampCentre(p, snap(x + dx), snap(z + dz), rot, room);
          if (canPlace(p, c.x, c.z, rot, room, others)) return { x: c.x, z: c.z, rot, y: 0 };
        }
      }
    }
  }
  return null;
}

// ---------- clear space (doors opening, chairs pulling out, legroom) ----------

// Direction an item's back faces, per rot; its front faces the opposite way.
const BACK = [[0, -1], [-1, 0], [0, 1], [1, 0]];
const rotWithBack = (dx, dz) => BACK.findIndex(([bx, bz]) => bx === dx && bz === dz);
const frontDir = (rot) => [-BACK[rot][0], -BACK[rot][1]];

function frontStrip(rect, rot, depth) {
  if (rot === 0) return { x1: rect.x1, x2: rect.x2, z1: rect.z2, z2: rect.z2 + depth };
  if (rot === 1) return { x1: rect.x2, x2: rect.x2 + depth, z1: rect.z1, z2: rect.z2 };
  if (rot === 2) return { x1: rect.x1, x2: rect.x2, z1: rect.z1 - depth, z2: rect.z1 };
  return { x1: rect.x1 - depth, x2: rect.x1, z1: rect.z1, z2: rect.z2 };
}

/** Areas an item needs kept clear, as rects (not including the item itself). */
export function zonesOf(p, x, z, rot) {
  const { front, around } = clearanceOf(p);
  const r = rectAt(p, x, z, rot);
  const zones = [];
  if (around > 0) {
    zones.push({ x1: r.x1 - around, x2: r.x2 + around, z1: r.z1 - around, z2: r.z2 + around });
  } else if (front > 0) {
    zones.push(frontStrip(r, rot, front));
  }
  return zones;
}

/**
 * For the clearance warnings: what's sitting in this item's clear space,
 * and whose clear space this item is sitting in. Partners don't count.
 */
export function clearanceConflicts(item, all) {
  const mine = zonesOf(item.product, item.x, item.z, item.rot);
  const myRect = rectAt(item.product, item.x, item.z, item.rot);
  const blockedBy = [];
  const blocking = [];
  const meHigh = yOf(item) >= ABOVE_FLOOR_SPACE;
  for (const o of all) {
    if (o.uid === item.uid || arePartners(item.product, o.product)) continue;
    const oRect = rectAt(o.product, o.x, o.z, o.rot);
    if (yOf(o) < ABOVE_FLOOR_SPACE && mine.some((zr) => overlaps(zr, oRect))) blockedBy.push(o);
    if (!meHigh && zonesOf(o.product, o.x, o.z, o.rot).some((zr) => overlaps(zr, myRect))) blocking.push(o);
  }
  return { blockedBy, blocking };
}

/** Valid spot that also respects everyone's clear space (unless relaxed). */
function fits(p, c, room, others, relaxed) {
  const y = c.y || 0;
  if (!canPlace(p, c.x, c.z, c.rot, room, others, y)) return false;
  if (relaxed) return true;
  const r = rectAt(p, c.x, c.z, c.rot);
  const mine = zonesOf(p, c.x, c.z, c.rot);
  const high = y >= ABOVE_FLOOR_SPACE;
  for (const o of others) {
    if (arePartners(p, o.product)) continue;
    if (yOf(o) < ABOVE_FLOOR_SPACE && mine.some((zr) => overlaps(zr, o.rect))) return false;
    if (!high && o.zones.some((zr) => overlaps(zr, r))) return false;
  }
  return true;
}

function firstFit(p, cands, room, others, relaxed = false) {
  const baseY = defaultHeight(p);
  for (const c0 of cands) {
    const c = { ...c0, y: c0.y ?? baseY };
    const cc = { ...c, ...clampCentre(p, c.x, c.z, c.rot, room) };
    if (Math.abs(cc.x - c.x) > 1 || Math.abs(cc.z - c.z) > 1) continue; // would have to move off the intended spot
    if (fits(p, cc, room, others, relaxed)) return cc;
  }
  return null;
}

// ---------- candidate spots ----------

function wallCandidates(p, room, align = 'corner') {
  const walls = [0, 2, 1, 3].sort((a, b) => {
    const la = a % 2 === 0 ? room.width : room.depth;
    const lb = b % 2 === 0 ? room.width : room.depth;
    return lb - la;
  });
  const door = doorRect(room);
  const doorMid = door ? { x: (door.x1 + door.x2) / 2, z: (door.z1 + door.z2) / 2 } : null;
  const out = [];
  for (const rot of walls) {
    const f = footprint(p, rot);
    const along = rot % 2 === 0 ? room.width : room.depth;
    const half = rot % 2 === 0 ? f.w / 2 : f.d / 2;
    const ts = [];
    for (let t = half; t <= along - half + EPS; t += SNAP) ts.push(t);
    if (ts.length && ts[ts.length - 1] < along - half - EPS) ts.push(along - half);
    if (align === 'centre') ts.sort((a, b) => Math.abs(a - along / 2) - Math.abs(b - along / 2));
    for (const t of ts) {
      if (rot === 0) out.push({ x: t, z: f.d / 2, rot });
      if (rot === 2) out.push({ x: t, z: room.depth - f.d / 2, rot });
      if (rot === 1) out.push({ x: f.w / 2, z: t, rot });
      if (rot === 3) out.push({ x: room.width - f.w / 2, z: t, rot });
    }
  }
  if (align === 'door' && doorMid) {
    out.sort((a, b) => Math.hypot(a.x - doorMid.x, a.z - doorMid.z) - Math.hypot(b.x - doorMid.x, b.z - doorMid.z));
  }
  return out;
}

function nearCandidates(p, t, how, room, aboveGap = 20) {
  const tf = footprint(t.product, t.rot);
  const r = t.rect;
  const gap = how === 'above' ? aboveGap : 5;
  if (how === 'beside') {
    const k = t.rot;
    const f = footprint(p, k);
    // Flush to the same wall the target backs onto, either side of it.
    if (k === 0) return [{ x: r.x2 + gap + f.w / 2, z: r.z1 + f.d / 2, rot: k }, { x: r.x1 - gap - f.w / 2, z: r.z1 + f.d / 2, rot: k }];
    if (k === 2) return [{ x: r.x2 + gap + f.w / 2, z: r.z2 - f.d / 2, rot: k }, { x: r.x1 - gap - f.w / 2, z: r.z2 - f.d / 2, rot: k }];
    if (k === 1) return [{ x: r.x1 + f.w / 2, z: r.z2 + gap + f.d / 2, rot: k }, { x: r.x1 + f.w / 2, z: r.z1 - gap - f.d / 2, rot: k }];
    return [{ x: r.x2 - f.w / 2, z: r.z2 + gap + f.d / 2, rot: k }, { x: r.x2 - f.w / 2, z: r.z1 - gap - f.d / 2, rot: k }];
  }
  if (how === 'above') {
    // Same wall as the target, centred on it, `gap` cm above its top.
    const k = t.rot;
    const f = footprint(p, k);
    const y = Math.max(defaultHeight(p), yOf(t) + t.product.h + gap);
    if (k === 0) return [{ x: t.x, z: f.d / 2, rot: k, y }];
    if (k === 2) return [{ x: t.x, z: room.depth - f.d / 2, rot: k, y }];
    if (k === 1) return [{ x: f.w / 2, z: t.z, rot: k, y }];
    return [{ x: room.width - f.w / 2, z: t.z, rot: k, y }];
  }
  if (how === 'front') {
    const [dx, dz] = frontDir(t.rot);
    const f = footprint(p, t.rot);
    const off = dx !== 0 ? tf.w / 2 + 45 + f.w / 2 : tf.d / 2 + 45 + f.d / 2;
    return [{ x: t.x + dx * off, z: t.z + dz * off, rot: t.rot }];
  }
  if (how === 'opposite') {
    const rot = (t.rot + 2) % 4;
    // Same position along the room's axis as the target, on the facing wall.
    return wallCandidates(p, room, 'corner')
      .filter((c) => c.rot === rot)
      .sort((a, b) => (rot % 2 === 0 ? Math.abs(a.x - t.x) - Math.abs(b.x - t.x) : Math.abs(a.z - t.z) - Math.abs(b.z - t.z)));
  }
  // Seats that face the target: 'facing' = its front, 'sides' = its left/right, 'around' = all sides.
  let dirs;
  if (how === 'facing') dirs = [frontDir(t.rot)];
  else if (how === 'sides') dirs = t.rot % 2 === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
  else dirs = [[0, 1], [0, -1], [-1, 0], [1, 0]];
  return dirs.map(([dx, dz]) => {
    const rot = rotWithBack(dx, dz);
    const f = footprint(p, rot);
    const off = dx !== 0 ? tf.w / 2 + f.w / 2 + 2 : tf.d / 2 + f.d / 2 + 2;
    return { x: t.x + dx * off, z: t.z + dz * off, rot };
  });
}

function spiral(p, room, rots) {
  const out = [];
  const cx = room.width / 2, cz = room.depth / 2;
  const R = Math.max(room.width, room.depth);
  for (let r = 0; r <= R; r += SNAP) {
    for (let dx = -r; dx <= r; dx += SNAP) {
      for (let dz = -r; dz <= r; dz += SNAP) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const rot of rots) out.push({ x: snap(cx + dx), z: snap(cz + dz), rot });
      }
    }
  }
  return out;
}

// ---------- Suggest place ----------

// Big anchors first, then the things that relate to them.
const ORDER = ['bed', 'sofa', 'dining_table', 'desk', 'wardrobe', 'bath_cabinet', 'sideboard', 'tv_stand',
  'drawers', 'bookshelf', 'coffee_table', 'filing_cabinet', 'bedside', 'office_chair', 'dining_chair',
  'armchair', 'mirror', 'bath_shelf', 'towel_stand', 'shoe_rack', 'hamper', 'floor_lamp', 'stool'];
const orderOf = (cat) => {
  const i = ORDER.indexOf(cat);
  return i === -1 ? ORDER.length : i;
};

function placeOne(p, result, room, onlyRot = null) {
  const base = ruleOf(p);
  const rule = isMounted(p) && base.place !== 'mount' ? { ...base, place: 'mount' } : base;
  const others = result.map((o) => ({ ...o, rect: rectAt(o.product, o.x, o.z, o.rot), zones: zonesOf(o.product, o.x, o.z, o.rot) }));
  // A mount that can't go at its usual height is tried a little higher and lower before giving up.
  const heights = rule.place === 'mount' ? [0, 20, -20, 40] : [0];

  for (const pass of [false, true]) { // strict first, then ignore clear space if the room is tight
    for (const n of rule.near || []) {
      for (const t of others.filter((o) => n.to.includes(o.product.category))) {
        let nc = nearCandidates(p, t, n.how, room, n.gap);
        if (onlyRot !== null) nc = nc.filter((c) => c.rot === onlyRot);
        const c = firstFit(p, nc, room, others, pass);
        if (c) return { ...c, relaxed: pass };
      }
    }
    let cands;
    if (rule.place === 'mount') cands = wallCandidates(p, room, rule.align || 'centre');
    else if (rule.place === 'wall') cands = wallCandidates(p, room, rule.align);
    else if (rule.place === 'centre') cands = spiral(p, room, [0, 1]);
    else cands = [...wallCandidates(p, room, 'corner'), ...spiral(p, room, [0, 1, 2, 3])];
    if (onlyRot !== null) cands = cands.filter((c) => c.rot === onlyRot);
    if (heights.length > 1) cands = heights.flatMap((dh) => cands.map((c) => ({ ...c, y: defaultHeight(p) + dh })));
    const c = firstFit(p, cands, room, others, pass);
    if (c) return { ...c, relaxed: pass };
  }
  return null;
}

function greedy(order, placed, room, anchorRot) {
  const result = [...placed];
  const added = [];
  const failed = [];
  let squeezed = 0;
  order.forEach((item, i) => {
    const pos = fitsRoom(item.product, room)
      ? placeOne(item.product, result, room, i === 0 ? anchorRot : null)
      : null;
    if (pos) {
      const pl = { ...item, x: pos.x, z: pos.z, rot: pos.rot, y: pos.y || 0 };
      result.push(pl);
      added.push(pl);
      if (pos.relaxed) squeezed++;
    } else {
      failed.push(item);
    }
  });
  const conflicts = added.reduce((s, it) => s + clearanceConflicts(it, result).blockedBy.length, 0);
  return { added, failed, squeezed, score: failed.length * 100 + conflicts * 10 + squeezed };
}

/**
 * Place every item in `toPlace` ([{ uid, product }]) around the existing
 * `placed` items ([{ uid, x, z, rot, product }]). Never overlaps anything,
 * and keeps doors, drawers and walkways clear whenever the room allows.
 * The biggest item is tried against each wall, and the layout with the
 * fewest items left out or squeezed wins.
 */
export function autoPlace(toPlace, placed, room) {
  const order = [...toPlace].sort(
    (a, b) => orderOf(a.product.category) - orderOf(b.product.category) || b.product.w * b.product.d - a.product.w * a.product.d,
  );
  let best = greedy(order, placed, room, null);
  if (order.length > 1 && best.score > 0) {
    for (const rot of [0, 1, 2, 3]) {
      const attempt = greedy(order, placed, room, rot);
      if (attempt.score < best.score) best = attempt;
    }
  }
  const { added, failed, squeezed } = best;
  return { added, failed, squeezed };
}
