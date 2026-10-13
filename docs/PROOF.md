# PROOF

Every number is produced by a script from a results file. Nothing here is typed by hand.

| Claim | Source file | Generator |
|---|---|---|
| Commit-state ladder distribution (286 block ladders, 100 own transactions) | `spikes/s1-ladder-blocks.json`, `spikes/s1-ladder.json` | `spikes/s1-ladder-blocks.mjs`, `spikes/funded.ts` |
| Gas is charged on the limit | `spikes/s2-gas.json` | `spikes/funded.ts` |
| P-256 precompile accepts valid and rejects tampered, wrong-challenge, wrong-key and high-s | `spikes/s4-sim.json`, `spikes/s4-onchain.json` | `spikes/s4-sim.ts`, `spikes/funded.ts` |
| PDQ parity with the reference | `spikes/s5-parity.json` | `spikes/s5-compare.ts` |
| Transform recall, file-hash and distractor false matches (miniature) | `spikes/s5-roundtrip.json`, `spikes/s5-crop.json` | `spikes/s5-roundtrip.ts`, `spikes/s5-crop.ts` |
| Watermark PSNR and z | `spikes/s6-watermark.json` | `spikes/s6-run.ts` |
| Storage layout gas | `spikes/s9-storage.json` | `spikes/s9-run.ts` |
| Benchmark: four arms, controls, threshold sweep, mark z, lookup latency | `bench/results/summary.json` | `bench/src/run.ts` |
| Break campaign D1 to D10 | `docs/drills/Dn.json` | `drills/src/dN-*.ts` |
| Landing, `/proof` and README tables | `apps/web/src/data/numbers.json`, `docs/numbers-block.md` | `scripts/generate-numbers.mjs` |

Regenerate: `node scripts/generate-numbers.mjs`.

Transforms are platform-style simulations produced with `sharp`. No claim is made about any real platform's upload pipeline.
