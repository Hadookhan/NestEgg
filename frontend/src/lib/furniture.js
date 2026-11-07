// How each kind of furniture behaves in a room. These rules drive "Suggest place",
// the clearance warnings, and the open-doors preview on the selected item.
//
// place:   'wall'   back against a wall
//          'centre' in the open middle of the room
//          'free'   anywhere sensible (corner first)
// align:   where along a wall to prefer: 'centre' | 'corner' | 'door'
// near:    [{ to: [categories], how }] tried in order before the general rule
//          how = 'beside'   flush on the same wall, next to it
//                'facing'   in front of it, turned to face it (chair at desk)
//                'around'   on any side, facing it (chairs round a table)
//                'sides'    at its left/right, facing it (armchair by coffee table)
//                'front'    in front of it with a gap (coffee table and sofa)
//                'opposite' on the opposite wall, facing it (TV and sofa)
// opens:   'doors' | 'drawers'  (needs space in front to open)
// front:   extra cm to keep clear in front (walking, sitting, reaching)
// around:  cm to keep clear on every side (pulling chairs out)

export const RULES = {
  bed: { place: 'wall', align: 'centre', front: 60, why: 'Room to walk round the foot of the bed' },
  wardrobe: { place: 'wall', align: 'corner', opens: 'doors', near: [{ to: ['drawers', 'mirror'], how: 'beside' }] },
  drawers: { place: 'wall', align: 'corner', opens: 'drawers', near: [{ to: ['wardrobe'], how: 'beside' }] },
  bedside: { place: 'wall', near: [{ to: ['bed'], how: 'beside' }] },
  mirror: { place: 'wall', near: [{ to: ['wardrobe', 'drawers'], how: 'beside' }] },
  floor_lamp: { place: 'free', near: [{ to: ['sofa', 'armchair', 'desk', 'bed'], how: 'beside' }] },
  sofa: { place: 'wall', align: 'centre', front: 50, why: 'Legroom in front of the sofa' },
  armchair: { place: 'free', front: 40, near: [{ to: ['coffee_table'], how: 'sides' }, { to: ['sofa'], how: 'beside' }] },
  coffee_table: { place: 'centre', near: [{ to: ['sofa'], how: 'front' }] },
  tv_stand: { place: 'wall', align: 'centre', opens: 'doors', near: [{ to: ['sofa'], how: 'opposite' }] },
  bookshelf: { place: 'wall', align: 'corner', front: 50, why: 'Space to stand and reach the shelves', near: [{ to: ['desk'], how: 'beside' }] },
  desk: { place: 'wall', align: 'corner', front: 75, why: 'Space to pull the chair out' },
  office_chair: { place: 'free', near: [{ to: ['desk'], how: 'facing' }] },
  filing_cabinet: { place: 'wall', opens: 'drawers', near: [{ to: ['desk'], how: 'beside' }] },
  dining_table: { place: 'centre', around: 75, why: 'Space to pull chairs out all round' },
  dining_chair: { place: 'free', near: [{ to: ['dining_table'], how: 'around' }] },
  sideboard: { place: 'wall', align: 'centre', opens: 'doors' },
  bath_cabinet: { place: 'wall', align: 'corner', opens: 'doors' },
  bath_shelf: { place: 'wall', front: 40, why: 'Space to reach the shelves' },
  towel_stand: { place: 'wall', front: 30 },
  hamper: { place: 'free', near: [{ to: ['wardrobe', 'bath_cabinet'], how: 'beside' }] },
  stool: { place: 'free' },
  shoe_rack: { place: 'wall', align: 'door', front: 30, why: 'Shoes come off by the door' },
};

export const ruleOf = (p) => RULES[p.category] || { place: 'free' };

/** Number of doors on a cabinet: roughly one per 60 cm of width. */
export const doorCount = (p) => Math.max(1, Math.ceil(p.w / 60));

/**
 * Space to keep clear, in cm. Doors need their own width to swing open;
 * drawers need most of their depth to pull out, plus room to stand.
 */
export function clearanceOf(p) {
  const r = ruleOf(p);
  let front = r.front || 0;
  let why = r.why || null;
  if (r.opens === 'doors') {
    const doorWidth = p.w / doorCount(p);
    front = Math.max(front, Math.round(doorWidth + 10));
    why = `${doorCount(p) > 1 ? 'Doors swing' : 'The door swings'} open about ${Math.round(doorWidth)} cm`;
  } else if (r.opens === 'drawers') {
    front = Math.max(front, Math.round(p.d * 0.75 + 30));
    why = `Drawers pull out about ${Math.round(p.d * 0.75)} cm, plus room to stand`;
  }
  return { front, around: r.around || 0, why };
}

/** True when one item is meant to sit in the other's clear space (a chair at a desk). */
export function arePartners(a, b) {
  const nearA = (ruleOf(a).near || []).flatMap((n) => n.to);
  const nearB = (ruleOf(b).near || []).flatMap((n) => n.to);
  return nearA.includes(b.category) || nearB.includes(a.category);
}
