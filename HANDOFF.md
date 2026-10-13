# HANDOFF: continue the Touchplate build in the cloud

Read this file completely, then read `AGENTS.md`, then `TOUCHPLATE_BUILD_INSTRUCTION.md` (ask 0xkinno for it: it is
intentionally not in git) and `TASK.md`. This repo is owned and authored solely by **0xkinno**.

## 0. Non-negotiable rules (read first)

1. **Only 0xkinno is author, committer, co-author or contributor. Always.**
   - Never add `Co-Authored-By:` trailers. Never add "Generated with ..." lines to commits, PR bodies or files.
   - Never name an AI assistant as author, committer, contributor or in any trailer, in any commit, PR, issue or file.
   - Configure git before the first commit and re-check before every push:
     ```bash
     git config user.name  "0xkinno"
     git config user.email "140649226+0xkinno@users.noreply.github.com"
     git config core.hooksPath .githooks        # installs the guard hooks in this repo
     ```
   - If your tooling adds attribution automatically, disable it in the tool's own settings. For coding-agent CLIs this
     is usually a boolean such as `includeCoAuthoredBy: false` plus empty commit and pull-request attribution
     strings, kept in a **local, untracked** settings file. Do not commit tool settings directories.
   - Verify before every push: `bash scripts/check-authorship.sh` must print `authorship ok`.
   - A `commit-msg` hook and a GitHub Action (`.github/workflows/authorship.yml`) reject violations. Do not bypass
     them (`--no-verify` is forbidden). If a violation is already committed, rewrite it and tell 0xkinno.
2. **Never commit secrets.** `.env.local`, `apps/web/.env.local`, `spikes/.env`, private keys, API keys, Reown id,
   Qwen key, Aurora key are all ignored. If a secret ever lands in git history, stop and tell 0xkinno.
3. **Never invent.** Facts about APIs, addresses and behaviour come from source or a measured experiment, recorded in
   `docs/DISCOVERY.md` with a command and output or a tx hash.
4. **No names of other hackathon entries or sample repositories** in any committed file (`reference/` is gitignored and absent in cloud).
5. **No em dashes** in prose, UI copy or docs. **No hand-typed numbers**: they come from `scripts/generate-numbers.mjs`.
6. **Real wallet transactions only**: every on-chain action in the UI must open the user's wallet and send a real
   signed transaction. No simulated sends, no server-side signing for users.
7. No `any` in production TypeScript, no `console.log` in shipped code, no commented-out blocks, no stubs or TODOs.

## 1. What this is

Touchplate proves who made an image first, even after the internet strips the credit. A passkey touch seals a batch of
perceptual fingerprints under a hidden Merkle commitment on Monad; reveal is gated on the Finalized commit state; a
keyed watermark proves authorship on demand; an offline verifier recomputes everything from chain logs.

Hackathon: Monad Metropolis, primary track Trust, Identity and AI Infrastructure. Submission closes 14 Oct 2026 04:59 GMT+1.

## 2. Repository map

```
contracts/      Foundry. src/Touchplate.sol, src/Hamming.sol, test/Touchplate.t.sol (27 tests), script/Deploy.s.sol
packages/core/  TypeScript, no DOM deps: pdq, mark (watermark), commitment, keys, manifest, webauthn, ladder, chain
                (log scanner), verdict, certificate, attest, gas, softauth (software passkey for scripts), abi
apps/web/       Next.js 15 App Router. Routes: / /studio /lookup /ledger /investigate /proof /c/[id]
                API: /api/lookup /api/ledger(SSE) /api/entry/[id] /api/investigate /api/aurora/{quote,status}
verifier/       touchplate-verify CLI (image mode and certificate mode)
drills/         Scripts that talk to the chain: lib.ts, seal.ts (first real touch+reveal), scan.ts. D1..D10 go here.
spikes/         Phase 0 experiments and raw outputs (S1..S9). Results JSON files are committed.
scripts/        gen-masks.ts, export-abis.mjs, generate-numbers.mjs, check-authorship.*
docs/           DISCOVERY, LIMITATIONS, deployments/{10143,143}.json, evidence/
bench/          (to build) dataset, transforms, arms, results
indexer/        (to build) Envio HyperIndex config and handlers
```

Package manager: **pnpm 12** workspace. Node 20+ (24 used locally). Foundry 1.8.x (install with `foundryup`).
TypeScript is pinned to **5.9.3** everywhere (Next 15 needs the JS API; TS 7 breaks it and duplicates viem types).

