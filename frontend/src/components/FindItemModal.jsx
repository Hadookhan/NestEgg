import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../lib/api.js';
import { ROOM_TYPES, gbp, netCost } from '../lib/finance.js';

function ProductRow({ p, months, onAdd }) {
  return (
    <li className="result">
      <span className="swatch lg" style={{ background: p.colour }} />
      <div className="result-body">
        <strong>{p.name}</strong>
        <span className="muted small">
          {p.w} × {p.d} × {p.h} cm{p.condition === 'used' ? ', second-hand' : ''}
        </span>
      </div>
      <div className="result-money">
        <span className="num">{gbp(p.price)}</span>
        <span className="num muted small">real {gbp(netCost(p, months))}</span>
      </div>
      <button className="btn small" onClick={() => onAdd(p)}>Add</button>
    </li>
  );
}

function Search() {
  const prefs = useStore((s) => s.prefs);
  const [q, setQ] = useState('');
  const [roomFilter, setRoomFilter] = useState(prefs.roomType);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.products({ q, room: roomFilter, include_used: prefs.includeUsed })
        .then((r) => { setResults(r); setError(null); })
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, roomFilter, prefs.includeUsed]);

  return (
    <>
      <div className="row">
        <input className="grow" autoFocus placeholder="Search, e.g. oak desk" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
        <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} aria-label="Room type">
          <option value="">All rooms</option>
          {ROOM_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <ul className="results">
        {results.map((p) => (
          <ProductRow key={p.id} p={p} months={prefs.tenancyMonths}
            onAdd={(prod) => useStore.getState().addToInventory(prod.id)} />
        ))}
        {!error && results.length === 0 && <li className="muted">No matches. Try fewer words or another room type.</li>}
      </ul>
    </>
  );
}

function FromListing() {
  const months = useStore((s) => s.prefs.tenancyMonths);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const read = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await api.normalise({ text, url: url || null });
      useStore.getState().addProduct(r.product);
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="muted small">
        Found something on a shop's website? Copy the product title, price and dimensions from the page and paste them here.
      </p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'e.g.\nAlba 3 drawer chest, white\n£79.99\nDimensions: W 70 x D 40 x H 75 cm'}
        aria-label="Listing text" />
      <input placeholder="Link to the listing (optional)" value={url} onChange={(e) => setUrl(e.target.value)}
        aria-label="Listing link" />
      <button className="btn primary" disabled={busy || text.trim().length < 10} onClick={read}>
        {busy ? 'Reading listing…' : 'Read listing'}
      </button>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p className={`badge ${result.via === 'n8n' ? 'ok' : 'warn'}`}>
            {result.via === 'n8n' ? 'Read by the n8n workflow' : 'Read by the basic parser'}
            {result.warning ? `. ${result.warning}` : ''}
          </p>
          <ul className="results">
            <ProductRow p={result.product} months={months}
              onAdd={(prod) => useStore.getState().addToInventory(prod.id)} />
          </ul>
        </>
      )}
    </>
  );
}

export default function FindItemModal() {
  const [tab, setTab] = useState('search');
  const close = useStore.getState().closePanel;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal wide" role="dialog" aria-label="Find item" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>Find item</h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>×</button>
        </div>
        <div className="segmented small" role="tablist">
          <button role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}>Search catalogue</button>
          <button role="tab" aria-selected={tab === 'listing'} onClick={() => setTab('listing')}>Add from a shop listing</button>
        </div>
        <div className="stack">{tab === 'search' ? <Search /> : <FromListing />}</div>
      </div>
    </div>
  );
}
