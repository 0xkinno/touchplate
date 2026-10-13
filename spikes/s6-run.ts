import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { detect, embed, psnr } from "./s6-mark.ts";

const dir = "out/coco";
const ids: string[] = JSON.parse(readFileSync(join(dir, "ids.json"), "utf8"));
const marked = ids.slice(0, 20);
const unmarked = ids.slice(20, 220);
const seed = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 255);
const wrongSeed = new Uint8Array(32).map((_, i) => (i * 91 + 5) & 255);

async function load(f: string): Promise<{ rgb: Uint8Array; w: number; h: number }> {
  const { data, info } = await sharp(join(dir, f)).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  return { rgb: new Uint8Array(data), w: info.width, h: info.height };
}
const raw = (rgb: Uint8Array, w: number, h: number) => sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } });
async function decode(buf: Buffer): Promise<{ rgb: Uint8Array; w: number; h: number }> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgb: new Uint8Array(data), w: info.width, h: info.height };
}

const transforms: Record<string, (rgb: Uint8Array, w: number, h: number) => Promise<{ rgb: Uint8Array; w: number; h: number }>> = {
  none: async (rgb, w, h) => ({ rgb, w, h }),
  jpeg90: async (rgb, w, h) => decode(await raw(rgb, w, h).jpeg({ quality: 90 }).toBuffer()),
  jpeg70: async (rgb, w, h) => decode(await raw(rgb, w, h).jpeg({ quality: 70 }).toBuffer()),
  jpeg50: async (rgb, w, h) => decode(await raw(rgb, w, h).jpeg({ quality: 50 }).toBuffer()),
  webp75: async (rgb, w, h) => decode(await raw(rgb, w, h).webp({ quality: 75 }).toBuffer()),
  resize1080: async (rgb, w, h) => decode(await raw(rgb, w, h).resize(w >= h ? 1080 : null, h > w ? 1080 : null).png().toBuffer()),
  resize640: async (rgb, w, h) => decode(await raw(rgb, w, h).resize(w >= h ? 640 : null, h > w ? 640 : null).png().toBuffer()),
  jpeg70_resize1080: async (rgb, w, h) => {
    const j = await decode(await raw(rgb, w, h).jpeg({ quality: 70 }).toBuffer());
    return decode(await raw(j.rgb, j.w, j.h).resize(j.w >= j.h ? 1080 : null, j.h > j.w ? 1080 : null).png().toBuffer());
  },
  platform_roundtrip: async (rgb, w, h) => {
    const r = await decode(await raw(rgb, w, h).resize(w >= h ? 1080 : null, h > w ? 1080 : null).png().toBuffer());
    return decode(await raw(r.rgb, r.w, r.h).jpeg({ quality: 72 }).toBuffer());
  },
  crop10pct: async (rgb, w, h) => {
    const dx = Math.round(w * 0.05), dy = Math.round(h * 0.05);
    return decode(await raw(rgb, w, h).extract({ left: dx, top: dy, width: w - 2 * dx, height: h - 2 * dy }).png().toBuffer());
  },
};

const stat = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return { n: s.length, min: +s[0].toFixed(2), p10: +s[Math.floor(s.length * 0.1)].toFixed(2), median: +s[Math.floor(s.length / 2)].toFixed(2), max: +s[s.length - 1].toFixed(2) };
};

const psnrs: number[] = [];
const zByTransform: Record<string, number[]> = {};
const zWrongSeed: number[] = [];
for (const f of marked) {
  const { rgb, w, h } = await load(f);
  const e = embed(rgb, w, h, 3, seed);
  psnrs.push(psnr(rgb, e.rgb));
  for (const [name, fn] of Object.entries(transforms)) {
    const t = await fn(e.rgb, w, h);
    (zByTransform[name] ??= []).push(detect(t.rgb, t.w, t.h, 3, seed));
  }
  zWrongSeed.push(detect(e.rgb, w, h, 3, wrongSeed));
  process.stdout.write(".");
}
console.log();
const zUnmarked: number[] = [];
const zUnmarkedJpeg: number[] = [];
for (const f of unmarked) {
  const { rgb, w, h } = await load(f);
  zUnmarked.push(detect(rgb, w, h, 3, seed));
  const t = await transforms.jpeg70_resize1080(rgb, w, h);
  zUnmarkedJpeg.push(detect(t.rgb, t.w, t.h, 3, seed));
}
const result = {
  corpus: "COCO val2017 first 220 files (sorted); 20 marked, 200 unmarked",
  markedImages: marked.length,
  unmarkedImages: unmarked.length,
  psnrDb: stat(psnrs),
  zMarked: Object.fromEntries(Object.entries(zByTransform).map(([k, v]) => [k, stat(v)])),
  zMarkedWrongSeed: stat(zWrongSeed),
  zUnmarkedOriginal: stat(zUnmarked),
  zUnmarkedAfterJpeg70Resize1080: stat(zUnmarkedJpeg),
  passPsnr40: psnrs.every((p) => p >= 40),
  passZ6AfterJpeg70AndResize1080: zByTransform.jpeg70.every((z) => z >= 6) && zByTransform.resize1080.every((z) => z >= 6) && zByTransform.jpeg70_resize1080.every((z) => z >= 6),
  passUnmarkedZBelow3: zUnmarked.every((z) => Math.abs(z) < 3) && zUnmarkedJpeg.every((z) => Math.abs(z) < 3),
};
writeFileSync("s6-watermark.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
