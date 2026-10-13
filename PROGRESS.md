# PROGRESS

## Session 1: Phase 0 complete

All Phase 0 tasks are verified with evidence in `docs/DISCOVERY.md`, `EVIDENCE.md` and `spikes/*.json`. Two documented exceptions: S5 (one degenerate synthetic image) and S6 (one unmarked value at |z| 3.02 of 400).

Decisions recorded:
- Large crops are out of scope for the watermark; no offset search, no crop variants. Bench reports 5/10/20% centre-crop recall honestly (`docs/LIMITATIONS.md`, README boundaries later).
- Git identity: `0xkinno <140649226+0xkinno@users.noreply.github.com>`; history rewritten and verified. No remote is configured, so nothing was pushed.

Carry into Phase 1 from the measurements:
- Verified is a native `commitState`; Finalized to Verified p50 is 913 ms; block time 0.304 s.
- Reveal window must be set in wall-clock terms (0.304 s per block).
- Entry layout: at most 4 slots in one page; low-S normalise assertions; explicit tight gas limits (gas is charged on the limit).
- Rotated copies need the earlier entry's dihedral variants committed.
- Qwen: base `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, model `qwen3.8-max`.

## Open items that need 0xkinno
1. Mainnet deploy, Aurora real payment and any mainnet transaction need a funded mainnet key. A real Base USDC payment moves real money and must be sent by 0xkinno from their own wallet; I will build the flow and record the hashes they produce.
2. A git remote URL if a push is wanted.
3. Real-device passkey tests (Phase 9).

## Owner requirements for Phase 8
- Wallet connect modal on every transacting page; every on-chain action (register studio, touch, reveal, approve, license, faucet, prove mark) opens the wallet and sends a real signed transaction.
- Aurora Intents "License from any chain" on /lookup and /c/[certId] (see TASK.md additions).
- Everything is built inside this folder; `reference/` stays ignored and unnamed.
