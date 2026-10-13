# LIMITATIONS

Measured boundaries of Touchplate. Numbers come from `spikes/` runs now and are replaced by `bench/results` in Phase 6.

## Crops are out of scope
- Large crops are declared out of scope for the keyed watermark. There is no grid-offset search and no crop-variant commitment.
- The watermark detector fails after a 10% centre crop (median z of about 0, `spikes/s6-watermark.json`).
- PDQ recall at distance 31 on 100 COCO images (`spikes/s5-crop.json`): 98% at 1% crop per axis, 95% at 2%, 17% at 4%, 0% at 6%, 10% and 20%.
- Consequence: a copier who crops about 3% or more per axis can evade fingerprint matching, priority recording and the mark proof. Touchplate does not claim otherwise.
- The benchmark reports recall for 5, 10 and 20% centre crops as measured, including where it is zero.

## Fingerprint
- Images with quality below 50 are flagged low detail and are excluded from automatic priority recording.
- Degenerate images (exact ties against the median) hash differently across implementations.
- Rotations and flips are handled only through the 8 dihedral variants; one canonical hash is not stable.

## Watermark
- Robust to JPEG down to q50, WebP q75, resize and a platform-style round trip in the spike corpus (minimum z 12.7 after JPEG q70 plus resize). Not robust to crops.
- A single unmarked measurement reached |z| = 3.02 out of 400; the decision threshold is z >= 6.

## Network
- Priority is a fact only at Finalized. Same-block ties are reported as contested, not decided on chain.
- Gas is charged on the declared limit, so every transaction must carry a tight explicit limit.

## Not yet verified
- Passkey behaviour on real devices (iCloud Keychain, Google Password Manager). Spikes used a virtual authenticator.
- Platform behaviour on real uploads. Transforms are simulations.
