import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../lib/api.js';
import RoomScene from './RoomScene.jsx';
import SidePanel from './SidePanel.jsx';
import Hotbar from './Hotbar.jsx';
import SelectedCard from './SelectedCard.jsx';
import InventoryModal from './InventoryModal.jsx';
import FindItemModal from './FindItemModal.jsx';
import CashflowModal from './CashflowModal.jsx';
import RoomSetup from './RoomSetup.jsx';
import Toast from './Toast.jsx';
import HeatmapKey from './HeatmapKey.jsx';
import CustomRoomModal from './CustomRoomModal.jsx';

function useSessionSync(sessionId) {
  const setRoom = useStore((s) => s.setRoom);
  const restore = useStore((s) => s.restore);
  const [loaded, setLoaded] = useState(false);

  // Initial load: products + any saved state for this session.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [products, session] = await Promise.all([api.products(), api.getSession(sessionId)]);
        if (!alive) return;
        useStore.getState().setProducts(products);
        restore(session.state);
        if (session.room) setRoom(session.room);
      } catch (e) {
        useStore.getState().notify(e.message);
        if (/Session not found/.test(e.message)) window.location.hash = '';
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [sessionId, restore, setRoom]);

  // Poll for a room sent from the phone.
  useEffect(() => {
    if (!loaded) return undefined;
    const t = setInterval(async () => {
      try {
        const s = await api.getSession(sessionId);
        if (s.room && s.room.updatedAt !== useStore.getState().room?.updatedAt) {
          setRoom(s.room);
          useStore.getState().closePanel();
          useStore.getState().notify(
            s.room.source === 'horizonnet' ? 'Room scan received from your phone' : 'Room measurements received',
          );
        }
      } catch {
        /* server briefly unavailable; try again next tick */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [loaded, sessionId, setRoom]);

  // Save inventory, layout and money inputs (debounced).
  useEffect(() => {
    if (!loaded) return undefined;
    let timer;
    const unsub = useStore.subscribe((state, prev) => {
      if (state.inventory === prev.inventory && state.placed === prev.placed &&
        state.prefs === prev.prefs && state.money === prev.money) return;
      clearTimeout(timer);
      timer = setTimeout(() => api.saveState(sessionId, useStore.getState().snapshot()).catch(() => {}), 800);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, [loaded, sessionId]);

  return loaded;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const s = useStore.getState();
      const key = e.key.toLowerCase();
      if (key === 'e') {
        s.panel === 'inventory' ? s.closePanel() : s.openPanel('inventory');
      } else if (key === 'escape') {
        if (s.panel) s.closePanel();
        else s.select(null);
        useStore.setState({ armedUid: null });
      } else if (/^[1-9]$/.test(key)) {
        const entry = s.inventory[Number(key) - 1];
        if (entry) s.arm(entry.uid);
      } else if ((key === 'arrowup' || key === 'pageup' || key === 'arrowdown' || key === 'pagedown') && s.selectedUid) {
        e.preventDefault();
        const step = (key === 'pageup' || key === 'pagedown' ? 20 : 5) * (key.includes('up') ? 1 : -1);
        s.nudgeHeight(s.selectedUid, step);
      } else if (key === 'r' && s.selectedUid) {
        s.rotate(s.selectedUid);
      } else if ((key === 'delete' || key === 'backspace') && s.selectedUid) {
        e.preventDefault();
        s.unplace(s.selectedUid);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function Editor({ sessionId }) {
  const loaded = useSessionSync(sessionId);
  useShortcuts();
  const bridgeRef = useRef(null);
  const room = useStore((s) => s.room);
  const view = useStore((s) => s.view);
  const heatmap = useStore((s) => s.heatmap);
  const panel = useStore((s) => s.panel);
  const armedUid = useStore((s) => s.armedUid);
  const gyro = useStore((s) => s.gyro);

  useEffect(() => { useStore.getState().setSession(sessionId); }, [sessionId]);

  const placeFromScreen = (uid, cx, cy) => {
    const pt = bridgeRef.current?.(cx, cy);
    if (pt) useStore.getState().placeAt(uid, pt.x, pt.z);
  };

  const enableGyro = async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') throw new Error('denied');
      }
      useStore.getState().setGyro(!gyro);
    } catch {
      useStore.getState().notify('Motion access was blocked. On phones this needs an https link (see README).');
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          NestEgg
        </div>
        {room && (
          <div className="segmented" role="tablist" aria-label="View">
            <button role="tab" aria-selected={view === 'plan'} onClick={() => useStore.getState().setView('plan')}>
              Plan view
            </button>
            <button role="tab" aria-selected={view === 'stand'} onClick={() => useStore.getState().setView('stand')}>
              Stand in room
            </button>
          </div>
        )}
        <div className="topbar-actions">
          {room && (
            <>
              <button className={`btn ghost ${heatmap ? 'on' : ''}`} aria-pressed={heatmap}
                onClick={() => useStore.getState().toggleHeatmap()}>
                Cost heatmap
              </button>
              <button className="btn ghost" onClick={() => useStore.getState().clearRoom()}>
                Clear room
              </button>
              <button className="btn" onClick={() => useStore.getState().autoPlaceAll()}>
                Suggest place
              </button>
            </>
          )}
          <button className="btn primary" onClick={() => useStore.getState().openPanel('find')}>
            Find item
          </button>
        </div>
      </header>

      <SidePanel />

      <main
        className={`stage ${armedUid ? 'armed' : ''}`}
        onDragOver={(e) => { if (room && view === 'plan') e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const uid = e.dataTransfer.getData('text/nestegg-uid');
          if (uid) placeFromScreen(uid, e.clientX, e.clientY);
        }}
        onClick={(e) => {
          const s = useStore.getState();
          if (s.armedUid && view === 'plan' && e.target.tagName === 'CANVAS') placeFromScreen(s.armedUid, e.clientX, e.clientY);
        }}
      >
        {loaded && !room && <RoomSetup sessionId={sessionId} />}
        {room && <RoomScene bridgeRef={bridgeRef} />}

        {room && view === 'plan' && (
          <p className="stage-hint">
            {armedUid
              ? 'Click the floor to place it. Esc to cancel.'
              : 'Drag items to move, or onto the bin to bin them. R rotates, ↑ ↓ raise wall items, Delete puts it back in your inventory. Each tile is 50 cm.'}
          </p>
        )}
        {room && view === 'stand' && (
          <div className="stage-hint stand">
            Drag to look around.
            <button className="link" onClick={enableGyro}>
              {gyro ? 'Stop using motion' : 'Use phone motion'}
            </button>
          </div>
        )}
        {room && heatmap && <HeatmapKey />}
        {room && view === 'plan' && <SelectedCard />}
        <Hotbar />
      </main>

      {panel === 'inventory' && <InventoryModal />}
      {panel === 'find' && <FindItemModal />}
      {panel === 'plan' && <CashflowModal />}
      {panel === 'custom' && <CustomRoomModal />}
      {panel === 'room' && (
        <div className="modal-backdrop" onClick={() => useStore.getState().closePanel()}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <RoomSetup sessionId={sessionId} inModal />
          </div>
        </div>
      )}
      <Toast />
    </div>
  );
}
