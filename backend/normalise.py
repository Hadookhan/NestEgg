"""
Turn a pasted product listing into a NestEgg product.

Primary path: forward the listing to the n8n workflow (N8N_NORMALISE_URL),
which asks Claude to extract dimensions/price/category and then adds our
finance estimates (lifespan, resale rate, priority).

Fallback path: a simple regex parser, so the demo still works if n8n is down.
"""

import hashlib
import os
import re

import httpx

CATEGORIES = {
    # category: (lifespanYears, resaleRate, priority, rooms, keywords)
    "bed": (7, 0.30, "essential", ["bedroom"], ["bed", "mattress", "bedframe"]),
    "wardrobe": (6, 0.30, "essential", ["bedroom"], ["wardrobe", "armoire", "clothes rail"]),
    "drawers": (6, 0.30, "soon", ["bedroom"], ["drawer", "chest of", "dresser"]),
    "bedside": (6, 0.30, "soon", ["bedroom"], ["bedside", "nightstand", "night stand"]),
    "mirror": (8, 0.35, "later", ["bedroom"], ["mirror"]),
    "floor_lamp": (5, 0.30, "later", ["bedroom", "living_room", "home_office"], ["lamp", "light"]),
    "sofa": (6, 0.25, "essential", ["living_room"], ["sofa", "couch", "settee", "futon"]),
    "armchair": (6, 0.30, "soon", ["living_room"], ["armchair", "accent chair", "lounge chair"]),
    "coffee_table": (8, 0.35, "soon", ["living_room"], ["coffee table"]),
    "tv_stand": (7, 0.30, "later", ["living_room"], ["tv stand", "tv unit", "media unit"]),
    "bookshelf": (7, 0.30, "soon", ["living_room", "home_office", "bedroom"], ["bookcase", "bookshelf", "shelving", "shelf"]),
    "desk": (6, 0.35, "essential", ["home_office", "bedroom"], ["desk", "workstation"]),
    "office_chair": (5, 0.30, "essential", ["home_office", "bedroom"], ["office chair", "desk chair", "gaming chair"]),
    "filing_cabinet": (10, 0.35, "later", ["home_office"], ["filing", "file cabinet"]),
    "dining_table": (8, 0.35, "essential", ["dining"], ["dining table", "kitchen table"]),
    "dining_chair": (6, 0.30, "essential", ["dining"], ["dining chair", "kitchen chair"]),
    "sideboard": (8, 0.35, "later", ["dining", "living_room"], ["sideboard", "buffet", "credenza"]),
    "bath_cabinet": (6, 0.20, "essential", ["bathroom"], ["bathroom cabinet"]),
    "bath_shelf": (4, 0.20, "soon", ["bathroom"], ["bathroom shelf", "ladder shelf"]),
    "towel_stand": (6, 0.25, "soon", ["bathroom"], ["towel"]),
    "hamper": (3, 0.10, "later", ["bathroom", "bedroom"], ["laundry", "hamper", "basket"]),
    "stool": (4, 0.20, "later", ["bathroom"], ["stool"]),
    "shoe_rack": (5, 0.20, "later", ["living_room", "bedroom"], ["shoe"]),
}
STYLES = {"minimal", "scandi", "industrial", "cosy", "bold"}
TONES = {"light", "wood", "dark", "colour"}
COLOURS = {
    "white": ("#F2F2EF", "light"), "grey": ("#8A8F94", "light"), "gray": ("#8A8F94", "light"),
    "black": ("#2B2B2B", "dark"), "oak": ("#C49A6C", "wood"), "pine": ("#D9B98C", "wood"),
    "walnut": ("#7A5236", "wood"), "wood": ("#B08850", "wood"), "navy": ("#2C3E5C", "dark"),
    "green": ("#2F5D50", "colour"), "blue": ("#3F6E9E", "colour"), "yellow": ("#D9A441", "colour"),
    "mustard": ("#D9A441", "colour"), "pink": ("#D79AA0", "colour"), "beige": ("#CDBDA4", "light"),
    "cream": ("#EDE4D3", "light"), "brown": ("#6B4E3D", "dark"),
}
UNIT_TO_CM = {"mm": 0.1, "cm": 1.0, "m": 100.0, "in": 2.54, "inch": 2.54, "inches": 2.54, '"': 2.54}


