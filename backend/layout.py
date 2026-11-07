"""
Room layout estimation from a 360-degree panorama using HorizonNet.

HorizonNet (https://github.com/sunset1995/HorizonNet) predicts the room's
corners from a single equirectangular panorama. We run its own scripts as
subprocesses (so its PyTorch dependencies stay out of this app's environment),
then convert the predicted floor corners into real-world centimetres using the
height the phone was held at.

Environment variables:
  HORIZONNET_DIR     path to the cloned HorizonNet repo
  HORIZONNET_CKPT    path to a pretrained checkpoint, e.g. ckpt/resnet50_rnn__mp3d.pth
  HORIZONNET_PYTHON  python executable that has HorizonNet's requirements (defaults to this one)
"""

import glob
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path


class LayoutError(Exception):
    """Raised with a message that is safe to show the user."""


def horizonnet_status():
    repo = os.environ.get("HORIZONNET_DIR")
    ckpt = os.environ.get("HORIZONNET_CKPT")
    if not repo or not Path(repo, "inference.py").exists():
        return False, "HorizonNet isn't installed on the server (set HORIZONNET_DIR)."
    if not ckpt or not Path(ckpt).exists():
        return False, "HorizonNet checkpoint not found (set HORIZONNET_CKPT)."
    return True, "ready"


def _run(cmd, cwd, timeout):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
        raise LayoutError("Layout model failed: " + " | ".join(tail))


def run_horizonnet(image_path):
    ok, reason = horizonnet_status()
    if not ok:
        raise LayoutError(reason)

    repo = os.environ["HORIZONNET_DIR"]
    ckpt = os.path.abspath(os.environ["HORIZONNET_CKPT"])
    py = os.environ.get("HORIZONNET_PYTHON", sys.executable)

    work = tempfile.mkdtemp(prefix="nestegg_pano_")
    src = os.path.join(work, "pano.png")

    # HorizonNet expects a 2:1 equirectangular image at 1024x512.
    try:
        from PIL import Image
    except ImportError as e:
        raise LayoutError("Pillow is required for panorama processing (pip install pillow).") from e
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if abs(w / h - 2.0) > 0.15:
        raise LayoutError(
            f"This photo is {w}x{h}. A full 360° panorama is twice as wide as it is tall "
            "(equirectangular). Use a 360° capture, or enter measurements instead."
        )
    img.resize((1024, 512)).save(src)

    pre_dir = os.path.join(work, "pre")
    inf_dir = os.path.join(work, "inf")
    os.makedirs(pre_dir)
    os.makedirs(inf_dir)

    # 1) Align the panorama to the room's vanishing points (Manhattan alignment).
    _run([py, "preprocess.py", "--img_glob", src, "--output_dir", pre_dir], repo, 240)
    aligned = glob.glob(os.path.join(pre_dir, "*_aligned_rgb.png"))
    if not aligned:
        raise LayoutError("Couldn't align the panorama. Try a sharper, level photo.")

    # 2) Predict the layout.
    _run([py, "inference.py", "--pth", ckpt, "--img_glob", aligned[0],
          "--output_dir", inf_dir], repo, 240)
    results = glob.glob(os.path.join(inf_dir, "*.json"))
    if not results:
        raise LayoutError("The layout model produced no result.")
    with open(results[0]) as f:
        return json.load(f)


def layout_to_room(layout, camera_height_cm=150.0):
    """
    Convert HorizonNet output ({"z0", "z1", "uv": [[u, v], ...]}, u/v in 0..1)
    into a rectangular room in centimetres.

    Floor corners sit below the horizon (v > 0.5). For a floor point seen at
    latitude phi (negative = looking down), its horizontal distance from the
    camera is camera_height / tan(-phi).
    """
    uv = layout.get("uv") or []
    floor = [(u, v) for u, v in uv if v > 0.5]
    if len(floor) < 3:
        raise LayoutError("Couldn't find enough floor corners. Make sure the floor is visible all the way round.")

    pts = []
    for u, v in floor:
        theta = (u - 0.5) * 2 * math.pi        # longitude
        phi = (0.5 - v) * math.pi               # latitude, negative below horizon
        if phi >= -0.02:
            continue
        r = camera_height_cm / math.tan(-phi)
        pts.append((r * math.sin(theta), r * math.cos(theta)))
    if len(pts) < 3:
        raise LayoutError("The floor corners were too close to the horizon to measure.")

    # Sort corners around the camera, then find the dominant wall direction
    # (circular mean of edge angles modulo 90 degrees) and rotate to align it.
    pts.sort(key=lambda p: math.atan2(p[0], p[1]))
    sx = sy = 0.0
    for i in range(len(pts)):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % len(pts)]
        length = math.hypot(x2 - x1, z2 - z1)
        a = math.atan2(z2 - z1, x2 - x1)
        sx += length * math.cos(4 * a)
        sy += length * math.sin(4 * a)
    rot = math.atan2(sy, sx) / 4
    c, s = math.cos(-rot), math.sin(-rot)
    aligned = [(x * c - z * s, x * s + z * c) for x, z in pts]

    xs = [p[0] for p in aligned]
    zs = [p[1] for p in aligned]
    min_x, max_x, min_z, max_z = min(xs), max(xs), min(zs), max(zs)
    width, depth = max_x - min_x, max_z - min_z

    # Ceiling height from the model's ceiling/floor ratio (camera at 0).
    z0, z1 = abs(float(layout.get("z0", 0) or 0)), abs(float(layout.get("z1", 0) or 0))
    height = camera_height_cm * (z0 + z1) / z1 if z0 and z1 else 240.0
    height = min(max(height, 200.0), 350.0)

    if not (120 <= width <= 1500 and 120 <= depth <= 1500):
        raise LayoutError(
            f"The estimate ({width:.0f} x {depth:.0f} cm) looks wrong. "
            "Check the phone height, or enter measurements instead."
        )

    return {
        "width": round(width),
        "depth": round(depth),
        "height": round(height),
        "standPoint": {"x": round(-min_x), "z": round(-min_z)},
        "polygon": [{"x": round(x - min_x), "z": round(z - min_z)} for x, z in aligned],
        "source": "horizonnet",
        "note": "Estimated from your panorama. Irregular rooms are simplified to a rectangle.",
    }


def estimate_room(image_path, camera_height_cm=150.0):
    return layout_to_room(run_horizonnet(image_path), camera_height_cm)
