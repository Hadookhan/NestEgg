# NestEgg

Furnish your first home without overspending. Scan an empty room with your phone, see it in 3D, fill it with real-sized furniture, and find out what it will really cost you: upfront, after you sell things on when you move out, and month by month against your income.

Built for first-time movers into housing.

## What's in the box

```
nestegg/
├── frontend/   React + Three.js website (the planner and the phone scan page)
├── backend/    FastAPI: sessions, room geometry (HorizonNet), product catalogue
└── n8n/        n8n workflow that turns a pasted shop listing into a product
```

How the pieces talk:

```
 Phone browser ──(QR code)──▶ /#/scan/<session>  ─┐
                                                   │  upload 360° photo or measurements
 Desktop browser ─▶ /#/plan/<session> ◀─ polls ─── ▼
        │                                     FastAPI backend ──▶ HorizonNet (room layout)
        │  "Find item ▸ Add from a shop listing"      │
        └──────────────────────────────────────▶ /api/normalise ──▶ n8n workflow ──▶ Claude API
```

## Where n8n is used

**Turning shop listings into products** (Find item ▸ Add from a shop listing).

A user pastes the title, price and dimensions from any shop page. The backend sends it to the n8n workflow `NestEgg: normalise product listing`, which runs four steps you can show the judges:

1. **Listing received**: a webhook receives the text.
2. **Build Claude request** and **Ask Claude**: Claude extracts the category, price, dimensions in cm, colour, style and build quality, converting units where needed.
3. **Add finance estimates**: a code node adds lifespan, resale rate and buying priority. These depend on the category, build quality, and whether the item is second-hand.
4. **Send product back**: the finished product is returned to the app, which can then place it in the 3D room.

If n8n isn't running, the backend falls back to a simple built-in parser so the demo never breaks. The app shows which one read the listing.

## Keys and accounts you need

| What | Needed for | Where |
|---|---|---|
| Anthropic API key | The n8n workflow | console.anthropic.com. It goes in the n8n "Ask Claude" node; never in the frontend. |

That's it. There's no login, no database account and no retailer API key. The prototype uses a curated catalogue of 48 sample products (`backend/data/products.json`) with realistic dimensions and illustrative prices. Say so in your pitch: live retailer feeds are a roadmap item, because Amazon's product API needs an approved affiliate account with sales history.

## Setup

You need **Node 18+**, **Python 3.10+**, and either **Docker** or `npx` for n8n.

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # edit later once n8n is running
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Check it at http://localhost:8000/api/health

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173). You'll get a new session automatically, with the session id in the address bar.

### 3. n8n

```bash
docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
# or: npx n8n
```

1. Open http://localhost:5678 and create the local owner account (this stays on your machine).
2. **Workflows ▸ Import from File** and choose `n8n/normalise-product.workflow.json`.
3. Open the **Ask Claude** node and replace `PASTE_YOUR_ANTHROPIC_API_KEY` with your key. Better still, create a **Header Auth** credential named `x-api-key` and select it, so the key isn't saved in the workflow file. Don't commit your key.
4. Toggle the workflow **Active**. The production URL is `http://localhost:5678/webhook/normalise-product`.
5. Put that URL in `backend/.env` as `N8N_NORMALISE_URL`, then restart the backend.

To check it works, use Find item ▸ Add from a shop listing and paste:

```
Alba 3 drawer chest, white oak effect
£79.99
Dimensions: W 70 x D 40 x H 75 cm
```

You should see "Read by the n8n workflow".

The workflow uses the model `claude-haiku-5-5` for speed and cost. You can change it in the **Build Claude request** node.

### 4. HorizonNet (optional, for real scans)

Without this, the phone page still works through **Measurements**, and the desktop has **Try a sample room**. Build and rehearse with those first, then add scanning.

```bash
git clone https://github.com/sunset1995/HorizonNet.git
cd HorizonNet
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt     # installs PyTorch; CPU works, it's just slower
mkdir ckpt
# Download a pretrained model linked in HorizonNet's README.
# resnet50_rnn__mp3d.pth suits ordinary rooms. Save it in ckpt/
```

Then add to `backend/.env`:

