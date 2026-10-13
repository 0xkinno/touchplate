<!-- NUMBERS:START -->
Measured on COCO val2017 first 200 files (platform-style simulations with sharp, not real platform uploads).

| Measure | Result |
|---|---|
| Platform round trip (strip, resize 1080, JPEG 72): fingerprint recall | 100% |
| Same round trip: file-hash match | 0% |
| Horizontal flip recall (with / without dihedral variants) | 99.5% / 0.5% |
| False matches among 19900 distractor pairs | 0 |
| Crop 1% per axis: fingerprint recall | 98% |
| Crop 2% per axis: fingerprint recall | 95% |
| Crop 4% per axis: fingerprint recall | 17% |
| Crop 6% per axis: fingerprint recall | 0% |
| Crop 10% per axis: fingerprint recall | 0% |
| Crop 20% per axis: fingerprint recall | 0% |
| Proposed to Finalized (p50 / p90, 286 blocks) | 564 ms / 628 ms |
| Proposed to Verified (p50) | 1472 ms |
| P-256 verify, precompile path / Solidity fallback | 43256 / 256353 gas |
| Entry write, packed / skeleton / scattered | 81592 / 133468 / 256453 gas |
| Watermark PSNR (min) / z after transforms (min) | 40.6 dB / 12.74 |

Benchmark on Monad mainnet: 300 images registered through the real flow, 50 thief copies registered later, 1000 distractors, 19 transforms (platform-style simulations with sharp, not real platform uploads).

| Transform | File hash | Metadata | Fingerprint only | Touchplate | Random threshold (control) | Shuffled order (control) |
|---|---|---|---|---|---|---|
| JPEG q90 | 0% | 0% | 98.3% | 100% | 40% | 92.7% |
| JPEG q70 | 0% | 0% | 97% | 100% | 38% | 92% |
| JPEG q50 | 0% | 0% | 97.3% | 100% | 39.7% | 92.3% |
| WebP q75 | 0% | 0% | 98.3% | 100% | 37.7% | 92.3% |
| resize 1080 long edge | 0% | 0% | 98.3% | 100% | 39.3% | 91.7% |
| resize 640 long edge | 0% | 0% | 100% | 100% | 44.3% | 93.7% |
| centre crop 5% | 0% | 0% | 7% | 7% | 22% | 6.3% |
| centre crop 10% | 0% | 0% | 0.3% | 0.3% | 6.3% | 0.3% |
| centre crop 20% | 0% | 0% | 0% | 0% | 1% | 0% |
| brightness +15% | 0% | 0% | 96.3% | 100% | 40.7% | 91.7% |
| brightness -15% | 0% | 0% | 99.7% | 100% | 48.3% | 91% |
| contrast +15% | 0% | 0% | 97.7% | 100% | 36.7% | 91.7% |
| contrast -15% | 0% | 0% | 99% | 100% | 35.3% | 89% |
| 2% border | 0% | 0% | 8.3% | 8.3% | 16% | 8.3% |
| text overlay | 0% | 0% | 96.3% | 97.7% | 39% | 91% |
| screenshot frame | 0% | 0% | 0% | 0% | 0.3% | 0% |
| horizontal flip | 0% | 0% | 97% | 99.3% | 36.7% | 89.7% |
| metadata strip | 0% | 0% | 98.7% | 100% | 38.7% | 91.3% |
| platform round trip | 0% | 0% | 94.7% | 100% | 40% | 94.7% |

On the 950 contested queries (50 images that a thief re-registered later, across all 19 transforms, including the out-of-scope crops, border and frame where every arm fails): fingerprint only 65.1%, Touchplate 74%, shuffled order 38.3%.
False attribution on 1000 never-registered distractors at threshold 31: 0 (0%).
Watermark z after JPEG q70: marked median 58.4 (min 27.65), unmarked max 2.62.
Lookup latency, brute force over 8 dihedral variants (synthetic registry sizes): 1000 entries 0.92 ms, 10000 entries 9.06 ms, 100000 entries 58.35 ms.
<!-- NUMBERS:END -->
