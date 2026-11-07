import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store.js';

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
    default:
      return (
        <>
          <Box size={[W, H, D]} pos={[0, H / 2, 0]} color={color} />
          <Box size={[W * 0.96, 0.01, 0.005]} pos={[0, H * 0.5, D / 2 + 0.003]} color={shade(color, -0.2)} />
        </>
      );
  }
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
  const color = heatmap ? heatColour(heatT) : product.colour;

  const onDown = (e) => {
    if (view !== 'plan') return;
    e.stopPropagation();
    const st = useStore.getState();
    if (st.armedUid) return; // a hotbar item is waiting to be placed
    e.target.setPointerCapture(e.pointerId);
    const hit = e.ray.intersectPlane(FLOOR, HIT);
    if (!hit) return;
    drag.current = { dx: x - hit.x * 100, dz: z - hit.z * 100 };
    if (controls) controls.enabled = false;
    st.select(uid);
    st.setDragging(true);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    e.stopPropagation();
    const hit = e.ray.intersectPlane(FLOOR, HIT);
    if (!hit) return;
    useStore.getState().moveItem(uid, hit.x * 100 + drag.current.dx, hit.z * 100 + drag.current.dz);
  };
  const onUp = (e) => {
    if (!drag.current) return;
    e.stopPropagation();
    e.target.releasePointerCapture(e.pointerId);
    drag.current = null;
    if (controls) controls.enabled = true;
    useStore.getState().setDragging(false);
  };

  const outline = useMemo(() => new THREE.BoxGeometry(W + 0.04, H + 0.04, D + 0.04), [W, H, D]);

  return (
    <group
      position={[x / 100, 0, z / 100]}
      rotation={[0, (rot * Math.PI) / 2, 0]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerOver={(e) => { if (view === 'plan') { e.stopPropagation(); document.body.style.cursor = 'grab'; } }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    >
      <Shape category={product.category} W={W} D={D} H={H} color={color} />
      {(selected || blocked) && (
        <lineSegments position={[0, H / 2, 0]}>
          <edgesGeometry args={[outline]} />
          <lineBasicMaterial color={blocked ? '#C0392B' : '#E0A526'} />
        </lineSegments>
      )}
      {(selected || blocked) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <planeGeometry args={[W, D]} />
          <meshBasicMaterial color={blocked ? '#C0392B' : '#E0A526'} transparent opacity={0.25} />
        </mesh>
      )}
    </group>
  );
}