```
HORIZONNET_DIR=/absolute/path/to/HorizonNet
HORIZONNET_CKPT=/absolute/path/to/HorizonNet/ckpt/resnet50_rnn__mp3d.pth
HORIZONNET_PYTHON=/absolute/path/to/HorizonNet/.venv/bin/python
```

`/api/health` should now show `"horizonnet": true`. Test with `assets/demo.png` from the HorizonNet repo before using your own photos.

**Getting a 360° photo.** HorizonNet needs a full equirectangular panorama: twice as wide as it is tall, with the floor and ceiling visible all the way round. A phone's normal panorama mode only captures a horizontal strip, which won't work. Options, best first:

- Borrow a 360° camera (Insta360, Ricoh Theta) for the demo.
- Use a phone app that exports full 360° spheres.
- Pre-capture your demo room before the hackathon.

The backend rejects photos that aren't 2:1 with a clear message, and the phone page offers measurements instead.

**How the scan becomes a room.** The backend resizes the photo to 1024×512, then runs HorizonNet's `preprocess.py` (alignment) and `inference.py`. It converts the floor corners to centimetres using the phone height the user entered (`backend/layout.py`). The room is simplified to a rectangle, and the scan point becomes where you stand in **Stand in room** view.

I couldn't run HorizonNet in my environment, so its integration hasn't been tested end to end. The geometry conversion has been tested on a synthetic room. If HorizonNet's output file names differ from what `layout.py` expects (`*_aligned_rgb.png`, then a `.json` result), adjust the two `glob` patterns in `run_horizonnet`.

### Using your phone

The QR code points at your computer's network address, so the phone must be on the same Wi-Fi. University Wi-Fi often blocks device-to-device traffic. If so, use a phone hotspot with the laptop connected to it, or a tunnel:

```bash
cloudflared tunnel --url http://localhost:5173
```

Then put the https address in `frontend/.env` as `VITE_PUBLIC_URL` and restart `npm run dev`. You also need https for **Use phone motion** (gyroscope look-around), because phones only allow motion sensors on secure pages.

## Using the planner

| Action | How |
|---|---|
| Place an item | Drag it from the hotbar onto the floor, or press 1–9 (or click a slot) and then click the floor. Placed items leave the inventory |
| Move | Drag it in Plan view. It snaps to 10 cm and won't pass through walls, other furniture or the door's keep-clear zone (amber) |
| Rotate | Select it, then R |
| Back to inventory | Select it, then Delete |
| Bin | Drag a hotbar slot or a room item onto the bin, or select an item and click the bin. Undo appears for a few seconds |
| All items | E, or the All items button |
| Close or cancel | Esc |
| Look around | Stand in room, then drag (or Use phone motion) |

Grid tiles are 50 cm. Snapping is finer (10 cm) so small items like bedside tables don't waste space.

## How furniture behaves

`frontend/src/lib/furniture.js` describes each kind of furniture: whether it goes against a wall or in the open, what it belongs with, and what space it needs. "Suggest place" uses these rules:

