# TASK

### Phase 0: Discovery and reference
- [x] Repo init, `.gitignore` (node_modules, .env*, reference/, out/, cache/, qa/), authorship config, `includeCoAuthoredBy: false`
- [x] Clone all reference repos; write per-repo notes and PLAYBOOK.md (inside reference/)
- [ ] S1 commit-state ladder spike with 100 timed txs
- [ ] S2 gas-on-limit spike
- [x] S3 Mera key families + P-256 pubkey capture
- [ ] S4 WebAuthn assertion verified via precompile 0x0100 on testnet
- [x] S5 PDQ TS port parity with Python pdqhash
- [x] S6 watermark PSNR and z-score
- [ ] S7 Qwen model id and tool call
- [ ] S8 AUSD testnet address, faucet, decimals
- [x] S9 storage layout gas
- [ ] docs/DISCOVERY.md complete; final gate passed

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
- S1: block-level ladder measured (286 complete ladders, `spikes/s1-ladder-blocks.json`). The 100 own timed txs are pending testnet MON.
- S2, S4 on-chain, S8 faucet tx: scripted in `spikes/funded.ts`, pending testnet MON for the spike account.
- S4: valid, tampered, wrong-challenge, wrong-key and high-s cases verified through the live testnet precompile via `eth_call` state override (`spikes/s4-sim.json`); on-chain tx hashes still pending.
- S5: 49 of 50 images within 0 bits of the reference; one degenerate synthetic image (quality 44) differs. Documented in `docs/DISCOVERY.md`.
- S6: PSNR and z conditions met; the unmarked-below-3 condition is missed by one value (3.02 of 400). Documented.
- S7: model id and endpoint documented; tool-call round trip pending an API key and workspace id.
- Final gate is not marked: funded spikes are open.
