"""Fetches the benchmark corpus: COCO val2017 files 1000..2299 (300 registered, 1000 distractors) by HTTP range."""
import json, os
from remotezip import RemoteZip

URL = "http://images.cocodataset.org/zips/val2017.zip"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "coco")
os.makedirs(OUT, exist_ok=True)
with RemoteZip(URL) as z:
    names = sorted(n for n in z.namelist() if n.lower().endswith(".jpg"))
    pick = names[1000:2300]
    for n in pick:
        dest = os.path.join(OUT, os.path.basename(n))
        if not os.path.exists(dest):
            with open(dest, "wb") as fh:
                fh.write(z.read(n))
json.dump({"registered": [os.path.basename(n) for n in pick[:300]], "distractors": [os.path.basename(n) for n in pick[300:]]},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "split.json"), "w"), indent=1)
print("fetched", len(pick))
