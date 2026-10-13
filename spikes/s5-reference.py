"""S5 reference side.

Decodes each image once with PIL, hashes the same pixels with
(a) the pure-Python PDQHasher (source of truth) and
(b) the pdqhash C++ binding, then writes raw RGB plus expected hashes.

Env: PDQ_PY_DIR (folder containing the pdqhashing package), PDQ_FIXTURE_DIR (images).
"""
import hashlib
import io
import json
import os
import sys

import numpy as np
import pdqhash
from PIL import Image

sys.path.insert(0, os.environ["PDQ_PY_DIR"])
from pdqhashing.hasher.pdq_hasher import PDQHasher  # noqa: E402
from pdqhashing.utils.matrix import MatrixUtil  # noqa: E402

FIX_DIR = os.environ["PDQ_FIXTURE_DIR"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "s5")
os.makedirs(OUT, exist_ok=True)


def synthetic():
    rng = np.random.default_rng(20261013)
    yy, xx = np.mgrid[0:512, 0:512]
    g = np.linspace(0, 255, 600).astype(np.uint8)
    return [
        ("syn-noise", rng.integers(0, 256, (480, 640, 3), dtype=np.uint8)),
        ("syn-gradient-h", np.stack([np.tile(g, (400, 1))] * 3, axis=2)),
        ("syn-checker", np.stack([(((yy // 32 + xx // 32) % 2) * 255).astype(np.uint8)] * 3, axis=2)),
        ("syn-rings", np.stack([(127 + 127 * np.sin(np.hypot(yy - 256, xx - 256) / 9)).astype(np.uint8)] * 3, axis=2)),
        ("syn-blocks", np.kron(rng.integers(0, 256, (8, 8, 3), dtype=np.uint8), np.ones((50, 60, 1), dtype=np.uint8))),
        ("syn-diag", np.stack([((yy + xx) % 256).astype(np.uint8), (xx % 256).astype(np.uint8), (yy % 256).astype(np.uint8)], axis=2)),
    ]


def to_hex(bits):
    n = 0
    for k, b in enumerate(list(bits)[::-1]):  # binding emits MSB-first
        if b:
            n |= 1 << k
    return "0x%064x" % n


items = []
for root, _, files in sorted(os.walk(FIX_DIR)):
    for f in sorted(files):
        if f.lower().endswith((".jpg", ".jpeg", ".png")):
            rel = os.path.relpath(os.path.join(root, f), FIX_DIR).replace("\\", "/")
            items.append((rel, os.path.join(root, f), None))
for name, arr in synthetic():
    items.append((name, None, arr))

hasher = PDQHasher()
manifest = []
for i, (name, path, arr) in enumerate(items[:50]):
    if arr is None:
        img = Image.open(path)
        img.thumbnail((512, 512))
        arr = np.array(img.convert("RGB"), dtype=np.uint8)
    if max(arr.shape[:2]) > 512:
        t = Image.fromarray(arr, "RGB")
        t.thumbnail((512, 512))
        arr = np.array(t, dtype=np.uint8)
    h, w, _ = arr.shape
    fn = "%02d.rgb" % i
    with open(os.path.join(OUT, fn), "wb") as fh:
        fh.write(arr.tobytes())
    pil = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    png = buf.getvalue()

    single = hasher.fromBufferedImage(io.BytesIO(png))
    d = hasher.dihedralFromBufferedImage(
        Image.open(io.BytesIO(png)),
        MatrixUtil.allocateMatrixAsRowMajorArray(h, w),
        MatrixUtil.allocateMatrixAsRowMajorArray(h, w),
        MatrixUtil.allocateMatrix(64, 64),
        MatrixUtil.allocateMatrix(16, 64),
        MatrixUtil.allocateMatrix(16, 16),
        MatrixUtil.allocateMatrix(16, 16),
        0xFF,
    )
    order = (d.hash, d.hashRotate90, d.hashRotate180, d.hashRotate270,
             d.hashFlipX, d.hashFlipY, d.hashFlipPlus1, d.hashFlipMinus1)
    vec, q = pdqhash.compute(arr)
    cvecs, _cqs = pdqhash.compute_dihedral(arr)
    manifest.append({
        "index": i, "name": name, "width": w, "height": h, "rgbFile": fn,
        "rgbSha256": hashlib.sha256(arr.tobytes()).hexdigest(),
        "pyRef": {
            "hash": "0x" + str(single.getHash()),
            "quality": int(single.getQuality()),
            "dihedral": ["0x" + str(x) for x in order],
        },
        "cpp": {
            "hash": to_hex(vec),
            "quality": int(q),
            "dihedral": [to_hex(v) for v in cvecs],
        },
    })
    print(i, name, w, h, manifest[-1]["pyRef"]["hash"][:18], manifest[-1]["pyRef"]["quality"], flush=True)

with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=1)
print("wrote", len(manifest))
