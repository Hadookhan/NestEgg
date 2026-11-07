// All room and furniture measurements are in centimetres.
// Room: x runs 0..width (west to east), z runs 0..depth (north to south).
// A placed item is { uid, x, z, rot } where x/z is the footprint centre and
// rot (0-3) says which wall the item's back faces: 0 north, 1 west, 2 south, 3 east.

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

export function canPlace(p, x, z, rot, room, others) {
  const r = rectAt(p, x, z, rot);
  if (!inside(r, room)) return false;
  const dr = doorRect(room);
  if (dr && overlaps(r, dr)) return false;
  return !others.some((o) => overlaps(r, o.rect));
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
export function findNearestFree(p, x, z, room, others, rots = [0, 1, 2, 3], maxR = 150) {
  for (let r = 0; r <= maxR; r += SNAP) {
    for (let dx = -r; dx <= r; dx += SNAP) {
      for (let dz = -r; dz <= r; dz += SNAP) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const rot of rots) {
          const c = clampCentre(p, snap(x + dx), snap(z + dz), rot, room);
          if (canPlace(p, c.x, c.z, rot, room, others)) return { x: c.x, z: c.z, rot };
        }
      }
    }
  }
  return null;
}

// ---------- Suggest place ----------

const WALL_ITEMS = new Set([
  'bed', 'wardrobe', 'drawers', 'mirror', 'sofa', 'tv_stand', 'bookshelf', 'desk',
  'filing_cabinet', 'sideboard', 'bath_cabinet', 'bath_shelf', 'towel_stand', 'shoe_rack',
]);
const CENTRED_ON_WALL = new Set(['bed', 'sofa', 'tv_stand', 'sideboard']);
const CENTRE_ITEMS = new Set(['coffee_table', 'dining_table']);
const NEXT_TO = { bedside: 'bed' };
const CHAIR_FOR = { office_chair: ['desk'], dining_chair: ['dining_table'] };

// Direction an item's back faces, per rot; its front faces the opposite way.
const BACK = [[0, -1], [-1, 0], [0, 1], [1, 0]];
const rotWithBack = (dx, dz) => BACK.findIndex(([bx, bz]) => bx === dx && bz === dz);

function frontRect(rect, rot, depth) {
  const r = { ...rect };
  if (rot === 0) r.z2 += depth;
  if (rot === 1) r.x2 += depth;
  if (rot === 2) r.z1 -= depth;
  if (rot === 3) r.x1 -= depth;
  return r;
}

function wallCandidates(p, room, order) {
  const walls = [0, 2, 1, 3].sort((a, b) => {
    const la = a % 2 === 0 ? room.width : room.depth;
    const lb = b % 2 === 0 ? room.width : room.depth;
    return lb - la;
  });
  const out = [];
  for (const rot of walls) {
    const f = footprint(p, rot);
    const along = rot % 2 === 0 ? room.width : room.depth;
    const half = rot % 2 === 0 ? f.w / 2 : f.d / 2;
    const ts = [];
    for (let t = half; t <= along - half + EPS; t += SNAP) ts.push(t);
    if (ts.length && ts[ts.length - 1] < along - half - EPS) ts.push(along - half);
    if (order === 'centre') ts.sort((a, b) => Math.abs(a - along / 2) - Math.abs(b - along / 2));
    for (const t of ts) {
      if (rot === 0) out.push({ x: t, z: f.d / 2, rot });
      if (rot === 2) out.push({ x: t, z: room.depth - f.d / 2, rot });
      if (rot === 1) out.push({ x: f.w / 2, z: t, rot });
      if (rot === 3) out.push({ x: room.width - f.w / 2, z: t, rot });
    }
  }
  return out;
}

function tryCandidates(p, cands, room, others, clearance = 0) {
  for (const c of cands) {
    if (!canPlace(p, c.x, c.z, c.rot, room, others)) continue;
    if (clearance > 0) {
      const fr = frontRect(rectAt(p, c.x, c.z, c.rot), c.rot, clearance);
      if (others.some((o) => overlaps(fr, o.rect))) continue;
    }
    return c;
  }
  return null;
}

