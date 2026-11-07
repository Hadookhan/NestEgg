"""
NestEgg backend.

Run:  uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

import json
import os
import random
import shutil
import socket
import string
import tempfile
import threading
import time
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import layout
import normalise as norm

DATA = Path(__file__).parent / "data"
SESSIONS_FILE = DATA / "sessions.json"
ADDED_FILE = DATA / "added_products.json"
_lock = threading.Lock()

app = FastAPI(title="NestEgg API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------- storage (simple JSON files; swap for a database later) ----------

def _load(path, default):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _save(path, data):
    with _lock:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=1))
        tmp.replace(path)


SESSIONS = _load(SESSIONS_FILE, {})


def all_products():
    return _load(DATA / "products.json", []) + _load(ADDED_FILE, [])


def get_session(sid):
    s = SESSIONS.get(sid)
    if not s:
        raise HTTPException(404, "Session not found. Reload the planner on your computer to start a new one.")
    return s


def default_door(wall, width, depth, offset=None):
    along = width if wall in ("north", "south") else depth
    off = offset if offset is not None else along / 2
    return {"wall": wall, "offset": max(45, min(along - 45, off)), "width": 80}


# ---------- models ----------

Wall = Literal["north", "south", "east", "west"]


class ManualRoom(BaseModel):
    width: float = Field(gt=100, lt=2000, description="cm, left to right as you face the far wall")
    depth: float = Field(gt=100, lt=2000, description="cm, door wall to far wall")
    height: float = Field(240, gt=180, lt=500)
    door_wall: Wall = "south"
    door_offset: Optional[float] = None


class ListingIn(BaseModel):
    text: str = Field(min_length=10, max_length=8000)
    url: Optional[str] = None


# ---------- routes ----------

@app.get("/api/health")
def health():
    ok, reason = layout.horizonnet_status()
    return {"ok": True, "horizonnet": ok, "horizonnet_status": reason,
            "n8n_configured": bool(os.environ.get("N8N_NORMALISE_URL"))}


def _describe(ip):
    a, b, c = (int(x) for x in ip.split(".")[:3])
    if a == 172 and b == 20 and c == 10:
        return "iPhone hotspot"
    if a == 192 and b == 168 and c == 43:
        return "Android hotspot"
    if a == 192 and b == 168 and c == 137:
        return "Windows mobile hotspot"
    if a == 192 and b == 168 and c == 56:
        return "VirtualBox. Not the one"
    if a == 192 and b == 168 or a == 10:
        return "Wi-Fi or hotspot"
    if a == 172 and 16 <= b <= 31:
        return "often a virtual adapter (Docker, WSL, VPN)"
    if a == 100 and 64 <= b <= 127:
        return "VPN or Tailscale. Only works if the phone is on it too"
    return "network"


@app.get("/api/host")
def host():
    """
    All IPv4 addresses this machine has, best guess first, so the desktop can
    build a QR code the phone can open. Laptops often have several (Wi-Fi,
    Ethernet, Docker, WSL, VPN) and only the Wi-Fi one works for the phone.
    """
    guess = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        guess = s.getsockname()[0]
        s.close()
    except OSError:
        pass
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.append(info[4][0])
    except OSError:
        pass
    if guess:
        ips.insert(0, guess)
    seen, out = set(), []
    for ip in ips:
        if ip in seen or ip.startswith("127.") or ip.startswith("169.254."):
            continue
        seen.add(ip)
        out.append({"ip": ip, "note": _describe(ip)})
    # Put hotspots and typical Wi-Fi ranges first, virtual adapters last.
    rank = lambda c: 0 if "hotspot" in c["note"] else 1 if c["note"] == "Wi-Fi or hotspot" else 3 if "Not the one" in c["note"] else 2
    out.sort(key=rank)
    return {"lan_ip": out[0]["ip"] if out else "127.0.0.1", "candidates": out}


@app.get("/api/ping")
def ping():
    return {"ok": True, "time": time.time()}


@app.post("/api/sessions")
def create_session():
    sid = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    SESSIONS[sid] = {"id": sid, "created": time.time(), "room": None, "state": None, "status": "waiting"}
    _save(SESSIONS_FILE, SESSIONS)
    return SESSIONS[sid]


@app.get("/api/sessions/{sid}")
def read_session(sid: str):
    return get_session(sid)


@app.put("/api/sessions/{sid}/state")
def save_state(sid: str, state: dict):
    s = get_session(sid)
    s["state"] = state
    _save(SESSIONS_FILE, SESSIONS)
    return {"ok": True}


@app.post("/api/sessions/{sid}/manual")
def manual_room(sid: str, body: ManualRoom):
    s = get_session(sid)
    s["room"] = {
        "width": round(body.width), "depth": round(body.depth), "height": round(body.height),
        "door": default_door(body.door_wall, body.width, body.depth, body.door_offset),
        "standPoint": {"x": round(body.width / 2), "z": round(body.depth / 2)},
        "source": "manual", "note": "From your measurements.", "updatedAt": time.time(),
    }
    s["status"] = "ready"
    _save(SESSIONS_FILE, SESSIONS)
    return s["room"]


@app.post("/api/sessions/{sid}/panorama")
async def panorama_room(sid: str, file: UploadFile = File(...),
                        camera_height: float = Form(150), door_wall: Wall = Form("south")):
    s = get_session(sid)
    s["status"] = "processing"
    suffix = Path(file.filename or "pano.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        path = tmp.name
    try:
        room = await run_in_threadpool(layout.estimate_room, path, camera_height)
    except layout.LayoutError as e:
        s["status"] = "error"
        s["message"] = str(e)
        raise HTTPException(422, str(e))
    except Exception as e:
        s["status"] = "error"
        raise HTTPException(500, f"Layout estimation crashed: {type(e).__name__}")
    finally:
        os.unlink(path)
    room["door"] = default_door(door_wall, room["width"], room["depth"])
    room["updatedAt"] = time.time()
    s["room"] = room
    s["status"] = "ready"
    _save(SESSIONS_FILE, SESSIONS)
    return room


@app.get("/api/products")
def products(q: str = "", room: str = "", include_used: bool = True):
    words = [w for w in q.lower().split() if w]
    out = []
    for p in all_products():
        if room and room not in p.get("rooms", []):
            continue
        if not include_used and p.get("condition") == "used":
            continue
        hay = " ".join([p["name"], p["category"].replace("_", " "), p.get("colourName", ""),
                        " ".join(p.get("styles", [])), p.get("condition", "")]).lower()
        if all(w in hay for w in words):
            out.append(p)
    return out


@app.post("/api/normalise")
async def normalise_listing(body: ListingIn):
    try:
        product, via, warning = await norm.normalise(body.text, body.url)
    except ValueError as e:
        raise HTTPException(422, str(e))
    added = [p for p in _load(ADDED_FILE, []) if p["id"] != product["id"]]
    added.append(product)
    _save(ADDED_FILE, added)
    return {"product": product, "via": via, "warning": warning}
