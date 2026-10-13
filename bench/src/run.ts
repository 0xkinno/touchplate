/**
 * Benchmark: 300 images registered on Monad mainnet through the real flow (batched touches, then reveals), 50 of
 * them also registered later by a thief, 1,000 distractors, 19 platform-style transforms, four arms plus controls.
 * Stages are resumable: bench/data/registration.json is written after registration.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { decide, detect, embed, hamming256, toEntryRefs, type EntryRef, type PdqResult } from "@touchplate/core";
import type { Hex } from "viem";
import { fund, newActor, platformRoundTrip, register, registry, reveal, seal, type Actor } from "../../drills/src/harness.ts";
import { ROOT, pdqOf, pub } from "../../drills/src/lib.ts";

const DATA = resolve(ROOT, "bench/data");
const RESULTS = resolve(ROOT, "bench/results");
mkdirSync(resolve(DATA, "published"), { recursive: true });
mkdirSync(RESULTS, { recursive: true });
const split = JSON.parse(readFileSync(resolve(DATA, "split.json"), "utf8")) as { registered: string[]; distractors: string[] };
const load = (n: string): Buffer => readFileSync(resolve(DATA, "coco", n));

interface Reg {
  name: string;
  index: number;
  author: string;
  commitment: Hex;
  pdq: Hex;
  seedHex: Hex;
  publishedFile: string;
  revealTx: Hex;
  touchTx: Hex;
}
interface Registration { registered: Reg[]; thieves: Reg[] }
const REG_FILE = resolve(DATA, "registration.json");

// ------------------------------------------------------------------ registration
async function registerAll(): Promise<Registration> {
  const STUDIOS = 6;
  const PER = 50;
  const actors: Actor[] = Array.from({ length: STUDIOS }, (_, i) => newActor(`bench-studio-${i + 1}`));
  const thief = newActor("bench-thief");
  await fund([...actors.map((a) => a.account.address), thief.account.address], 1.0);
  const registered: Reg[] = [];
  const stolenSources: { name: string; buf: Buffer; index: number }[] = [];
  const runStudio = async (a: Actor, k: number): Promise<void> => {
    await register(a);
    const names = split.registered.slice(k * PER, (k + 1) * PER);
    const s = await seal(a, names.map((n) => ({ name: n, buf: load(n) })));
    const rev = await reveal(a, s);
    s.prepared.forEach((p, j) => {
      const index = k * PER + j;
      const file = `published/${index}.jpg`;
      writeFileSync(resolve(DATA, file), p.published);
      registered.push({
        name: names[j], index, author: a.account.address, commitment: p.commitment, pdq: p.pdq.hash,
        seedHex: `0x${Buffer.from(p.markSeed).toString("hex")}`, publishedFile: file, revealTx: rev[j].hash, touchTx: s.touch.hash,
      });
      if (index < 50) stolenSources.push({ name: names[j], buf: p.published, index });
    });
  };
  const queue = actors.map((a, k) => ({ a, k }));
  const workers = Array.from({ length: 3 }, async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      await runStudio(item.a, item.k);
    }
  });
  await Promise.all(workers);
  registered.sort((x, y) => x.index - y.index);

  const out = { registered, thieves: [] as Reg[] };
  writeFileSync(REG_FILE, JSON.stringify(out, null, 1));
  return out;
}

async function registerThief(registered: Reg[]): Promise<Reg[]> {
  const thief = newActor("bench-thief");
  await fund([thief.account.address], 1.0);
  const bal = await pub.getBalance({ address: thief.account.address });
  if (bal === 0n) throw new Error("thief funding did not arrive");
  await new Promise((r) => setTimeout(r, 15_000));
  await register(thief);
  const copies = await Promise.all(
    registered.filter((r) => r.index < 50).map(async (r) => ({
      name: `stolen-${r.name}`, buf: await platformRoundTrip(readFileSync(resolve(DATA, r.publishedFile))), index: r.index,
    })),
  );
  const ts = await seal(thief, copies.map((c) => ({ name: c.name, buf: c.buf })));
  const trev = await reveal(thief, ts);
  return ts.prepared.map((p, j) => ({
    name: copies[j].name, index: copies[j].index, author: thief.account.address, commitment: p.commitment, pdq: p.pdq.hash,
    seedHex: "0x" as Hex, publishedFile: "", revealTx: trev[j].hash, touchTx: ts.touch.hash,
  }));
}

/** Rebuilds the registered list from chain logs and the published files when local state was lost. */
async function reconstruct(): Promise<Reg[]> {
  const { snap } = await registry();
  const byPdq = new Map(snap.revealed.map((r) => [r.pdq.toLowerCase(), r]));
  const touchByRoot = new Map(snap.touched.map((t) => [t.root, t]));
  const out: Reg[] = [];
  for (let index = 0; index < 300; index++) {
    const file = `published/${index}.jpg`;
    const q = await pdqOf(readFileSync(resolve(DATA, file)));
    const r = byPdq.get(q.hash.toLowerCase());
    if (!r) throw new Error(`published image ${index} is not on chain`);
    out.push({
      name: split.registered[index], index, author: r.author, commitment: r.commitment, pdq: r.pdq, seedHex: "0x" as Hex,
      publishedFile: file, revealTx: r.txHash, touchTx: touchByRoot.get(r.root)?.txHash ?? ("0x" as Hex),
    });
  }
  return out;
}


