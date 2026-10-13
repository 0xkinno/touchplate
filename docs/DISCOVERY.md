# DISCOVERY

Phase 0 record for Touchplate. Every figure below comes from a script in `spikes/` run against the live Monad testnet RPC (chain 10143) or from the named source file. Items that need a funded account are marked PENDING and carry no invented numbers.

Run date: 2026-10-13. Public RPC: `https://testnet-rpc.monad.xyz`, WS: `wss://testnet-rpc.monad.xyz`.

## 1. Sponsor primitive

Monad's four block commit states (Proposed, Voted, Finalized, Verified) exposed natively by the `monadNewHeads` and `monadLogs` subscriptions, together with the speculative real-time feed that publishes logs at Proposed.

## 2. Observed constraint

Priority on Monad is a fact only at Finalized. Anything a transaction reveals is published to every `monadLogs` subscriber at Proposed, before it is final. Measured on testnet: roughly 12,000 log events arrived over a 25 second window at `Proposed` (`spikes/s1-probe.mjs`), and a block reaches Finalized a median of 564 ms after it is first seen (`s1-ladder-blocks.json`).

## 3. Evidence

### Commit ladder (S1, block level)

Source: `spikes/s1-ladder-blocks.mjs`, output `spikes/s1-ladder-blocks.json`. 296 blocks observed over 90 s, 286 with a complete ladder, 0 competing proposals seen.

| Transition | n | p50 ms | p90 ms | p99 ms | max ms |
|---|---|---|---|---|---|
| Proposed to Voted | 286 | 291 | 416 | 650 | 1162 |
| Voted to Finalized | 286 | 272 | 312 | 447 | 652 |
| Proposed to Finalized | 286 | 564 | 628 | 770 | 1590 |
| Finalized to Verified | 286 | 913 | 994 | 1815 | 2050 |
| Proposed to Verified | 286 | 1472 | 1571 | 2301 | 2663 |

Tag lag (polled every 500 ms, 176 samples): `latest - safe` p50 1 block, max 2; `latest - finalized` p50 2 blocks, max 3.

Subscription payload (raw samples in `spikes/out/s1-ws-*.json`):
- `monadNewHeads` result keys: `blockId, commitState, hash, parentHash, sha3Uncles, miner, stateRoot, transactionsRoot, receiptsRoot, logsBloom, difficulty, number, gasLimit, gasUsed, timestamp, extraData, mixHash, nonce, baseFeePerGas, withdrawalsRoot, blobGasUsed, excessBlobGas, parentBeaconBlockRoot, requestsHash, totalDifficulty, size`.
- `monadLogs` result keys: `blockId, commitState, address, topics, data, blockHash, blockNumber, blockTimestamp, transactionHash, transactionIndex, logIndex, removed`.
- `commitState` values seen: `Proposed, Voted, Finalized, Verified`, 79 of each in the first sample.

Block interval (`spikes/s1-block-interval.json`): 0.304 s per block over 1,000 blocks, 0.3032 over 100,000. Gas limit per block 150,000,000, base fee 100 gwei.

Own-transaction timing (100 txs): PENDING funding. Script: `spikes/funded.ts s1`.

### Verified is native, and D is 3

The block-states and asynchronous-execution docs define Verified as `latest_finalized - D` with `D = 3` on testnet and mainnet. The WS feed delivers it directly as `commitState: "Verified"`, so no `+3` derivation is needed. Measured Finalized to Verified p50 is 913 ms (three block times).

### P-256 precompile (S4, simulated on the live RPC)

Source: `spikes/s4/src/P256Probe.sol`, `spikes/s4-sim.ts`, output `spikes/s4-sim.json`. Method: `eth_call` and `eth_estimateGas` with a runtime-code state override, so no funds are needed. The assertion is a real WebAuthn assertion produced in S3.

| Case | Result | estimateGas (incl. 21000 intrinsic) |
|---|---|---|
| Valid assertion 1 | accepted | 43,256 |
| Valid assertion 2 | accepted | 43,244 |
| One bit of `r` flipped | rejected | 50,464 |
| Assertion for a different challenge | rejected | 37,370 |
| Wrong public key | rejected | 37,495 |
| High-s (malleated) signature | rejected | 37,645 |
| Solidity fallback path, valid-shaped input | n/a | 256,353 |

