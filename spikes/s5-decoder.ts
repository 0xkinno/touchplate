import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { hamming256, pdqFromRgba } from "./s5-pdq.ts";

interface Row {
  name: string;
  width: number;
  height: number;
  pyRef: { hash: `0x${string}` };
}

const fixtureDir = process.env.PDQ_FIXTURE_DIR;
if (!fixtureDir) throw new Error("PDQ_FIXTURE_DIR is required");
const man: Row[] = JSON.parse(readFileSync("out/s5/manifest.json", "utf8"));
const files = man.filter((m) => !m.name.startsWith("syn-"));
const kernels = ["cubic", "lanczos3", "mitchell", "linear"] as const;

const out: Record<string, { n: number; exact: number; max: number; mean: number; over2: number }> = {};
for (const kernel of kernels) {
  const d: number[] = [];
  for (const f of files) {
    const { data, info } = await sharp(join(fixtureDir, f.name))
      .rotate(0)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true, kernel })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const r = pdqFromRgba(new Uint8Array(data), info.width, info.height);
    d.push(hamming256(r.hash, f.pyRef.hash));
  }
  out[kernel] = {
    n: d.length,
    exact: d.filter((x) => x === 0).length,
    max: Math.max(...d),
    mean: Number((d.reduce((a, b) => a + b, 0) / d.length).toFixed(2)),
    over2: d.filter((x) => x > 2).length,
  };
}
writeFileSync("s5-decoder.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
