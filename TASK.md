# TASK

### Phase 0: Discovery and reference
- [x] Repo init, `.gitignore` (node_modules, .env*, reference/, out/, cache/, qa/), authorship config, `includeCoAuthoredBy: false`
- [x] Clone all reference repos; write per-repo notes and PLAYBOOK.md (inside reference/)
- [x] S1 commit-state ladder spike with 100 timed txs
- [x] S2 gas-on-limit spike
- [x] S3 Mera key families + P-256 pubkey capture
- [x] S4 WebAuthn assertion verified via precompile 0x0100 on testnet
- [x] S5 PDQ TS port parity with Python pdqhash
- [x] S6 watermark PSNR and z-score
- [x] S7 Qwen model id and tool call
- [x] S8 AUSD testnet address, faucet, decimals
- [x] S9 storage layout gas
- [x] docs/DISCOVERY.md complete; final gate passed

### Phase 1: Core package
- [ ] PDQ + dihedral + quality, test vectors
- [ ] Watermark embed/detect with adaptive alpha
- [ ] HKDF key families, commitments, OZ-compatible Merkle batches
- [ ] Manifest JCS + Ed25519 signing
- [ ] Ladder tracker (WS subscription + polling fallback, abandoned detection)
- [ ] Verdict engine + certificate format + `certSha256`
- [ ] Explicit-gas tx builder from gas profile

### Phase 2: Contracts
- [ ] Hamming library + fuzz
- [ ] Touchplate.sol all functions and errors
- [ ] Unit, fuzz, invariant, WebAuthn fixture tests
- [ ] Gas snapshot committed

### Phase 3: Deploy
- [ ] Testnet deploy + source verification + docs/deployments/10143.json
- [ ] Mainnet deploy (if funded) + verification
- [ ] First real touch and reveal from a script, tx hashes in EVIDENCE.md

### Phase 4: Indexer
- [ ] Envio schema and handlers, local run, Envio Cloud deploy

### Phase 5: Verifier
- [ ] CLI: image mode, certificate mode, RPC and HyperSync paths, PASS/FAIL per check

### Phase 6: Benchmark and break campaign
- [ ] Dataset fetch + DATASET.md
- [ ] Register 300 images on testnet through the real flow
- [ ] Transforms, four arms, controls, threshold sweep, results JSON
- [ ] D1 to D10, each with docs/drills/Dn.md and tx links
- [ ] generate-readme-numbers script

### Phase 7: Web backend
- [ ] /api/lookup, /api/certificate, /api/ledger (SSE), /api/investigate
- [ ] Qwen tools, authority split, narrative validator

### Phase 8: UI
- [ ] Fonts, tokens, grain, nav capsule with layoutId glow, wallet button with power icon
- [ ] Hero image (generated or Unsplash) + TouchplateArt SVG + live drop zone
- [ ] Landing sections 2 to 9
- [ ] Studio (Mera onboarding, register studio, shoot, touch, ladder, reveal, downloads, price, Prove it's mine)
- [ ] Lookup + certificate page + OG image + License flow (approve, license)
- [ ] Ledger live stream
- [ ] Investigator with streamed tool timeline
- [ ] /proof page from results JSON

### Phase 9: QA
- [ ] Playwright layout suite all viewports, screenshots reviewed
- [ ] I9 network test (no image bytes leave the browser)
- [ ] Real passkey run on iPhone (iCloud Keychain) and Android or Chrome with Google Password Manager
- [ ] Lighthouse, a11y, console clean

### Phase 10: Docs and submission
- [ ] README per section 13, real screenshots, generated numbers
- [ ] ARCHITECTURE, INVARIANTS, PROOF, EVIDENCE, LIMITATIONS, MILESTONES, PROGRESS, AI_USAGE
- [ ] Vercel production deploy with all env vars, custom domain if available
- [ ] Demo video
- [ ] Authorship and reference-leak final check, push
- [ ] Portal submission complete

### Status notes (not part of the verbatim list)
- S1: 286 block ladders plus 100 own timed txs (`spikes/s1-ladder.json`).
- S4: three on-chain txs through the precompile (`spikes/s4-onchain.json`), valid accepted, tampered and wrong challenge rejected.
- S5: 49 of 50 within 0 bits of the reference; one degenerate synthetic image (quality 44) differs. Documented.
- S6: PSNR and z conditions met; unmarked-below-3 missed by one value (3.02 of 400). Documented.
- S7: tool-call round trip verified on `dashscope-intl` with `qwen3.8-max`.
- Real-device passkey runs remain in Phase 9.

### Additions requested by 0xkinno (after Phase 0)
- [ ] Crops declared out of scope; bench reports 5/10/20% centre-crop recall; README boundaries section
- [ ] Aurora Intents: verify Monad mainnet settlement assets from Aurora/1Click docs; if AUSD unsupported, add immutable 2-token license allowlist (AUSD + Monad USDC), update tests, redeploy mainnet, update docs/deployments/143.json
- [ ] /api/aurora/quote (dry quote to USDC on Monad, recipient = buyer address, AURORA_APP_KEY optional), amount shown before deposit
- [ ] Deposit address + QR, status polling, on SUCCESS prompt buyer to sign license()
- [ ] One real payment from Base USDC, hashes in EVIDENCE.md and /proof
- [ ] README section "Aurora Intents"
- [ ] Wallet connect modal; every on-chain action opens the wallet and sends a real signed transaction
