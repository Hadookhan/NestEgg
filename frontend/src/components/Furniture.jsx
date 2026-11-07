import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { clearanceOf, doorCount, isMounted, ruleOf } from '../lib/furniture.js';
import { clearanceConflicts } from '../lib/geometry.js';

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const HIT = new THREE.Vector3();

function Box({ size, pos, color, opacity = 1 }) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.75} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return '#' + c.getHexString();
}

/** Simple recognisable shapes per category; footprint is always w x d. */
function Shape({ category, W, D, H, color }) {
  const legs = (top, inset = 0.04, t = 0.04) =>
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
      <Box key={i} size={[t, top, t]} pos={[sx * (W / 2 - inset), top / 2, sz * (D / 2 - inset)]} color={shade(color, -0.12)} />
    ));

  switch (category) {
    case 'bed':
      return (
        <>
          <Box size={[W, 0.3, D]} pos={[0, 0.15, 0]} color={color} />
          <Box size={[W - 0.06, 0.18, D - 0.1]} pos={[0, 0.39, 0.03]} color="#F4F3EE" />
          <Box size={[W, H, 0.06]} pos={[0, H / 2, -D / 2 + 0.03]} color={shade(color, -0.06)} />
          <Box size={[W * 0.7, 0.1, 0.32]} pos={[0, 0.53, -D / 2 + 0.26]} color="#FFFFFF" />
        </>
      );
    case 'sofa':
    case 'armchair': {
      const arm = Math.min(0.16, W * 0.12);
      return (
        <>
          <Box size={[W, 0.42, D]} pos={[0, 0.21, 0]} color={color} />
          <Box size={[W, H, 0.2]} pos={[0, H / 2, -D / 2 + 0.1]} color={shade(color, -0.05)} />
          <Box size={[arm, 0.62, D]} pos={[-W / 2 + arm / 2, 0.31, 0]} color={shade(color, -0.08)} />
          <Box size={[arm, 0.62, D]} pos={[W / 2 - arm / 2, 0.31, 0]} color={shade(color, -0.08)} />
        </>
      );
    }
    case 'desk':
    case 'dining_table':
    case 'coffee_table':
    case 'bedside':
      return (
        <>
          <Box size={[W, 0.04, D]} pos={[0, H - 0.02, 0]} color={color} opacity={color === '#CFE3E0' ? 0.6 : 1} />
          {legs(H - 0.04)}
        </>
      );
    case 'office_chair':
    case 'dining_chair':
    case 'stool': {
      const seat = 0.46;
      return (
        <>
          <Box size={[W * 0.85, 0.06, D * 0.85]} pos={[0, seat, 0]} color={color} />
          {category !== 'stool' && (
            <Box size={[W * 0.85, H - seat, 0.05]} pos={[0, seat + (H - seat) / 2, -D / 2 + 0.06]} color={color} />
          )}
          {legs(seat - 0.03, 0.08, 0.035)}
        </>
      );
    }
    case 'floor_lamp':
      return (
        <>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[W / 2.2, W / 2, 0.04, 24]} />
            <meshStandardMaterial color={shade(color, -0.1)} />
          </mesh>
          <mesh position={[0, H / 2, 0]}>
            <cylinderGeometry args={[0.012, 0.012, H, 8]} />
            <meshStandardMaterial color={shade(color, -0.1)} />
          </mesh>
          <mesh position={[0, H - 0.12, 0]} castShadow>
            <cylinderGeometry args={[W / 3, W / 2, 0.24, 24, 1, true]} />
            <meshStandardMaterial color={color} side={THREE.DoubleSide} emissive="#FFE7B3" emissiveIntensity={0.25} />
          </mesh>
        </>
      );
    case 'tv':
      return (
        <>
          <Box size={[W, H, D * 0.6]} pos={[0, H / 2, -D * 0.2]} color="#111111" />
          <mesh position={[0, H / 2, D * 0.1 + 0.001]}>
            <planeGeometry args={[W * 0.96, H * 0.93]} />
            <meshStandardMaterial color="#1E2A33" emissive="#2B4A5E" emissiveIntensity={0.35} roughness={0.25} />
          </mesh>
        </>
      );
    case 'wall_art':
      return (
        <>
          <Box size={[W, H, D]} pos={[0, H / 2, 0]} color={shade(color, -0.35)} />
          <mesh position={[0, H / 2, D / 2 + 0.001]}>
            <planeGeometry args={[W * 0.86, H * 0.86]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </>
      );
    case 'wall_mirror':
      return (
        <>
          <mesh position={[0, H / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[W / 2, W / 2, D, 40]} />
            <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, H / 2, D / 2 + 0.002]}>
            <circleGeometry args={[W / 2 - 0.03, 40]} />
            <meshStandardMaterial color="#DCE8EC" metalness={0.9} roughness={0.08} />
          </mesh>
        </>
      );
    case 'coat_hooks':
      return (
        <>
          <Box size={[W, H, D * 0.3]} pos={[0, H / 2, -D * 0.35]} color={color} />
          {[-0.4, -0.2, 0, 0.2, 0.4].map((f) => (
            <Box key={f} size={[0.02, 0.02, D * 0.7]} pos={[f * W, H * 0.4, D * 0.15]} color="#3A3A3A" />
          ))}
        </>
      );
    default:
      return (
        <>
          <Box size={[W, H, D]} pos={[0, H / 2, 0]} color={color} />
          <Box size={[W * 0.96, 0.01, 0.005]} pos={[0, H * 0.5, D / 2 + 0.003]} color={shade(color, -0.2)} />
        </>
      );
  }
}