Direct staticcall to `0x0000000000000000000000000000000000000100`: valid 160-byte input returns `0x...01`, tampered input returns empty. The precompile exists on testnet and the OpenZeppelin `WebAuthn` library verifies a browser-produced assertion against it. On-chain transactions for this spike: PENDING funding (`funded.ts s4`).

### Passkey key families (S3)

Source: `spikes/s3-page.ts`, `spikes/s3-run.mjs`, output `spikes/s3-families.json`. Chromium 156 with a CDP virtual authenticator (`hasPrf: true`, resident key, user verification). Real-device runs (iCloud Keychain, Google Password Manager) belong to Phase 9 and are not claimed here.

- One `createPasskeyWithPrfOutput` ceremony, then a second `getPasskeyPrfOutput` ceremony, produced identical EVM address (`0x82571049FD639F8f98b1cDB79d887cB02F006520`), Ed25519 studio public key, and mark root hash. `reproducible: true`.
- P-256 public key (x, y): captured in the same creation ceremony by wrapping Mera's injectable `WebAuthnClient` and reading `AuthenticatorAttestationResponse.getPublicKey()` (SPKI, 91 bytes, x and y are the last 64). Mera itself does not return it.
- Mera does not derive EVM keys. The BIP-44 path and PRF to BIP-39 mapping come from its demo helper and are reimplemented with `@scure/bip32` and `@scure/bip39`.
- Assertions carried flags `0x05` (UP and UV), BE and BS unset, which satisfies the OZ consistency check.

### PDQ parity (S5)

Source: `spikes/s5-pdq.ts` (TypeScript port), `spikes/s5-reference.py`, `spikes/s5-compare.ts`; output `spikes/s5-parity.json`. 50 images (44 fixtures from the PDQ reference data and 6 deterministic synthetic ones), identical pixels fed to the TS port, the pure-Python reference hasher, and the `pdqhash` C++ binding.

- TS vs Python reference: 49 of 50 exact; maximum Hamming 12 (one image); quality score equal on all 50.
- TS vs C++ binding: 47 of 50 exact; two images differ by 2 bits (float32 vs float64 ties on synthetic checker and diagonal images).
- The one outlier is a synthetic horizontal gradient with quality 44. It is degenerate: coefficients are exact zeros that tie against the median, and the Python reference and the C++ binding disagree with each other by 120 bits on it. It falls under quality 50 and is therefore flagged low detail by the rule in section 6.1.
- The stated pass condition (Hamming at most 2 on every image) is met on 49 of 50 and not on the degenerate one. Recorded as an exception, not hidden.
- Findings that change the port: the C++ binding emits bits MSB-first (reverse index); the Python reference thumbnails to 512 px before hashing; bit k of the hash is bit k of the 256-bit integer.
- Decoder drift (`spikes/s5-decoder.json`): hashing sharp-decoded pixels instead of PIL-decoded ones gives mean 1.4 bits and a maximum of 16 on two odd-mode images. Well inside the threshold of 31.

### Behaviour under transforms (miniature of the Phase 6 benchmark)

Source: `spikes/s5-roundtrip.ts` and `spikes/s5-crop.ts`; outputs `s5-roundtrip.json`, `s5-crop.json`. 200 COCO val2017 images, threshold 31, 8 dihedral variants. These are platform-style simulations with `sharp`, not real platform uploads.

| Transform | PDQ recall | SHA-256 equal |
|---|---|---|
| JPEG q70 | 100% | 0% |
| JPEG q50 | 100% | 0% |
| WebP q75 | 100% | 0% |
| Resize to 1080 long edge | 100% | 0% |
| Resize to 640 long edge | 100% | 0% |
| Brightness +15% | 100% | 0% |
| Strip, resize 1080, JPEG 72 | 100% | 0% |
| Horizontal flip | 99.5% (0.5% without dihedral) | 0% |

False matches among 19,900 distractor pairs (200 images, quality >= 50, all dihedral variants): 0. Smallest distractor distance 82.

**Crop tolerance is narrow** (100 images, `s5-crop.json`):

