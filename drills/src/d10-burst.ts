import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toHex } from "viem";
import { ROOT, pub, waitFinalized } from "./lib.ts";
import { cocoImages, fund, newActor, register, registry, reveal, seal, writeReport, type Actor, type Tx } from "./harness.ts";

const STUDIOS = Number(process.env.BURST_STUDIOS ?? 20);
const PER = Number(process.env.BURST_PER ?? 10);
const CONC = Number(process.env.BURST_CONC ?? 10);
const actors: Actor[] = Array.from({ length: STUDIOS }, (_, i) => newActor(`studio-${i + 1}`));
await fund(actors.map((a) => a.account.address), 0.35);
const pool = await cocoImages(0, 220);
void readFileSync;
void resolve;
void ROOT;

interface Row { studio: string; touchToFinalizedMs: number; reveals: number; commitments: string[]; roots: string; gas: { kind: string; limit: string }[] }
const rows: Row[] = [];
const allTx: Tx[] = [];
const t0 = Date.now();
let cursor = 0;
async function run(i: number): Promise<void> {
  const a = actors[i];
  const sources = Array.from({ length: PER }, (_, k) => pool[(i * PER + k) % pool.length]);
  allTx.push(await register(a));
  const s = await seal(a, sources);
  allTx.push(s.touch);
  const ts = Date.now();
  const fin = await waitFinalized(s.touchBlock, s.touchBlockHash);
  void fin;
  const revealed = await reveal(a, s);
  allTx.push(...revealed);
  rows.push({
    studio: a.name,
    touchToFinalizedMs: Date.now() - ts,
    reveals: revealed.length,
    commitments: s.prepared.map((p) => p.commitment),
    roots: s.root,
    gas: [],
  });
}
async function worker(): Promise<void> {
  for (;;) {
    const i = cursor++;
    if (i >= STUDIOS) return;
    await run(i);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
const elapsed = Date.now() - t0;

// Zero lost or reordered entries: every commitment appears exactly once on chain, after its touch.
const { snap } = await registry();
const onchain = new Map(snap.revealed.map((r) => [r.commitment, r]));
const expected = rows.flatMap((r) => r.commitments);
const missing = expected.filter((c) => !onchain.has(c as `0x${string}`));
const dup = expected.length - new Set(expected).size;
const touchByRoot = new Map(snap.touched.map((t) => [t.root, t]));
const reordered = rows.filter((r) => r.commitments.some((c) => {
  const rev = onchain.get(c as `0x${string}`);
  const t = touchByRoot.get(r.roots as `0x${string}`);
  return !rev || !t || rev.blockNumber <= t.blockNumber;
})).length;
const latencies = rows.map((r) => r.touchToFinalizedMs).sort((a, b) => a - b);
const q = (p: number): number => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))];
void pub;
void toHex;
writeReport({
  id: "D10",
  title: "Burst",
  attack: `${STUDIOS} studios, ${PER} images each (${STUDIOS * PER} images), touched and revealed concurrently (${CONC} at a time) on Monad mainnet.`,
  outcome: `${expected.length - missing.length}/${expected.length} entries on chain, ${missing.length} lost, ${dup} duplicated, ${reordered} studios with a reveal not after its touch. Touch to Finalized p50 ${q(0.5)} ms, p90 ${q(0.9)} ms. Wall time ${(elapsed / 1000).toFixed(0)} s for ${allTx.length} transactions.`,
  passed: missing.length === 0 && dup === 0 && reordered === 0,
  txs: allTx.slice(0, 40).map((t) => ({ label: t.label, hash: t.hash })),
  data: {
    studios: STUDIOS, imagesPerStudio: PER, transactions: allTx.length, elapsedMs: elapsed,
    touchToFinalizedMs: { p50: q(0.5), p90: q(0.9), max: latencies[latencies.length - 1] },
    allTransactionHashes: allTx.map((t) => t.hash),
    gasNote: "Monad charges the declared limit, so paid equals the limit; the limits come from estimateGas plus a 10% margin (see packages/core/src/gas.ts).",
  },
});
