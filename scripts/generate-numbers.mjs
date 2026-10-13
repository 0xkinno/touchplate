// Generates every published number from results files. Hand-typed numbers are a defect.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const opt = (p) => (existsSync(p) ? read(p) : null);

const rt = read("spikes/s5-roundtrip.json");
const crop = read("spikes/s5-crop.json");
const ladder = read("spikes/s1-ladder-blocks.json");
const own = opt("spikes/s1-ladder.json");
const s4 = read("spikes/s4-sim.json");
const s9 = read("spikes/s9-storage.json");
const s6 = read("spikes/s6-watermark.json");
const s2 = opt("spikes/s2-gas.json");
const interval = read("spikes/s1-block-interval.json");
const bench = opt("bench/results/summary.json");

const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const t = rt.perTransform;
const numbers = {
  generatedFrom: ["spikes/s5-roundtrip.json", "spikes/s5-crop.json", "spikes/s1-ladder-blocks.json", "spikes/s4-sim.json", "spikes/s9-storage.json", "spikes/s6-watermark.json"],
  corpus: rt.corpus,
  simulatedTransformsNote: "platform-style simulations with sharp, not real platform uploads",
  platformRoundTrip: { pdqRecall: pct(t.platform_roundtrip.pdqRecall), sha256Match: pct(t.platform_roundtrip.sha256Match) },
  jpeg70: { pdqRecall: pct(t.jpeg70.pdqRecall), sha256Match: pct(t.jpeg70.sha256Match) },
  resize1080: { pdqRecall: pct(t.resize1080.pdqRecall) },
  flipWithDihedral: pct(t.flip_h.pdqRecall),
  flipWithoutDihedral: pct(t.flip_h.pdqRecallNoDihedral),
  falseMatchRate: rt.distractorPairs.falseMatchRate,
  distractorPairs: rt.distractorPairs.pairs,
  smallestDistractorDistance: rt.distractorPairs.smallestPairDistance,
  crop: crop.rows.filter((r) => r.kind === "all-edges").map((r) => ({ perAxisPct: r.totalPctPerAxis, recall: pct(r.recall) })),
  finalizedMsP50: ladder.distribution.proposed_to_finalized_ms.p50,
  finalizedMsP90: ladder.distribution.proposed_to_finalized_ms.p90,
  verifiedMsP50: ladder.distribution.proposed_to_verified_ms.p50,
  finalizedToVerifiedMsP50: ladder.distribution.finalized_to_verified_ms.p50,
  ladderBlocks: ladder.completeLadders,
  ownTx: own ? { n: own.count, finalizedP50: own.distribution.submitToFinalizedMs.p50, verifiedP50: own.distribution.submitToVerifiedMs.p50, finalizedP90: own.distribution.submitToFinalizedMs.p90 } : null,
  blockIntervalSeconds: interval.span100000.secPerBlock,
  p256: {
    validGas: s4.cases[0].estimateGas,
    solidityFallbackGas: s4.solidityFallback.estimateGas,
    accepted: s4.cases.filter((c) => c.accepted).length,
    rejected: s4.cases.filter((c) => !c.accepted).length,
  },
  storage: { packedWriteGas: s9.netOfIntrinsic.writeB, skeletonWriteGas: s9.netOfIntrinsic.writeA, scatteredWriteGas: s9.netOfIntrinsic.writeC },
  mark: { psnrMin: s6.psnrDb.min, zMinAfterTransforms: Math.min(...Object.entries(s6.zMarked).filter(([k]) => k !== "crop10pct").map(([, v]) => v.min)), unmarkedMaxAbsZ: Math.max(Math.abs(s6.zUnmarkedOriginal.min), Math.abs(s6.zUnmarkedOriginal.max), Math.abs(s6.zUnmarkedAfterJpeg70Resize1080.min), Math.abs(s6.zUnmarkedAfterJpeg70Resize1080.max)) },
  gasOnLimit: s2 ? { chargedOnLimit: s2.chargedOnLimit, oneXFee: s2.oneX.feePaid, twoXFee: s2.twoX.feePaid } : null,
  bench,
};

mkdirSync("apps/web/src/data", { recursive: true });
writeFileSync("apps/web/src/data/numbers.json", JSON.stringify(numbers, null, 2) + "\n");