/** Doors swung open or the top drawer pulled out, shown while the item is selected. */
function OpenPreview({ product, W, D, H, color }) {
  const opens = ruleOf(product).opens;
  if (opens === 'doors') {
    const n = doorCount(product);
    const dw = W / n;
    const h = Math.min(H * 0.92, H - 0.06);
    // Doors open 90 degrees, hinged at their outer edges (pairs open from the middle).
    return Array.from({ length: n }, (_, i) => {
      const leftHinge = n === 1 || i < n / 2;
      const hingeX = leftHinge ? -W / 2 + i * dw : -W / 2 + (i + 1) * dw;
      return (
        <mesh key={i} position={[hingeX + (leftHinge ? 0.01 : -0.01), h / 2 + (H - h) / 2, D / 2 + dw / 2]} castShadow>
          <boxGeometry args={[0.02, h, dw]} />
          <meshStandardMaterial color={shade(color, 0.04)} transparent opacity={0.85} />
        </mesh>
      );
    });
  }
  if (opens === 'drawers') {
    const out = D * 0.75;
    return (
      <mesh position={[0, H * 0.82, D / 2 + out / 2 - 0.05]} castShadow>
        <boxGeometry args={[W * 0.88, Math.min(0.18, H * 0.2), out]} />
        <meshStandardMaterial color={shade(color, 0.06)} transparent opacity={0.9} />
      </mesh>
    );
  }
  return null;
}

/** The space an item needs kept clear, drawn on the floor in local coordinates. */
function ClearZone({ product, W, D, warn }) {
  const { front, around } = clearanceOf(product);
  const color = warn ? '#C0392B' : '#2E6B4E';
  if (around > 0) {
    const a = around / 100;
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <planeGeometry args={[W + 2 * a, D + 2 * a]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} />
      </mesh>
    );
  }
  if (front <= 0) return null;
  const f = front / 100;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, D / 2 + f / 2]}>
      <planeGeometry args={[W, f]} />
      <meshBasicMaterial color={color} transparent opacity={0.18} />
    </mesh>
  );
}

export function heatColour(t) {
  const a = new THREE.Color('#3E8E5E');
  const b = new THREE.Color('#E3B23C');
  const c = new THREE.Color('#C0392B');
  const out = t < 0.5 ? a.clone().lerp(b, t * 2) : b.clone().lerp(c, (t - 0.5) * 2);
  return '#' + out.getHexString();
}