def _id_for(text):
    return "added-" + hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def _guess_category(text):
    t = text.lower()
    best, best_len = None, 0
    for cat, (*_, keywords) in CATEGORIES.items():
        for kw in keywords:
            if kw in t and len(kw) > best_len:
                best, best_len = cat, len(kw)
    return best or "bookshelf"


def fallback_parse(text, url=None):
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    name = (lines[0] if lines else "Unnamed item")[:90]
    low = text.lower()

    price = None
    m = re.search(r"£\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", text) or \
        re.search(r"([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:gbp|pounds)", low)
    if m:
        price = float(m.group(1).replace(",", ""))

    dims = None
    m = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:cm|mm|in|\")?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm|in|\")?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in|\")?",
        low)
    if m:
        factor = UNIT_TO_CM.get(m.group(4) or "cm", 1.0)
        dims = [round(float(m.group(i)) * factor) for i in (1, 2, 3)]

    colour, colour_name, tone = "#B9B4A8", "unknown", "light"
    for word, (hexv, tn) in COLOURS.items():
        if re.search(r"\b" + re.escape(word) + r"\b", low):
            colour, colour_name, tone = hexv, word, tn
            break

    return {
        "name": name,
        "category": _guess_category(text),
        "price": price,
        "w": dims[0] if dims else None,
        "d": dims[1] if dims else None,
        "h": dims[2] if dims else None,
        "colour": colour,
        "colourName": colour_name,
        "tone": tone,
        "styles": ["minimal"],
        "condition": "used" if any(k in low for k in ("used", "second-hand", "second hand", "pre-owned", "preloved")) else "new",
        "url": url,
    }


def finalise(raw, text, url, via):
    """Validate and fill defaults so the frontend always gets a complete product."""
    cat = raw.get("category")
    if cat not in CATEGORIES:
        cat = _guess_category(text)
    life, resale, priority, rooms, _ = CATEGORIES[cat]

    missing = [k for k in ("price", "w", "d", "h") if not isinstance(raw.get(k), (int, float)) or raw.get(k) <= 0]
    if missing:
        nice = {"price": "price", "w": "width", "d": "depth", "h": "height"}
        raise ValueError("Couldn't find the " + ", ".join(nice[k] for k in missing) +
                         " in that listing. Paste the part of the page that includes the price and dimensions (W x D x H).")

    styles = [s for s in (raw.get("styles") or []) if s in STYLES] or ["minimal"]
    tone = raw.get("tone") if raw.get("tone") in TONES else "light"
    condition = "used" if raw.get("condition") == "used" else "new"

    return {
        "id": _id_for(text),
        "name": str(raw.get("name") or "Unnamed item")[:90],
        "category": cat,
        "rooms": raw.get("rooms") if isinstance(raw.get("rooms"), list) and raw.get("rooms") else rooms,
        "price": round(float(raw["price"]), 2),
        "currency": "GBP",
        "w": round(float(raw["w"])), "d": round(float(raw["d"])), "h": round(float(raw["h"])),
        "colour": raw.get("colour") if re.fullmatch(r"#[0-9A-Fa-f]{6}", str(raw.get("colour") or "")) else "#B9B4A8",
        "colourName": str(raw.get("colourName") or "unknown"),
        "tone": tone,
        "styles": styles,
        "priority": raw.get("priority") if raw.get("priority") in ("essential", "soon", "later") else priority,
        "lifespanYears": float(raw.get("lifespanYears") or life),
        "resaleRate": float(raw.get("resaleRate") or (min(0.75, resale + 0.25) if condition == "used" else resale)),
        "condition": condition,
        "url": url or raw.get("url"),
        "source": "Added via n8n" if via == "n8n" else "Added via basic parser",
    }


async def normalise(text, url=None):
    """Returns (product, via, warning)."""
    hook = os.environ.get("N8N_NORMALISE_URL")
    warning = None
    if hook:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.post(hook, json={"text": text, "url": url})
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list):
                data = data[0] if data else {}
            if data.get("error"):
                raise ValueError(data["error"])
            return finalise(data, text, url, "n8n"), "n8n", None
        except Exception as e:  # fall through to the local parser
            warning = f"n8n workflow unavailable ({type(e).__name__}); used the basic parser instead."
    else:
        warning = "N8N_NORMALISE_URL isn't set; used the basic parser."
    return finalise(fallback_parse(text, url), text, url, "fallback"), "fallback", warning