## 3. Deployed contracts (all details also in `docs/deployments/*.json`)

| Network | Chain | Touchplate | Deploy block | Tokens (licence) |
|---|---|---|---|---|
| Monad mainnet | 143 | `0x05648FAa32eeF566b97Cc8E0BAB1C15D7fBeeCF1` | 113077560 | AUSD `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`, USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| Monad testnet | 10143 | `0x13a5941833F568Cb80d4958ED22B4B9d44a87930` | 70705967 | AUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3` |

Testnet AUSD faucet (proxy): `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`, call `requestFunds(address)`.
Deploy txs: mainnet `0x65203152bfc9a12b64aeb4fcf708c87716480519b1e5172a8cc554daf462ad1b`,
testnet `0x748d88345cd7b0052f9614e2a4f0e67f6e01ffa252b32b8e9e4b0bfd3e111bad`. Fee recipient is the deployer, 100 bps,
hard cap 300 bps in code. The contract has no admin over entries or priority.

## 4. Environment

`.env.local` at the repo root is the single source of truth and is **not in git**. Ask 0xkinno for it, or create it
from this list. Mirror every `NEXT_PUBLIC_*`, `QWEN_*`, `AURORA_*`, `ENVIO_*` value into Vercel
(`vercel env add`, or the dashboard) and into `apps/web/.env.local`.

```
NEXT_PUBLIC_CHAIN_ID=143
NEXT_PUBLIC_RPC_URL=https://rpc.monad.xyz
NEXT_PUBLIC_WS_URL=wss://rpc.monad.xyz
NEXT_PUBLIC_EXPLORER=https://monadscan.com
NEXT_PUBLIC_TOUCHPLATE_ADDRESS=0x05648FAa32eeF566b97Cc8E0BAB1C15D7fBeeCF1
NEXT_PUBLIC_DEPLOY_BLOCK=113077560
NEXT_PUBLIC_AUSD_ADDRESS=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a
NEXT_PUBLIC_USDC_ADDRESS=0x754704Bc059F8C67012fEd69BC8A327a5aafb603
NEXT_PUBLIC_AUSD_FAUCET=                      # empty on mainnet
NEXT_PUBLIC_REOWN_PROJECT_ID=<from 0xkinno>   # WalletConnect / Reown project id
QWEN_API_KEY=<from 0xkinno>                   # Alibaba Model Studio key
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.8-max
AURORA_APP_KEY=                               # optional; public 1Click API is used when empty
ENVIO_GRAPHQL_URL=                            # set after the Envio Cloud deploy
# scripts only (never in Vercel):
MAINNET_DEPLOYER_PRIVATE_KEY=<from 0xkinno>   # address 0xF8c19f45BD40A073f6876EF59a00C482D6Ba45ea
DEPLOYER_PRIVATE_KEY=<testnet key from 0xkinno>
MONAD_MAINNET_RPC=https://rpc.monad.xyz
MONAD_TESTNET_RPC=https://testnet-rpc.monad.xyz
```

Network switch: scripts read `NETWORK` and default to mainnet; set `NETWORK=testnet` for testnet. The web app reads `NEXT_PUBLIC_CHAIN_ID`.
**RPC limits**: public RPC `eth_getLogs` is capped at 100 blocks; `packages/core/src/chain.ts` already chunks.
Gas is charged on the declared limit: always send a tight explicit limit (`gasFor`).

## 5. Run it

```bash
pnpm install                      # approve builds if prompted (esbuild, sharp): pnpm approve-builds --all
(cd contracts && forge install foundry-rs/forge-std --no-git && forge test)   # 27 tests
(cd packages/core && npx vitest run)                                          # 18 tests, one hits live testnet RPC
cd apps/web && npx next build && npx next start -p 3100                       # or: npx next dev -p 3100
cd apps/web && BASE_URL=http://localhost:3100 node tests/e2e.mjs              # Playwright end-to-end (needs funded key)
node scripts/generate-numbers.mjs                                              # regenerates numbers.json and README block
cd drills && NETWORK=mainnet SEAL_COUNT=8 npx tsx src/seal.ts                  # real touch + reveals with a software passkey
cd verifier && npx tsx src/cli.ts --image x.jpg --contract <addr> --from-block <n> --rpc <url>
```

Playwright: `npx playwright install chromium`. The e2e test injects an EIP-6963 test wallet backed by a funded key
and a CDP virtual authenticator with PRF, and counts `eth_sendTransaction` requests to prove each action asks the wallet.

## 6. Current state (updated at the end of the last session)

**Live**: https://touchplate.vercel.app (Vercel project `touchplate`, scope `kinnoskis-projects`, root `apps/web`,
production env vars set from `apps/web/.env.local`). Contract on mainnet: `0x05648FAa32eeF566b97Cc8E0BAB1C15D7fBeeCF1`.

Done and verified:
- Phase 0: all spikes S1 to S9 with evidence (`docs/DISCOVERY.md`).
- Phases 1 to 3: core package (18 tests), contract (27 tests), deploys on testnet and mainnet, first real touch and reveals.
- Phase 5: verifier CLI (image and certificate modes PASS).
- Phase 6: break campaign D1 to D10 ran on mainnet (`docs/drills/`, all as expected); benchmark harness in `bench/`.
- Phases 7 and 8: API routes, Qwen investigator with validator, Aurora quote/status routes (key in URL path per Aurora docs,
  validated), landing, Studio, Lookup, Ledger (polling, not SSE, because serverless cuts streams), Investigator, Proof,
  entry pages with OG image, wallet connect modal (Reown AppKit), real wallet transactions for every on-chain action.
- Phase 9: Playwright end to end on the live site passes (`apps/web/tests/e2e.mjs`), layout suite passes on nine viewports
  (`apps/web/tests/layout.mjs`).
- Phase 10: README, ARCHITECTURE, INVARIANTS, PROOF, LIMITATIONS, MILESTONES, AI_USAGE, EVIDENCE, `.env.example`.

## 7. Remaining work (everything below needs a human, a device, or a credential)

1. **Benchmark finish**: `cd bench && npx tsx src/run.ts` (resumable; reconstructs state from chain). It writes
   `bench/results/summary.json`; then `node scripts/generate-numbers.mjs`, rebuild and redeploy so landing, `/proof`
   and the README numbers block pick up the benchmark. If the log shows "thief funding did not arrive", fund the
   deployer and rerun.
2. **Envio**: Envio's CLI does not run on Windows. Use Envio Cloud (https://envio.dev, connect the GitHub repo, root
   `indexer`) or WSL. It generates code remotely. Then copy the hosted GraphQL URL into `ENVIO_GRAPHQL_URL` (local and
   Vercel). For HyperSync create a free token at https://app.envio.dev/api-tokens and add `ENVIO_API_TOKEN`; then add
   the `--hypersync` path to the verifier (do not ship it untested).
3. **Reown allowlist**: add `touchplate.vercel.app` (and `localhost`) to the Reown project's domain allowlist.
4. **Real passkey runs** on an iPhone (iCloud Keychain) and Android or Chrome with Google Password Manager. All runs so
   far used a CDP virtual authenticator.
5. **Aurora real payment**: one Base USDC payment funded by 0xkinno through `/lookup` > License > "License from any
   chain". Record every hash in `EVIDENCE.md`.
6. **Demo video** (use the `hackathon-demo-video` workflow), **portal submission**, optional custom domain.
7. **Hero photograph**: the hero uses generated SVG and CSS art; swap in a licensed photograph if available (no credit in UI).
8. **Lighthouse and AA contrast pass** on the live site.

## 8. Known gotchas (each cost real time)

- Bash heredocs with apostrophes break some shells; write files with an editor tool.
- Windows: `pkill` does not stop node; kill by port. Delete `.next` only when no dev server is running.
- `vm.prank` in Foundry tests is consumed by the next external call, including precompile calls: build the
  WebAuthn assertion **before** `vm.prank`.
- OZ `P256.verify` rejects high-s: low-s normalise (core `derToRs` and `SoftPasskey` do).
- PDQ via the C++ binding emits bits MSB-first; the Python reference thumbnails to 512 px before hashing.
- PDQ crop tolerance is only about 2 to 3% per axis. Crops are declared out of scope (`docs/LIMITATIONS.md`).
- framer-motion must stay on 11.x (14.x had a broken ESM export at the time of writing).
- Receipts on Monad report `gasUsed == gasLimit` because gas is charged on the limit.
- The `finalized` block tag lags latest by about 2 blocks; `Verified` is a native `commitState` on `monadNewHeads`.

## 9. Commit and push discipline

Small commits, imperative messages, no trailers, no attribution lines. Push to `origin main`
(`https://github.com/0xkinno/touchplate`). Run the authorship check first. If the cloud environment has no push
credentials, produce the commits locally and tell 0xkinno exactly what to push.
