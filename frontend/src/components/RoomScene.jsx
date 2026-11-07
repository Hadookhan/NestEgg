import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { GRID, DOOR_DEPTH } from '../lib/geometry.js';
import Furniture from './Furniture.jsx';

function Grid({ room }) {
  const geo = useMemo(() => {
    const W = room.width / 100, D = room.depth / 100, step = GRID / 100;
    const pts = [];
    for (let x = 0; x <= W + 1e-6; x += step) pts.push(x, 0.002, 0, x, 0.002, D);
    for (let z = 0; z <= D + 1e-6; z += step) pts.push(0, 0.002, z, W, 0.002, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [room.width, room.depth]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#9FB3AE" transparent opacity={0.85} />
    </lineSegments>
  );
}

function Shell({ room, showCeiling }) {
  const W = room.width / 100, D = room.depth / 100, H = (room.height || 240) / 100;
  // Each wall faces into the room, so from above the near walls are culled ("dollhouse" view).
  const walls = [
    { pos: [W / 2, H / 2, 0], rot: 0, len: W },
    { pos: [W / 2, H / 2, D], rot: Math.PI, len: W },
    { pos: [0, H / 2, D / 2], rot: Math.PI / 2, len: D },
    { pos: [W, H / 2, D / 2], rot: -Math.PI / 2, len: D },
  ];
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0, D / 2]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#E4DCCD" roughness={0.95} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos} rotation={[0, w.rot, 0]} receiveShadow>
          <planeGeometry args={[w.len, H]} />
          <meshStandardMaterial color="#F3F4EF" roughness={1} />
        </mesh>
      ))}
      {showCeiling && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[W / 2, H, D / 2]}>
          <planeGeometry args={[W, D]} />
          <meshStandardMaterial color="#FAFAF7" />
        </mesh>
      )}
    </>
  );
}

function Door({ room }) {
  const d = room.door;
  if (!d) return null;
  const W = room.width / 100, D = room.depth / 100;
  const o = d.offset / 100, dw = (d.width || 80) / 100, depth = DOOR_DEPTH / 100;
  const cfg = {
    north: { door: [o, 1.0, 0.006], rot: 0, zone: [o, depth / 2], zs: [dw, depth] },
    south: { door: [o, 1.0, D - 0.006], rot: Math.PI, zone: [o, D - depth / 2], zs: [dw, depth] },
    west: { door: [0.006, 1.0, o], rot: Math.PI / 2, zone: [depth / 2, o], zs: [depth, dw] },
    east: { door: [W - 0.006, 1.0, o], rot: -Math.PI / 2, zone: [W - depth / 2, o], zs: [depth, dw] },
  }[d.wall];
  if (!cfg) return null;
  return (
    <>
      <mesh position={cfg.door} rotation={[0, cfg.rot, 0]}>
        <planeGeometry args={[dw, 2.0]} />
        <meshStandardMaterial color="#8C7457" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cfg.zone[0], 0.003, cfg.zone[1]]}>
        <planeGeometry args={cfg.zs} />
        <meshBasicMaterial color="#D99A1E" transparent opacity={0.18} />
      </mesh>
    </>
  );
}

function PlanCamera({ room }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    const W = room.width / 100, D = room.depth / 100, m = Math.max(W, D);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    camera.position.set(W / 2, m * 1.45, D / 2 + m * 1.05);
    camera.lookAt(W / 2, 0, D / 2);
    if (controls) {
      controls.target.set(W / 2, 0, D / 2);
      controls.update();
    }
  }, [room.width, room.depth, camera, controls]);
  return null;
}

/** Stand at the scan point and look around: drag, or turn the phone (gyroscope). */
function LookAround({ room }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const gyro = useStore((s) => s.gyro);
  const yaw = useRef(0); // 0 = facing the north (far) wall
  const pitch = useRef(-0.08);

  useEffect(() => {
    const sp = room.standPoint || { x: room.width / 2, z: room.depth / 2 };
    camera.position.set(sp.x / 100, 1.6, sp.z / 100);
    camera.fov = 72;
    camera.updateProjectionMatrix();
    yaw.current = 0;
  }, [room, camera]);

  useEffect(() => {
    const el = gl.domElement;
    let last = null;
    const down = (e) => { last = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); };
    const move = (e) => {
      if (!last) return;
      yaw.current += (e.clientX - last.x) * 0.005;
      pitch.current = THREE.MathUtils.clamp(pitch.current + (e.clientY - last.y) * 0.004, -1.2, 1.2);
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => { last = null; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [gl]);

  useEffect(() => {
    if (!gyro) return undefined;
    const onOrient = (e) => {
      if (e.alpha == null) return;
      yaw.current = THREE.MathUtils.degToRad(e.alpha);
      pitch.current = THREE.MathUtils.clamp(THREE.MathUtils.degToRad((e.beta ?? 90) - 90), -1.2, 1.2);
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [gyro]);

  useFrame(() => {
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });
  return null;
}

/** Lets the DOM (drag from hotbar, click to place) turn screen points into floor points. */
function DropBridge({ bridgeRef }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const v = new THREE.Vector3();
    bridgeRef.current = (cx, cy) => {
      const r = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.ray.intersectPlane(plane, v);
      return hit ? { x: hit.x * 100, z: hit.z * 100 } : null;
    };
  }, [camera, gl, bridgeRef]);
  return null;
}

export default function RoomScene({ bridgeRef }) {
  const room = useStore((s) => s.room);
  const view = useStore((s) => s.view);
  const dragging = useStore((s) => s.dragging);
  const placedItems = useStore((s) => s.placed);
  const productById = useStore((s) => s.productById);

  const items = useMemo(
    () => placedItems.map((pl) => ({ ...pl, product: productById[pl.productId] })).filter((pl) => pl.product),
    [placedItems, productById],
  );
  const prices = items.map((i) => i.product.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const heatT = (price) => (hi > lo ? (price - lo) / (hi - lo) : 0.5);

  if (!room) return null;
  const W = room.width / 100, D = room.depth / 100;

  return (
    <Canvas
      shadows
      camera={{ position: [W / 2, 6, D + 4], fov: 45, near: 0.05, far: 100 }}
      onPointerMissed={() => useStore.setState({ selectedUid: null })}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#E6EAE4']} />
      <hemisphereLight args={['#FFFFFF', '#B9B1A2', 0.75]} />
      <directionalLight
        position={[W * 0.2 - 2, 6, D * 0.3 - 1]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <Shell room={room} showCeiling={view === 'stand'} />
      {view === 'plan' && <Grid room={room} />}
      <Door room={room} />
      {items.map((it) => (
        <Furniture key={it.uid} item={it} heatT={heatT(it.product.price)} />
      ))}
      {view === 'plan' ? (
        <>
          <OrbitControls
            makeDefault
            enabled={!dragging}
            maxPolarAngle={Math.PI / 2.15}
            minDistance={1.5}
            maxDistance={25}
          />
          <PlanCamera room={room} />
        </>
      ) : (
        <LookAround room={room} />
      )}
      <DropBridge bridgeRef={bridgeRef} />
    </Canvas>
  );
}
