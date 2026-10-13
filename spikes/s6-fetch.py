import os, json
from remotezip import RemoteZip
URL = "http://images.cocodataset.org/zips/val2017.zip"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "coco")
with RemoteZip(URL) as z:
    names = sorted(n for n in z.namelist() if n.lower().endswith(".jpg"))
    print("images in zip:", len(names))
    pick = names[:220]
    for n in pick:
        dest = os.path.join(OUT, os.path.basename(n))
        if not os.path.exists(dest):
            with open(dest, "wb") as fh: fh.write(z.read(n))
json.dump([os.path.basename(n) for n in pick], open(os.path.join(OUT, "ids.json"), "w"))
print("fetched", len(pick))