| Crop | PDQ recall at 31 |
|---|---|
| 1% of each axis, all edges | 98% |
| 2% | 95% |
| 4% | 17% |
| 6% | 0% |
| 10% | 0% |
| 20% | 0% |
| bottom edge only, 2% | 71% |
| bottom edge only, 5% | 0% |

This contradicts the assumption in the build brief that PDQ still matches modest crops. It does not. Roughly 2 to 3% per axis is the limit.

### Keyed watermark (S6)

Source: `spikes/s6-mark.ts`, `spikes/s6-run.ts`, output `spikes/s6-watermark.json`. 20 marked and 200 unmarked COCO val2017 images. Mid-band (u+v in {4,5}, 11 coefficients) 8x8 DCT of a 512x512 luma plane, ChaCha20 keyed pattern, per-block masking weight, strength bisected per image to a PSNR target of 40.6 dB, detector normalises by block energy.

| Measure | Result |
|---|---|
| PSNR (8-bit output) | 40.60 to 40.61 dB, all 20 images |
| z after JPEG q90 / q70 / q50 | minimum 37.9 / 13.6 / 19.8 |
| z after WebP q75 | minimum 24.6 |
| z after resize 1080 / 640 | minimum 43.7 / 49.5 |
| z after JPEG q70 then resize 1080 | minimum 12.7 |
| z after strip, resize 1080, JPEG 72 | minimum 42.8 |
| z after 10% centre crop | median -0.07 (mark is lost) |
| Marked image against a wrong seed | z in [-1.86, 1.12] |
| 200 unmarked, original | z in [-2.33, 2.50] |
| 200 unmarked, JPEG q70 then 1080 | z in [-2.45, 3.02] |

Pass reading: PSNR at least 40 dB, z at least 6 after JPEG q70 and resize 1080 on all 20, so those conditions hold. The condition "z below 3 on 200 unmarked images" is missed by one value (3.02) out of 400 measurements, which is what a Gaussian null predicts (about 1 expected). A decision threshold of z >= 6 has no false positives in these 400 tests. Cropping breaks the mark, as the brief warned.

### Qwen (S7)

From the Alibaba Cloud Model Studio OpenAI-compatibility page (fetched 2026-10-13): model id `qwen3.8-max` (a dated snapshot `qwen3.8-max-0902` is also listed). Base URLs are workspace scoped: Singapore `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`, US `https://dashscope-us.aliyuncs.com/compatible-mode/v1`, Hong Kong and Tokyo follow the same pattern. An API key works only in the region it was created. Tool-calling round trip: PENDING (needs `QWEN_API_KEY` and the workspace id). Documentation-verified only; not yet run.

### AUSD (S8)

Source: `spikes/s8-probe.mjs`, `s8-faucet-sim.mjs`, `s8-impl.mjs`.