function benchRows() {
  if (!bench) return [];
  const pt = bench.perTransform;
  const pc = (x) => `${Math.round(x * 1000) / 10}%`;
  const lines = ["", `Benchmark on Monad mainnet: ${bench.registeredOnChain} images registered through the real flow, ${bench.thiefCopiesOnChain} thief copies registered later, ${bench.falseAttribution.distractors} distractors, ${Object.keys(pt).length} transforms (${bench.transformsNote}).`, "", "| Transform | File hash | Metadata | Fingerprint only | Touchplate | Random threshold (control) | Shuffled order (control) |", "|---|---|---|---|---|---|---|"];
  for (const [name, r] of Object.entries(pt)) lines.push(`| ${name} | ${pc(r.fileHash)} | ${pc(r.metadata)} | ${pc(r.fingerprintOnly)} | ${pc(r.touchplate)} | ${pc(r.randomThreshold)} | ${pc(r.shuffledOrder)} |`);
  const c = bench.contestedImages;
  lines.push("", `On the ${c.n} contested queries (50 images that a thief re-registered later, across all 19 transforms, including the out-of-scope crops, border and frame where every arm fails): fingerprint only ${pc(c.fingerprintOnlyRecall)}, Touchplate ${pc(c.touchplateRecall)}, shuffled order ${pc(c.shuffledOrderRecall)}.`);
  lines.push(`False attribution on ${bench.falseAttribution.distractors} never-registered distractors at threshold ${bench.threshold}: ${bench.falseAttribution.matched} (${pc(bench.falseAttribution.rate)}).`);
  lines.push(`Watermark z after JPEG q70: marked median ${bench.markZ.markedJpeg70.median} (min ${bench.markZ.markedJpeg70.min}), unmarked max ${bench.markZ.unmarkedJpeg70.max}.`);
  lines.push(`Lookup latency, brute force over 8 dihedral variants (synthetic registry sizes): ${Object.entries(bench.lookupLatencyMs).map(([k, v]) => `${k} entries ${v} ms`).join(", ")}.`);
  return lines;
}

const block = [
  "<!-- NUMBERS:START -->",
  `Measured on ${numbers.corpus} (${numbers.simulatedTransformsNote}).`,
  "",
  "| Measure | Result |",
  "|---|---|",
  `| Platform round trip (strip, resize 1080, JPEG 72): fingerprint recall | ${numbers.platformRoundTrip.pdqRecall} |`,
  `| Same round trip: file-hash match | ${numbers.platformRoundTrip.sha256Match} |`,
  `| Horizontal flip recall (with / without dihedral variants) | ${numbers.flipWithDihedral} / ${numbers.flipWithoutDihedral} |`,
  `| False matches among ${numbers.distractorPairs} distractor pairs | ${numbers.falseMatchRate * numbers.distractorPairs} |`,
  ...numbers.crop.map((c) => `| Crop ${c.perAxisPct}% per axis: fingerprint recall | ${c.recall} |`),
  `| Proposed to Finalized (p50 / p90, ${numbers.ladderBlocks} blocks) | ${numbers.finalizedMsP50} ms / ${numbers.finalizedMsP90} ms |`,
  `| Proposed to Verified (p50) | ${numbers.verifiedMsP50} ms |`,
  `| P-256 verify, precompile path / Solidity fallback | ${numbers.p256.validGas} / ${numbers.p256.solidityFallbackGas} gas |`,
  `| Entry write, packed / skeleton / scattered | ${numbers.storage.packedWriteGas} / ${numbers.storage.skeletonWriteGas} / ${numbers.storage.scatteredWriteGas} gas |`,
  `| Watermark PSNR (min) / z after transforms (min) | ${numbers.mark.psnrMin} dB / ${numbers.mark.zMinAfterTransforms} |`,
  ...benchRows(),
  "<!-- NUMBERS:END -->",
].join("\n");
writeFileSync("docs/numbers-block.md", block + "\n");

if (existsSync("README.md")) {
  const r = readFileSync("README.md", "utf8");
  if (r.includes("<!-- NUMBERS:START -->")) {
    writeFileSync("README.md", r.replace(/<!-- NUMBERS:START -->[\s\S]*<!-- NUMBERS:END -->/, block));
  }
}
console.log("numbers generated");
