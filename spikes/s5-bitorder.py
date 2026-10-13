import json, itertools
import numpy as np
m = json.load(open("out/s5/manifest.json"))
def bits(h):  # integer bit k -> array[k]
    n = int(h, 16); return np.array([(n >> k) & 1 for k in range(256)], dtype=np.uint8)
def ham(a, b): return int((a != b).sum())
cands = {
  "identity": lambda b: b,
  "reverse": lambda b: b[::-1],
  "transpose16": lambda b: b.reshape(16,16).T.reshape(256),
  "flip_rows": lambda b: b.reshape(16,16)[::-1].reshape(256),
  "flip_cols": lambda b: b.reshape(16,16)[:, ::-1].reshape(256),
  "word_rev": lambda b: b.reshape(16,16)[::-1, :].reshape(256),
  "invert": lambda b: 1 - b,
  "invert_reverse": lambda b: 1 - b[::-1],
}
for name, f in cands.items():
    ds = [ham(bits(r["pyRef"]["hash"]), f(bits(r["cpp"]["hash"]))) for r in m]
    print(f"{name:16s} mean={np.mean(ds):6.1f} min={min(ds)} max={max(ds)}")
# internal consistency: pairwise distance preserved?
a, b = m[0], m[7]
print("py dist orig-shrink", ham(bits(a["pyRef"]["hash"]), bits(b["pyRef"]["hash"])), " cpp dist", ham(bits(a["cpp"]["hash"]), bits(b["cpp"]["hash"])))