// ------------------------------------------------------------------ transforms
type T = (b: Buffer) => Promise<Buffer>;
const meta = async (b: Buffer): Promise<{ w: number; h: number }> => {
  const m = await sharp(b).metadata();
  return { w: m.width ?? 0, h: m.height ?? 0 };
};
const centre = (share: number): T => async (b) => {
  const { w, h } = await meta(b);
  const dx = Math.round((w * share) / 2);
  const dy = Math.round((h * share) / 2);
  return sharp(b).extract({ left: dx, top: dy, width: w - 2 * dx, height: h - 2 * dy }).jpeg({ quality: 90 }).toBuffer();
};
const long = async (b: Buffer, n: number): Promise<Buffer> => {
  const { w, h } = await meta(b);
  return sharp(b).resize(w >= h ? { width: n } : { height: n }).png().toBuffer();
};
const TRANSFORMS: Record<string, T> = {
  "JPEG q90": (b) => sharp(b).jpeg({ quality: 90 }).toBuffer(),
  "JPEG q70": (b) => sharp(b).jpeg({ quality: 70 }).toBuffer(),
  "JPEG q50": (b) => sharp(b).jpeg({ quality: 50 }).toBuffer(),
  "WebP q75": (b) => sharp(b).webp({ quality: 75 }).toBuffer(),
  "resize 1080 long edge": (b) => long(b, 1080),
  "resize 640 long edge": (b) => long(b, 640),
  "centre crop 5%": centre(0.05),
  "centre crop 10%": centre(0.1),
  "centre crop 20%": centre(0.2),
  "brightness +15%": (b) => sharp(b).modulate({ brightness: 1.15 }).jpeg({ quality: 92 }).toBuffer(),
  "brightness -15%": (b) => sharp(b).modulate({ brightness: 0.85 }).jpeg({ quality: 92 }).toBuffer(),
  "contrast +15%": (b) => sharp(b).linear(1.15, -(128 * 0.15)).jpeg({ quality: 92 }).toBuffer(),
  "contrast -15%": (b) => sharp(b).linear(0.85, 128 * 0.15).jpeg({ quality: 92 }).toBuffer(),
  "2% border": async (b) => {
    const { w, h } = await meta(b);
    const x = Math.round(w * 0.02);
    const y = Math.round(h * 0.02);
    return sharp(b).extend({ top: y, bottom: y, left: x, right: x, background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
  },
  "text overlay": async (b) => {
    const { w, h } = await meta(b);
    return sharp(b).composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><text x="${w * 0.05}" y="${h * 0.92}" font-size="${Math.round(h * 0.07)}" fill="white" stroke="black" stroke-width="2">REPOST</text></svg>`) }]).jpeg({ quality: 92 }).toBuffer();
  },
  "screenshot frame": async (b) => {
    const inner = await sharp(b).resize({ width: 1000 }).toBuffer();
    const ih = (await meta(inner)).h;
    const bar = Buffer.from(`<svg width="1170" height="220"><rect width="1170" height="220" fill="#111"/><text x="60" y="130" font-size="64" fill="#fff">9:41  LTE  100%</text></svg>`);
    return sharp({ create: { width: 1170, height: 220 + ih + 400, channels: 3, background: "#f2f2f2" } })
      .composite([{ input: bar, top: 0, left: 0 }, { input: inner, top: 260, left: 85 }]).png().toBuffer();
  },
  "horizontal flip": (b) => sharp(b).flop().jpeg({ quality: 92 }).toBuffer(),
  "metadata strip": (b) => sharp(b).jpeg({ quality: 92 }).toBuffer(),
  "platform round trip": platformRoundTrip,
};

// ------------------------------------------------------------------ evaluation
const THRESHOLD = 31;
function rngFactory(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const nearest = (q: PdqResult, refs: EntryRef[]): { e: EntryRef; d: number } | undefined => {
  let best: { e: EntryRef; d: number } | undefined;
  for (const e of refs) {
    const d = Math.min(...q.dihedral.map((h) => hamming256(h, e.pdq)));
    if (!best || d < best.d) best = { e, d };
  }
  return best;
};
const dist = (q: PdqResult, e: EntryRef): number => Math.min(...q.dihedral.map((h) => hamming256(h, e.pdq)));

async function evaluate(reg: Registration): Promise<Record<string, unknown>> {
  const { snap, finalized } = await registry();
  const refs = toEntryRefs(snap, finalized).filter((r) => r.finalized);
  const byAuthor = new Map(reg.registered.map((r) => [r.commitment.toLowerCase(), r.author.toLowerCase()]));
  const contested = new Set(reg.thieves.map((t) => t.index));
  const publishedHashes = new Set(reg.registered.map((r) => createHash("sha256").update(readFileSync(resolve(DATA, r.publishedFile))).digest("hex")));
  const rand = rngFactory(20261014);

  const perTransform: Record<string, Record<string, number>> = {};
  const roc: { threshold: number; tp: number; n: number }[] = [];
  const sweep = Array.from({ length: 26 }, (_, i) => i * 4);
  sweep.forEach((t) => roc.push({ threshold: t, tp: 0, n: 0 }));
  let queries = 0;
  const contestedAcc = { fingerprintOnly: 0, touchplate: 0, shuffled: 0, n: 0 };

  for (const [name, fn] of Object.entries(TRANSFORMS)) {
    const acc = { fileHash: 0, metadata: 0, fingerprintOnly: 0, touchplate: 0, randomThreshold: 0, shuffledOrder: 0, n: 0 };
    for (const r of reg.registered) {
      const published = readFileSync(resolve(DATA, r.publishedFile));
      const credited = await sharp(published).withExif({ IFD0: { Copyright: `credit:${r.author}` } }).jpeg({ quality: 92 }).toBuffer();
      const out = await fn(published);
      const q = await pdqOf(out);
      const metaOut = await fn(credited);
      const hasCredit = ((await sharp(metaOut).metadata()).exif?.toString("latin1") ?? "").includes(`credit:${r.author}`);
      const truth = r.author.toLowerCase();
      acc.n++;
      queries++;
      if (publishedHashes.has(createHash("sha256").update(out).digest("hex"))) acc.fileHash++;
      if (hasCredit) acc.metadata++;
      const near = nearest(q, refs);
      const fpOk = !!near && near.d <= THRESHOLD && near.e.author.toLowerCase() === truth;
      if (fpOk) acc.fingerprintOnly++;
      const v = decide(q, refs, []);
      const tpOk = (v.kind === "MATCHED" || v.kind === "AUTHORED") && v.entry.author.toLowerCase() === truth;
      if (tpOk) acc.touchplate++;
      const thr = Math.floor(rand() * 256);
      const cands = refs.filter((e) => dist(q, e) <= thr).sort((a, b) => (a.touchBlock < b.touchBlock ? -1 : a.touchBlock > b.touchBlock ? 1 : 0));
      if (cands[0] && cands[0].author.toLowerCase() === truth) acc.randomThreshold++;
      const cs = refs.filter((e) => dist(q, e) <= THRESHOLD);
      const pick = cs.length ? cs[Math.floor(rand() * cs.length)] : undefined;
      if (pick && pick.author.toLowerCase() === truth) acc.shuffledOrder++;
      if (contested.has(r.index)) {
        contestedAcc.n++;
        if (fpOk) contestedAcc.fingerprintOnly++;
        if (tpOk) contestedAcc.touchplate++;
        if (pick && pick.author.toLowerCase() === truth) contestedAcc.shuffled++;
      }
      for (const p of roc) {
        p.n++;
        if (near && near.d <= p.threshold && near.e.author.toLowerCase() === truth) p.tp++;
      }
    }
    perTransform[name] = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, k === "n" ? v : Number((v / acc.n).toFixed(4))]));
    console.log(name, JSON.stringify(perTransform[name]));
  }

  // distractors: never registered, so any match is a false attribution
  const fpr = sweep.map((t) => ({ threshold: t, fp: 0, n: 0 }));
  let falseAttribution = 0;
  let lowDetail = 0;
  for (const n of split.distractors) {
    const q = await pdqOf(load(n));
    if (q.quality < 50) lowDetail++;
    const near = nearest(q, refs);
    if (near && near.d <= THRESHOLD) falseAttribution++;
    for (const p of fpr) {
      p.n++;
      if (near && near.d <= p.threshold) p.fp++;
    }
  }

  // watermark: freshly marked originals (known seeds) versus unmarked distractors, both after JPEG q70
  const zMarked: number[] = [];
  const zUnmarked: number[] = [];
  const seedOf = (k: number): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => (k * 131 + i * 17 + 7) & 255);
  for (const [k, name] of split.registered.slice(0, 40).entries()) {
    const raw = await sharp(load(name)).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    const marked = embed(new Uint8Array(raw.data), raw.info.width, raw.info.height, 3, seedOf(k));
    const jpeg = await sharp(Buffer.from(marked.rgb), { raw: { width: raw.info.width, height: raw.info.height, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
    const back = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    zMarked.push(detect(new Uint8Array(back.data), back.info.width, back.info.height, 3, seedOf(k)));
  }
  for (const [k, name] of split.distractors.slice(0, 40).entries()) {
    const jpeg = await sharp(load(name)).jpeg({ quality: 70 }).toBuffer();
    const back = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    zUnmarked.push(detect(new Uint8Array(back.data), back.info.width, back.info.height, 3, seedOf(k)));
  }
  const stat = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return { n: s.length, min: Number(s[0].toFixed(2)), median: Number(s[Math.floor(s.length / 2)].toFixed(2)), max: Number(s[s.length - 1].toFixed(2)), atLeast6: s.filter((z) => z >= 6).length / s.length };
  };

  // lookup latency on synthetic registries (brute force over 8 dihedral variants)
  const latency: Record<string, number> = {};
  for (const size of [1_000, 10_000, 100_000]) {
    const words = new Uint32Array(size * 8);
    for (let i = 0; i < words.length; i++) words[i] = Math.floor(rand() * 4294967296);
    const qw = Array.from({ length: 8 }, () => Uint32Array.from({ length: 8 }, () => Math.floor(rand() * 4294967296)));
    const times: number[] = [];
    for (let rep = 0; rep < 5; rep++) {
      const t0 = performance.now();
      let best = 256;
      for (let e = 0; e < size; e++) {
        for (const v of qw) {
          let d = 0;
          for (let k = 0; k < 8; k++) {
            let x = (words[e * 8 + k] ^ v[k]) >>> 0;
            x -= (x >>> 1) & 0x55555555;
            x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
            d += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
          }
          if (d < best) best = d;
        }
      }
      times.push(performance.now() - t0);
      void best;
    }
    times.sort((a, b) => a - b);
    latency[String(size)] = Number(times[2].toFixed(2));
  }

  return {
    corpus: "COCO val2017 files 1000..2299 (300 registered, 1000 distractors)",
    registeredOnChain: reg.registered.length,
    thiefCopiesOnChain: reg.thieves.length,
    threshold: THRESHOLD,
    transformsNote: "platform-style simulations with sharp, not real platform uploads",
    queries,
    perTransform,
    contestedImages: { n: contestedAcc.n, fingerprintOnlyRecall: contestedAcc.fingerprintOnly / contestedAcc.n, touchplateRecall: contestedAcc.touchplate / contestedAcc.n, shuffledOrderRecall: contestedAcc.shuffled / contestedAcc.n },
    falseAttribution: { distractors: split.distractors.length, matched: falseAttribution, rate: falseAttribution / split.distractors.length, lowDetailDistractors: lowDetail },
    roc: roc.map((p, i) => ({ threshold: p.threshold, tpr: p.tp / p.n, fpr: fpr[i].fp / fpr[i].n })),
    markZ: { markedJpeg70: stat(zMarked), unmarkedJpeg70: stat(zUnmarked) },
    lookupLatencyMs: latency,
    latencyNote: "brute force Hamming over 8 dihedral variants, synthetic hashes for registry size",
  };
}

let reg: Registration;
if (existsSync(REG_FILE)) {
  reg = JSON.parse(readFileSync(REG_FILE, "utf8")) as Registration;
} else if (existsSync(resolve(DATA, "published/299.jpg"))) {
  reg = { registered: await reconstruct(), thieves: [] };
  writeFileSync(REG_FILE, JSON.stringify(reg, null, 1));
} else {
  reg = await registerAll();
}
if (reg.thieves.length === 0) {
  reg.thieves = await registerThief(reg.registered);
  writeFileSync(REG_FILE, JSON.stringify(reg, null, 1));
}
console.log(`registered ${reg.registered.length} + ${reg.thieves.length} thief copies`);
const summary = await evaluate(reg);
writeFileSync(resolve(RESULTS, "summary.json"), JSON.stringify(summary, null, 2));
writeFileSync(resolve(RESULTS, "registration.json"), JSON.stringify({ registered: reg.registered.map(({ seedHex: _s, ...r }) => r), thieves: reg.thieves.map(({ seedHex: _s, ...r }) => r) }, null, 1));
console.log("bench done");
