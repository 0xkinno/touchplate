import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { detect, hamming256, pdqFromRgba } from "@touchplate/core";
import { certificateOf, writeReport } from "./harness.ts";
import { ROOT } from "./lib.ts";

const W = 320;
const H = 240;
const seal = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/seal-run-mainnet.json"), "utf8")) as { entries: { index: number; pdq: string; commitment: string; revealTx: string }[] };
const secrets = JSON.parse(readFileSync(resolve(ROOT, "spikes/out/sealed/secrets.json"), "utf8")) as { seeds: string[] };
const target = seal.entries[0];
const coco: string[] = JSON.parse(readFileSync(resolve(ROOT, "spikes/out/coco/ids.json"), "utf8"));
const start = await sharp(readFileSync(resolve(ROOT, "spikes/out/coco", coco[8]))).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
const rgb = new Uint8Array(start);
const rgba = (px: Uint8Array): Uint8Array => {
  const o = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    o[i * 4] = px[i * 3];
    o[i * 4 + 1] = px[i * 3 + 1];
    o[i * 4 + 2] = px[i * 3 + 2];
    o[i * 4 + 3] = 255;
  }
  return o;
};
const dist = (px: Uint8Array): number => hamming256(pdqFromRgba(rgba(px), W, H).hash, target.pdq as `0x${string}`);

// Black-box hill climbing: only the fingerprint distance is observed.
let best = dist(rgb);
const startDistance = best;
let state = 12345;
const rnd = (): number => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
const ITER = Number(process.env.FORGE_ITER ?? 4000);
for (let it = 0; it < ITER && best > 12; it++) {
  const bw = 16 + Math.floor(rnd() * 48);
  const bh = 16 + Math.floor(rnd() * 48);
  const x0 = Math.floor(rnd() * (W - bw));
  const y0 = Math.floor(rnd() * (H - bh));
  const delta = Math.round((rnd() - 0.5) * 120);
  const saved: [number, number][] = [];
  for (let y = y0; y < y0 + bh; y++) {
    for (let x = x0; x < x0 + bw; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * W + x) * 3 + c;
        saved.push([i, rgb[i]]);
        rgb[i] = Math.max(0, Math.min(255, rgb[i] + delta));
      }
    }
  }
  const d = dist(rgb);
  if (d <= best) best = d;
  else for (const [i, v] of saved) rgb[i] = v;
}
const forged = await sharp(Buffer.from(rgb), { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
const cert = await certificateOf(forged);
const seed = Uint8Array.from(Buffer.from(secrets.seeds[0].slice(2), "hex"));
const z = detect(rgb, W, H, 3, seed);
const matched = cert.verdict.kind === "MATCHED";
writeReport({
  id: "D6",
  title: "Collision forgery",
  attack: `Black-box hill climbing (${ITER} iterations, fingerprint distance only) perturbs an unrelated photograph until its PDQ approaches a registered image's.`,
  outcome: `Distance went from ${startDistance} to ${best} (threshold 31). Verdict on the forged image: ${cert.verdict.kind}. Watermark z against the registered image's seed: ${z.toFixed(2)} (decision threshold 6), so it can never be AUTHORED.`,
  passed: z < 6 && cert.verdict.kind !== "AUTHORED",
  txs: [{ label: "target entry reveal", hash: target.revealTx as `0x${string}` }],
  data: { startDistance, bestDistance: best, iterations: ITER, verdict: cert.verdict.kind, reachedMatched: matched, markZ: z, target: target.commitment },
});
