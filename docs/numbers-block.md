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
<!-- NUMBERS:END -->
