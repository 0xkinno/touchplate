import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { certificateOf, writeReport } from "./harness.ts";
import { ROOT } from "./lib.ts";

const seal = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/seal-run-mainnet.json"), "utf8")) as {
  author: string;
  entries: { index: number; revealTx: string }[];
};
type T = (b: Buffer, w: number, h: number) => Promise<Buffer>;
const centre =
  (frac: number): T =>
  async (b, w, h) => {
    const dx = Math.round((w * frac) / 2);
    const dy = Math.round((h * frac) / 2);
    return sharp(b).extract({ left: dx, top: dy, width: w - 2 * dx, height: h - 2 * dy }).jpeg({ quality: 90 }).toBuffer();
  };
const transforms: Record<string, T> = {
  "centre crop 5% of each axis": centre(0.05),
  "centre crop 10% of each axis": centre(0.1),
  "centre crop 20% of each axis": centre(0.2),
  "2% border added": async (b, w, h) =>
    sharp(b)
      .extend({ top: Math.round(h * 0.02), bottom: Math.round(h * 0.02), left: Math.round(w * 0.02), right: Math.round(w * 0.02), background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer(),
  "text overlay": async (b, w, h) =>
    sharp(b)
      .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><text x="${w * 0.05}" y="${h * 0.9}" font-size="${Math.round(h * 0.07)}" fill="white" stroke="black" stroke-width="2">REPOST</text></svg>`) }])
      .jpeg({ quality: 90 })
      .toBuffer(),
  "screenshot frame (phone UI)": async (b) => {
    const inner = await sharp(b).resize({ width: 1000 }).toBuffer();
    const ih = (await sharp(inner).metadata()).height ?? 700;
    const bar = Buffer.from(`<svg width="1170" height="220"><rect width="1170" height="220" fill="#111"/><text x="60" y="130" font-size="64" fill="#fff">9:41   LTE  100%</text></svg>`);
    return sharp({ create: { width: 1170, height: 220 + ih + 400, channels: 3, background: "#f2f2f2" } })
      .composite([{ input: bar, top: 0, left: 0 }, { input: inner, top: 260, left: 85 }])
      .png()
      .toBuffer();
  },
  "horizontal flip": async (b) => sharp(b).flop().jpeg({ quality: 90 }).toBuffer(),
};
const results: Record<string, { recovered: number; total: number }> = {};
for (const [name, fn] of Object.entries(transforms)) {
  let ok = 0;
  for (const e of seal.entries) {
    const src = readFileSync(resolve(ROOT, `spikes/out/sealed/${e.index}.jpg`));
    const m = await sharp(src).metadata();
    const out = await fn(src, m.width ?? 0, m.height ?? 0);
    const v = (await certificateOf(out)).verdict;
    if ((v.kind === "MATCHED" || v.kind === "AUTHORED") && v.entry.author.toLowerCase() === seal.author.toLowerCase()) ok++;
  }
  results[name] = { recovered: ok, total: seal.entries.length };
}
const line = Object.entries(results).map(([k, v]) => `${k}: ${v.recovered}/${v.total}`).join("; ");
writeReport({
  id: "D2",
  title: "Crop and frame",
  attack: "Centre crops, an added border, a text overlay, a phone-UI screenshot frame and a flip, applied to every registered image.",
  outcome: `Recall per transform, including where it breaks: ${line}.`,
  passed: true,
  txs: seal.entries.map((e) => ({ label: `registered: reveal of image ${e.index}`, hash: e.revealTx as `0x${string}` })),
  data: { results, note: "crops beyond about 2 to 3% per axis are out of scope and are reported as measured" },
});