- Chairs face desks and go round dining tables. Bedside tables go beside the bed, the coffee table in front of the sofa, the TV on the wall opposite the sofa, and the shoe rack near the door.
- Wardrobes, cabinets and sideboards keep space in front for their doors to swing (about one door's width). Drawers keep most of their depth plus room to stand.
- Beds, sofas, desks and dining tables keep walking, legroom or chair space clear. Items that belong together, like a chair at a desk, may use each other's space.
- The biggest item is tried against each wall, and the layout with the fewest problems wins. If the room is too tight, items still go in, but they're reported as squeezed.

Select an item to see its clear space shaded on the floor (red if something is in the way), its doors or drawers open, and a warning naming whatever blocks it.

## The money features

- **Budget envelopes.** The budget slider is split into Sleep, Storage, Seating, Tables and desks, and Finishing touches. The split depends on the room type, and an envelope turns red when it's overspent.
- **Real cost after resale.** "Staying for" sets how long you'll stay. Each item shows its price, its estimated resale value when you leave, and the difference: what it really costs you. Second-hand items lose less value, which often makes them cheaper overall.
- **Cost per year of use.** Price divided by expected lifespan, which exposes "buy cheap, buy twice".
- **Cheaper options that fit this spot.** Select an item to see cheaper items of the same kind that fit its footprint. Swap with one click and it stays where it is.
- **Cost heatmap.** Tints furniture from green (cheapest in the room) to red (most expensive), with a key showing the price range.
- **Plan when to buy.** Enter savings, take-home pay, rent and bills, payday and a safety buffer. The plan buys essentials first, then the rest. It charts your balance against your buffer and tells you when you'll be fully furnished.

All estimates are simple and labelled as such. The formulas are in `frontend/src/lib/finance.js`.

## Suggested 3-minute demo

1. **The problem (20s).** First-time movers furnish a flat they'll leave in a year, without knowing what it really costs them or whether they can afford it this month.
2. **Scan (30s).** Show the QR code and send a pre-captured panorama, or measurements, from the phone. The room appears on the laptop.
3. **Suggest (30s).** Set Bedroom, Scandi and £600, then press Suggest items and Suggest place. Everything lands without overlapping and the door stays clear.
4. **The money (60s).** Drag the budget down until an envelope goes red. Select the bed and swap in a cheaper one that fits the same spot. Point at real cost after resale, and show that a second-hand item can cost less overall than a cheap new one.
5. **Plan (30s).** Open Plan when to buy and show the date you'll be fully furnished, without ever dropping below your buffer.
6. **Stand in the room (10s).** Switch to Stand in room and look around.
7. **n8n (optional, 20s).** Paste a real listing from a shop and show the n8n workflow running.

## What changed from the original plan

- **No Supabase.** Sessions are stored by the backend in `backend/data/sessions.json`, and the desktop checks for the phone's scan every 2 seconds. That means one less account and one less thing to break on the day. Supabase realtime is a drop-in upgrade later.
- **Stand-in-room view** starts at the point where you took the scan, not at the exact centre, when scan data is available.

## Troubleshooting

- **"Can't reach the NestEgg server"**: the backend isn't running on port 8000.
- **The QR code shows 127.0.0.1**: set `VITE_PUBLIC_URL` in `frontend/.env` to `http://<your-laptop-ip>:5173`.
- **Phone can't open the link**: see "If the QR code doesn't work" below.
- **Listings use the basic parser**: check the n8n workflow is Active, `N8N_NORMALISE_URL` uses `/webhook/`, not `/webhook-test/`, and the API key is set.
- **"Not enough space to turn it here"**: drag the item somewhere clearer, then rotate.

## If the QR code doesn't work

The QR code is just a link. If typing the same address into the phone's browser doesn't load either, the problem is the network or the firewall, not the browser or the code. Work through these in order:

1. **Check the address.** Compare it with the `Network:` line printed by `npm run dev`. Laptops often have several addresses (Wi-Fi, Ethernet, Docker, WSL, VPN), and only the Wi-Fi one works. The setup screen lets you pick another. If you set `VITE_PUBLIC_URL`, restart `npm run dev` after any change.
2. **Open the firewall for port 5173** (only the frontend; it forwards to the backend itself).
   - Windows: in Settings ▸ Network, set the Wi-Fi to **Private**. Then, in PowerShell as administrator, run:
     `New-NetFirewallRule -DisplayName "NestEgg dev server" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private`
     Also accept the "Allow Node.js" prompt if it appears.
   - Mac: System Settings ▸ Network ▸ Firewall ▸ Options, and allow incoming connections for `node`.
3. **Check the network allows it.** Event and university Wi-Fi (including eduroam) usually stops devices from reaching each other. Turn on a phone hotspot, connect the laptop to it, and use the new address the setup screen shows. This is the most reliable option at a hackathon.
4. **Browser quirks.** If the phone changes `http://` to `https://`, type the address again starting with `http://`. Open the link in Safari or Chrome rather than inside another app.
5. **Still stuck?** Use the tunnel described in "Using your phone". It works on any network.

When the phone page shows **Connected to your computer**, the whole chain works. If it says the phone reached the planner but not the server, start the backend.

## Roadmap ideas for the final slide

Live retailer and second-hand marketplace feeds, scheduled through n8n; price-drop alerts; housemate cost splitting for shared rooms; reminders on payday for the next purchase phase; textured walls from the panorama; and non-rectangular rooms using HorizonNet's full corner polygon, which the backend already returns.
