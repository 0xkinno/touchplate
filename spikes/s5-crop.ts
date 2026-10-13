import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { hamming256, pdqFromRgba, type PdqResult } from "./s5-pdq.ts";

const dir = "out/coco";
const ids: string[] = JSON.parse(readFileSync(join(dir, "ids.json"), "utf8")).slice(0, 100);
const THRESHOLD = 31;
async function pdqOf(buf: Buffer): Promise<PdqResult> {
  const { data, info } = await sharp(buf).removeAlpha().resize(512, 512, { fit: "inside", withoutEnlargement: true, kernel: "cubic" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return pdqFromRgba(new Uint8Array(data), info.width, info.height);
}
const originals: { buf: Buffer; w: number; h: number; pdq: PdqResult }[] = [];
for (const id of ids) {
  const buf = readFileSync(join(dir, id));
  const m = await sharp(buf).metadata();
  originals.push({ buf, w: m.width ?? 0, h: m.height ?? 0, pdq: await pdqOf(buf) });
}
// perSidePct: fraction removed from each edge. Also an asymmetric "one edge" crop (typical screenshot trim).
const sides = [0.005, 0.01, 0.02, 0.03, 0.05, 0.1];
const rows: { kind: string; perSidePct: number; totalPctPerAxis: number; recall: number; medianDistance: number }[] = [];
for (const kind of ["all-edges", "bottom-only"] as const) {
  for (const s of sides) {
    let hit = 0;
    const dist: number[] = [];
    for (const o of originals) {
      const dx = Math.round(o.w * s), dy = Math.round(o.h * s);
      const region = kind === "all-edges"
        ? { left: dx, top: dy, width: o.w - 2 * dx, height: o.h - 2 * dy }
        : { left: 0, top: 0, width: o.w, height: o.h - dy };
      const q = await pdqOf(await sharp(o.buf).extract(region).png().toBuffer());
      const d = Math.min(...q.dihedral.map((h) => hamming256(h, o.pdq.hash)));
      dist.push(d);
      if (d <= THRESHOLD) hit++;
    }
    dist.sort((a, b) => a - b);
    rows.push({ kind, perSidePct: s * 100, totalPctPerAxis: kind === "all-edges" ? s * 200 : s * 100, recall: hit / originals.length, medianDistance: dist[Math.floor(dist.length / 2)] });
  }
}
writeFileSync("s5-crop.json", JSON.stringify({ corpus: "COCO val2017 first 100 files", threshold: THRESHOLD, rows }, null, 2));
console.table(rows);
