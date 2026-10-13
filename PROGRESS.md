# PROGRESS

## Session 1 (Phase 0)

Done and verified (see `docs/DISCOVERY.md` for outputs):
- Repository, ignore rules, authorship config, workspace, Foundry toolchain in `.tools/` (ignored).
- Reference research completed under `reference/` (ignored).
- S1 block-level ladder, S3 key families, S4 precompile verification (simulated on the live RPC), S5 PDQ parity and transform behaviour, S6 watermark, S7 model id from documentation, S8 token and faucet interface, S9 storage layout.

Open, all blocked on inputs only 0xkinno can supply:
1. Testnet MON for `0xDe1413543adAB1C07f87Ff23Eb39946EBc19a20D` (a throwaway spike key in the ignored `spikes/.env`). The faucet is behind a bot challenge, so it must be claimed by hand at https://faucet.monad.xyz. Then `cd spikes && npx tsx funded.ts` runs S8, S4, S2 and S1 and writes the evidence files.
2. `QWEN_API_KEY` and the Model Studio workspace id for the S7 tool-call round trip.
3. The git author email for 0xkinno (currently `0xkinno@users.noreply.github.com`, a placeholder that can be changed before the first push).
4. A Reown project id (`NEXT_PUBLIC_REOWN_PROJECT_ID`) for the external-wallet connect modal in Phase 8.

Decisions to confirm before Phase 1 (from measured results):
- Crop tolerance is about 2 to 3% per axis, so "modest crops" cannot be claimed. Choose: commit centre-crop variants, add offset search to mark detection, or declare crops out of scope.
- Rotated copies need the earlier entry's dihedral variants committed (one extra slot) for on-chain priority recording.
- Reveal window must be set in wall-clock terms (0.304 s per block).

## Owner requirements recorded for Phase 8
- A wallet connect modal on every page that can transact. Every on-chain action (register studio, touch, reveal, approve, license, faucet, prove mark) must open the wallet confirmation and send a real signed transaction; no simulated sends.
- All build files and documents live inside this folder. `reference/` stays ignored and is never named in committed files.
- Sole author and contributor: 0xkinno. No co-author trailers.