- Testnet AUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`: `name AUSD`, `symbol AUSD`, `decimals 6`, 5,937 bytes of code, identical size to the mainnet token `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` (`decimals 6`).
- Faucet `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C` is an ERC-1967 proxy; implementation `0xba804df5c476e8eaef87bf8085f295300cce2a49` contains selector `0x544c7cf9` (`requestFunds(address)`) and `token()`. A simulated `requestFunds(user)` from an unfunded address succeeds; estimateGas 130,600. The faucet holds 993,684,600,000,001 base units of AUSD.
- Balance increase from a real faucet transaction: PENDING funding (`funded.ts s8`).

### Storage pages (S9)

Source: `spikes/s4/src/LayoutProbe.sol`, `spikes/s9-run.ts`, output `spikes/s9-storage.json`; pricing from the opcode-pricing page of the Monad docs. MIP-8 is active on testnet (2026-08-12) and mainnet (2026-09-02). Cold storage is priced per 128-slot page: first fresh slot in a page 27,900, further fresh slots in the same page 17,100.

| Layout | Slots | estimateGas (write) | Net of 21,000 intrinsic |
|---|---|---|---|
| A: skeleton struct (9 fields) | 8 | 154,468 | 133,468 |
| B: repacked struct (4 slots) | 4 | 102,592 | 81,592 |
| C: one mapping per field | 9 | 277,453 | 256,453 |

Decision: keep an entry in one struct of at most 4 slots in a single page (layout B). Roughly 175k gas saved per reveal versus scattered mappings and 52k versus the skeleton.

### Gas is charged on the declared limit (S2)

Documented in the Monad gas-pricing page. Measurement from own transactions at 1x and 2x of `gasUsed`: PENDING funding (`funded.ts s2`).

## 4. Why existing approaches fail

- A file-hash registry (SHA-256 of the bytes) matched 0 of 200 files after any of the ten transforms above, including a plain JPEG re-encode.
- Embedded metadata and Content Credentials are carried inside the file. The simulated transforms drop them by construction (the encoder writes a new file); which real platforms strip them is not claimed here and will only be stated from a recorded run.
- A naive on-chain claim that includes the fingerprint in the claiming transaction publishes it at Proposed to every `monadLogs` subscriber about 0.56 s (p50) before it is final. A copier can submit first within the same window. The race itself is drill D5 and has not been run yet.

## 5. New capability

A creator can seal a batch of images with one passkey touch, wait for that block to be Finalized, then reveal fingerprints, and anyone can later attribute a transformed copy to the earliest finalized sealer, with the match decided by pixels and the order decided by consensus.

## 6. One invariant

**A Finalized entry's priority never changes** (I1), and nothing is shown as priority locked before its touch block is Finalized (I2).

## 7. One failure mode

Cropping. PDQ matches nothing beyond about 2 to 3% crop per axis and the mark does not survive a crop, so a thief who crops a stolen copy can evade `recordPriority` and the mark proof. This is reported, not hidden (see implications below).

## 8. One reproducible demonstration

```powershell
cd spikes
pnpm install
node s1-ladder-blocks.mjs      # four-rung ladder distribution from the live feed
npx tsx s4-sim.ts              # valid vs tampered WebAuthn assertion on the 0x100 precompile
npx tsx s5-roundtrip.ts        # file hash vs PDQ after platform-style transforms
```

## 9. Design implications for later phases

1. `REVEAL_WINDOW = 2_000` blocks is about 10 minutes at 0.304 s per block. Choose the window in wall-clock terms (a day is about 284,000 blocks) and record it with the measurement.
2. Verified is a native commit state; the ladder tracker should read `commitState` and keep polling tags only as a fallback.
3. Entry storage: at most 4 slots in one page. `root` and `manifestHash` need not be stored if the events carry them and no function reads them back.
4. Client must low-S normalise every assertion. Prefer a native-only P-256 verification so an invalid signature does not pay the presence probe.
5. Rotated or flipped copies: the PDQ reference states that picking one canonical dihedral hash is not stable. `recordPriority` therefore needs the earlier author's eight dihedral variants committed (one extra slot for a Merkle root over them) and a proof of the variant used.
6. Crops: the shipped claim must say "re-encoding, resizing, colour change, flip and rotation", not "modest crops". Mitigations to decide before Phase 1: commit hashes of a small set of centre-crop variants; make mark detection search grid offsets; or state crop as out of scope in LIMITATIONS.
7. Gas: set explicit limits from the committed profile; the precompile path costs about 43k for a whole call, the Solidity fallback about 256k.

## 10. Break plan and proof plan

Break plan: ten drills D1 to D10 as specified in the master instruction (strip and squeeze, crop and frame, late thief, same-image race, speculative-feed copier, collision forgery, replayed touch, lying server, hostile prompt, burst), each a script writing `docs/drills/Dn.md` with transaction links. D2 will publish the crop numbers above and D6 the forgery result.

Proof plan: 300 registered and 1,000 distractor images, ten simulated platform transforms plus controls, four arms (file hash, metadata, fingerprint only, Touchplate), a threshold sweep, mark z distributions, and lookup latency at three registry sizes, all generated from `bench/results/*.json`.

## 11. Gate status

| Gate item | Status |
|---|---|
| Discovered something non-obvious | Yes: native Verified, per-page storage pricing, narrow crop tolerance, rotation canonicalisation caveat |
| Reproduced it | Yes for everything not marked PENDING |
| Product exists because of it | Yes |
| Break plan written | Yes (section 10) |
| Proof plan written | Yes (section 10) |
| Funded spikes S1 (own txs), S2, S4 (on-chain), S8 (faucet tx), S7 (tool call) | PENDING: need testnet MON for `0xDe1413543adAB1C07f87Ff23Eb39946EBc19a20D` and a Qwen key |