export default function Furniture({ item, heatT }) {
  const { uid, x, z, rot, product } = item;
  const view = useStore((s) => s.view);
  const heatmap = useStore((s) => s.heatmap);
  const selected = useStore((s) => s.selectedUid === uid);
  const blocked = useStore((s) => s.blockedUid === uid);
  const controls = useThree((s) => s.controls);
  const drag = useRef(null);

  const W = product.w / 100, D = product.d / 100, H = product.h / 100;
  const y = item.y || 0;
  const mounted = isMounted(product);
  const color = heatmap ? heatColour(heatT) : product.colour;

  const onDown = (e) => {
    if (view !== 'plan') return;
    e.stopPropagation();
    const st = useStore.getState();
    if (st.armedUid) return; // a hotbar item is waiting to be placed
    e.target.setPointerCapture(e.pointerId);
    // Wall items are dragged on a level plane at their own height, so they follow the cursor.
    const plane = mounted ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -(y / 100 + H / 2)) : FLOOR;
    const hit = e.ray.intersectPlane(plane, HIT);
    if (!hit) return;
    const ne = e.nativeEvent || e;
    drag.current = { dx: x - hit.x * 100, dz: z - hit.z * 100, plane, startY: y, startClientY: ne.clientY };
    if (controls) controls.enabled = false;
    st.select(uid);
    st.setDragging(true);
  };
  const overBinAt = (e) => {
    const ne = e.nativeEvent || e;
    const el = document.elementFromPoint(ne.clientX, ne.clientY);
    return !!el?.closest('[data-bin]');
  };
  const onMove = (e) => {
    if (!drag.current) return;
    e.stopPropagation();
    const st = useStore.getState();
    const over = overBinAt(e);
    st.setOverBin(over);
    if (over) return;
    const ne = e.nativeEvent || e;
    // Shift-drag raises and lowers wall items instead of sliding them.
    if (mounted && ne.shiftKey) {
      st.setHeight(uid, Math.round((drag.current.startY + (drag.current.startClientY - ne.clientY) * 0.6) / 5) * 5);
      return;
    }
    const hit = e.ray.intersectPlane(drag.current.plane, HIT);
    if (!hit) return;
    st.moveItem(uid, hit.x * 100 + drag.current.dx, hit.z * 100 + drag.current.dz);
  };
  const onUp = (e) => {
    if (!drag.current) return;
    e.stopPropagation();
    e.target.releasePointerCapture(e.pointerId);
    drag.current = null;
    if (controls) controls.enabled = true;
    const st = useStore.getState();
    const binIt = overBinAt(e);
    st.setDragging(false);
    if (binIt) st.bin(uid);
  };

  const outline = useMemo(() => new THREE.BoxGeometry(W + 0.04, H + 0.04, D + 0.04), [W, H, D]);
  const conflicted = useStore((s) => {
    if (s.selectedUid !== uid) return false;
    const all = s.placedWithProducts();
    const me = all.find((a) => a.uid === uid);
    return me ? clearanceConflicts(me, all).blockedBy.length > 0 : false;
  });

  return (
    <group
      position={[x / 100, y / 100, z / 100]}
      rotation={[0, (rot * Math.PI) / 2, 0]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerOver={(e) => { if (view === 'plan') { e.stopPropagation(); document.body.style.cursor = 'grab'; } }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    >
      <Shape category={product.category} W={W} D={D} H={H} color={color} />
      {selected && view === 'plan' && <ClearZone product={product} W={W} D={D} warn={conflicted} />}
      {selected && mounted && y > 0 && (
        <mesh position={[0, -y / 200, D / 2]}>
          <boxGeometry args={[0.006, y / 100, 0.006]} />
          <meshBasicMaterial color="#E0A526" />
        </mesh>
      )}
      {selected && <OpenPreview product={product} W={W} D={D} H={H} color={color} />}
      {(selected || blocked) && (
        <lineSegments position={[0, H / 2, 0]}>
          <edgesGeometry args={[outline]} />
          <lineBasicMaterial color={blocked ? '#C0392B' : '#E0A526'} />
        </lineSegments>
      )}
      {(selected || blocked) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004 - y / 100, 0]}>
          <planeGeometry args={[W, D]} />
          <meshBasicMaterial color={blocked ? '#C0392B' : '#E0A526'} transparent opacity={0.25} />
        </mesh>
      )}
    </group>
  );
}