function nextToCandidates(p, target) {
  const k = target.rot;
  const f = footprint(p, k);
  const r = target.rect;
  const gap = 5;
  if (k === 0) return [{ x: r.x1 - gap - f.w / 2, z: f.d / 2, rot: k }, { x: r.x2 + gap + f.w / 2, z: f.d / 2, rot: k }];
  if (k === 2) return [{ x: r.x1 - gap - f.w / 2, z: r.z2 - f.d / 2, rot: k }, { x: r.x2 + gap + f.w / 2, z: r.z2 - f.d / 2, rot: k }];
  if (k === 1) return [{ x: f.w / 2, z: r.z1 - gap - f.d / 2, rot: k }, { x: f.w / 2, z: r.z2 + gap + f.d / 2, rot: k }];
  return [{ x: r.x2 - f.w / 2, z: r.z1 - gap - f.d / 2, rot: k }, { x: r.x2 - f.w / 2, z: r.z2 + gap + f.d / 2, rot: k }];
}

/** Chair positions facing a desk (front only) or a table (all four sides). */
function chairCandidates(p, target) {
  const dirs = CENTRE_ITEMS.has(target.product.category)
    ? [[0, 1], [0, -1], [-1, 0], [1, 0]]
    : [[-BACK[target.rot][0], -BACK[target.rot][1]]];
  const tf = footprint(target.product, target.rot);
  return dirs.map(([dx, dz]) => {
    const rot = rotWithBack(dx, dz);
    const f = footprint(p, rot);
    const off = dx !== 0 ? tf.w / 2 + f.w / 2 + 2 : tf.d / 2 + f.d / 2 + 2;
    return { x: target.x + dx * off, z: target.z + dz * off, rot };
  });
}

function rank(cat) {
  if (WALL_ITEMS.has(cat)) return 0;
  if (CENTRE_ITEMS.has(cat)) return 1;
  if (NEXT_TO[cat]) return 2;
  if (CHAIR_FOR[cat]) return 3;
  return 4;
}

function placeOne(item, result, room) {
  const p = item.product;
  const cat = p.category;
  const others = rectsOf(result);
  const W = room.width, D = room.depth;

  if (NEXT_TO[cat]) {
    for (const t of others.filter((o) => o.product.category === NEXT_TO[cat])) {
      const c = tryCandidates(p, nextToCandidates(p, t), room, others);
      if (c) return c;
    }
  }
  if (CHAIR_FOR[cat]) {
    for (const t of others.filter((o) => CHAIR_FOR[cat].includes(o.product.category))) {
      const c = tryCandidates(p, chairCandidates(p, t), room, others);
      if (c) return c;
    }
  }
  if (cat === 'coffee_table') {
    const sofa = others.find((o) => o.product.category === 'sofa');
    if (sofa) {
      const [bx, bz] = BACK[sofa.rot];
      const sf = footprint(sofa.product, sofa.rot);
      const tf = footprint(p, sofa.rot);
      const off = bx !== 0 ? sf.w / 2 + 45 + tf.w / 2 : sf.d / 2 + 45 + tf.d / 2;
      const c = tryCandidates(p, [{ x: sofa.x - bx * off, z: sofa.z - bz * off, rot: sofa.rot }], room, others);
      if (c) return c;
    }
  }
  if (CENTRE_ITEMS.has(cat)) {
    return findNearestFree(p, W / 2, D / 2, room, others, [0, 1], Math.max(W, D));
  }
  if (WALL_ITEMS.has(cat)) {
    const cands = wallCandidates(p, room, CENTRED_ON_WALL.has(cat) ? 'centre' : 'corner');
    return tryCandidates(p, cands, room, others, 50) || tryCandidates(p, cands, room, others, 0);
  }
  // Free-standing (lamps, armchairs, hampers...): along a wall, else anywhere.
  return (
    tryCandidates(p, wallCandidates(p, room, 'corner'), room, others, 30) ||
    findNearestFree(p, W / 2, D / 2, room, others, [0, 1, 2, 3], Math.max(W, D))
  );
}

/**
 * Place every item in `toPlace` ([{ uid, product }]) around the existing
 * `placed` items ([{ uid, x, z, rot, product }]). Never overlaps anything.
 */
export function autoPlace(toPlace, placed, room) {
  const result = [...placed];
  const added = [];
  const failed = [];
  const order = [...toPlace].sort(
    (a, b) => rank(a.product.category) - rank(b.product.category) || b.product.w * b.product.d - a.product.w * a.product.d,
  );
  for (const item of order) {
    const pos = fitsRoom(item.product, room) ? placeOne(item, result, room) : null;
    if (pos) {
      const pl = { uid: item.uid, x: pos.x, z: pos.z, rot: pos.rot, product: item.product };
      result.push(pl);
      added.push(pl);
    } else {
      failed.push(item);
    }
  }
  return { added, failed };
}
