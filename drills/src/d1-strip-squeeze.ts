import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { certificateOf, platformRoundTrip, writeReport } from "./harness.ts";
import { ROOT } from "./lib.ts";

const seal = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/seal-run-mainnet.json"), "utf8")) as {
  author: string;
  entries: { index: number; revealTx: string }[];
};
let fileHashHits = 0;
let metadataHits = 0;
let pdqHits = 0;
const rows: Record<string, unknown>[] = [];
for (const e of seal.entries) {
  const published = readFileSync(resolve(ROOT, `spikes/out/sealed/${e.index}.jpg`));
  // metadata arm: a credit embedded in EXIF, as an embedded-manifest scheme would carry it
  const credited = await sharp(published)
    .withExif({ IFD0: { Copyright: `credit:${seal.author}`, Artist: "Touchplate demo studio" } })
    .jpeg({ quality: 92 })
    .toBuffer();
  const before = (await sharp(credited).metadata()).exif !== undefined;
  const squeezed = await platformRoundTrip(credited);
  const after = (await sharp(squeezed).metadata()).exif !== undefined;
  const sameHash = createHash("sha256").update(squeezed).digest("hex") === createHash("sha256").update(credited).digest("hex");
  const v = (await certificateOf(squeezed)).verdict;
  const recovered = (v.kind === "MATCHED" || v.kind === "AUTHORED") && v.entry.author.toLowerCase() === seal.author.toLowerCase();
  if (sameHash) fileHashHits++;
  if (after) metadataHits++;
  if (recovered) pdqHits++;
  rows.push({ index: e.index, metadataBefore: before, metadataAfter: after, fileHashSurvives: sameHash, verdict: v.kind, authorRecovered: recovered });
}
const n = seal.entries.length;
writeReport({
  id: "D1",
  title: "Strip and squeeze",
  attack: `Platform round trip (strip metadata, resize to 1080, JPEG q72) on all ${n} images registered on Monad mainnet.`,
  outcome: `File-hash arm survived ${fileHashHits}/${n}; embedded-metadata arm survived ${metadataHits}/${n}; Touchplate recovered the author on ${pdqHits}/${n}.`,
  passed: fileHashHits === 0 && metadataHits === 0 && pdqHits === n,
  txs: seal.entries.map((e) => ({ label: `registered: reveal of image ${e.index}`, hash: e.revealTx as `0x${string}` })),
  data: { rows, note: "platform-style simulation with sharp, not a real platform upload" },
});
