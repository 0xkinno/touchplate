import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { hamming256, pdqFromRgba, type PdqResult } from "./s5-pdq.ts";

const dir = "out/coco";
const ids: string[] = JSON.parse(readFileSync(join(dir, "ids.json"), "utf8")).slice(0, 200);
const THRESHOLD = 31;

async function pdqOf(buf: Buffer): Promise<PdqResult> {
  const { data, info } = await sharp(buf)
    .removeAlpha()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true, kernel: "cubic" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return pdqFromRgba(new Uint8Array(data), info.width, info.height);
}
const long = (w: number, h: number, n: number) => ({ width: w >= h ? n : undefined, height: h > w ? n : undefined });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

type T = (src: Buffer, w: number, h: number) => Promise<Buffer>;
const transforms: Record<string, T> = {
  jpeg70: (s) => sharp(s).jpeg({ quality: 70 }).toBuffer(),
  jpeg50: (s) => sharp(s).jpeg({ quality: 50 }).toBuffer(),
  webp75: (s) => sharp(s).webp({ quality: 75 }).toBuffer(),
  resize1080: (s, w, h) => sharp(s).resize(long(w, h, 1080)).png().toBuffer(),
  resize640: (s, w, h) => sharp(s).resize(long(w, h, 640)).png().toBuffer(),
  crop10: async (s, w, h) => sharp(s).extract({ left: Math.round(w * 0.05), top: Math.round(h * 0.05), width: w - 2 * Math.round(w * 0.05), height: h - 2 * Math.round(h * 0.05) }).png().toBuffer(),
  crop20: async (s, w, h) => sharp(s).extract({ left: Math.round(w * 0.1), top: Math.round(h * 0.1), width: w - 2 * Math.round(w * 0.1), height: h - 2 * Math.round(h * 0.1) }).png().toBuffer(),
  bright_up: (s) => sharp(s).modulate({ brightness: 1.15 }).jpeg({ quality: 92 }).toBuffer(),
  flip_h: (s) => sharp(s).flop().jpeg({ quality: 92 }).toBuffer(),
  platform_roundtrip: async (s, w, h) => {
    const r = await sharp(s).resize(long(w, h, 1080)).png().toBuffer();
    return sharp(r).jpeg({ quality: 72 }).toBuffer();
  },
};

const originals: { buf: Buffer; w: number; h: number; pdq: PdqResult }[] = [];
for (const id of ids) {
  const buf = readFileSync(join(dir, id));
  const m = await sharp(buf).metadata();
  originals.push({ buf, w: m.width ?? 0, h: m.height ?? 0, pdq: await pdqOf(buf) });
}
const minDih = (q: PdqResult, ref: PdqResult) => Math.min(...q.dihedral.map((h) => hamming256(h, ref.hash)));

const perTransform: Record<string, { n: number; pdqRecall: number; pdqRecallNoDihedral: number; sha256Match: number; medianDistance: number }> = {};
for (const [name, fn] of Object.entries(transforms)) {
  let hit = 0, hitPlain = 0, shaSame = 0;
  const dist: number[] = [];
  for (const o of originals) {
    const out = await fn(o.buf, o.w, o.h);
    const q = await pdqOf(out);
    const d = hamming256(q.hash, o.pdq.hash);
    dist.push(d);
    if (d <= THRESHOLD) hitPlain++;
    if (minDih(q, o.pdq) <= THRESHOLD) hit++;
    if (sha(out) === sha(o.buf)) shaSame++;
  }
  dist.sort((a, b) => a - b);
  perTransform[name] = {
    n: originals.length,
    pdqRecall: hit / originals.length,
    pdqRecallNoDihedral: hitPlain / originals.length,
    sha256Match: shaSame / originals.length,
    medianDistance: dist[Math.floor(dist.length / 2)],
  };
}

let pairs = 0, falseMatches = 0, minSeen = 256;
const quality = originals.filter((o) => o.pdq.quality >= 50);
for (let i = 0; i < quality.length; i++) {
  for (let j = i + 1; j < quality.length; j++) {
    pairs++;
    const d = Math.min(...quality[j].pdq.dihedral.map((h) => hamming256(h, quality[i].pdq.hash)));
    if (d < minSeen) minSeen = d;
    if (d <= THRESHOLD) falseMatches++;
  }
}
const out = {
  corpus: "COCO val2017 first 200 files",
  threshold: THRESHOLD,
  note: "platform-style simulations with sharp; not real platform uploads",
  perTransform,
  distractorPairs: { imagesWithQualityAtLeast50: quality.length, pairs, falseMatchesAtThreshold: falseMatches, falseMatchRate: falseMatches / pairs, smallestPairDistance: minSeen },
};
writeFileSync("s5-roundtrip.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
