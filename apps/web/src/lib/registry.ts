import "server-only";
import {
  attest, scanRegistry, snapshotFromJson, toEntryRefs, type Certificate, type EntryRef, type MarkProof, type PdqResult, type RegistrySnapshot,
} from "@touchplate/core";
import { createPublicClient, http, type Hex } from "viem";
import snapshotFile from "@/data/registry-snapshot.json";
import { CHAIN_ID, DEPLOY_BLOCK, RPC_URL, TOUCHPLATE } from "./env";

export const client = createPublicClient({ transport: http(RPC_URL, { retryCount: 6, retryDelay: 400, timeout: 15_000 }) });

interface Cache {
  snap: RegistrySnapshot;
  finalized: bigint;
  at: number;
}
function seeded(): Cache | undefined {
  try {
    const f = snapshotFromJson(JSON.stringify(snapshotFile));
    if (f.meta.contract.toLowerCase() !== TOUCHPLATE.toLowerCase() || f.meta.chainId !== CHAIN_ID) return undefined;
    return { snap: f.snapshot, finalized: f.snapshot.scannedTo, at: 0 };
  } catch {
    return undefined;
  }
}
/** About 8 seconds of log pages at the public RPC's 100-block limit and 12-way concurrency. */
const BUDGET_BLOCKS = 60_000n;
let cache: Cache | undefined = seeded();
let inflight: Promise<Cache> | undefined;

/** Registry view. The chain is the database; this is only an in-memory cache that resumes from the last block. */
export async function getRegistry(maxAgeMs = 4000): Promise<Cache> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache;
  if (!inflight) {
    inflight = (async () => {
      const fin = await client.getBlock({ blockTag: "finalized" });
      const tip = await client.getBlockNumber();
      const from = cache ? cache.snap.scannedTo + 1n : DEPLOY_BLOCK;
      // Catch up in budgeted slices so a cold start answers within the function limit; the next call continues.
      const slice = BUDGET_BLOCKS;
      const to = tip - from > slice ? from + slice - 1n : tip;
      const base = cache?.snap;
      const snap = to >= from ? await scanRegistry(client, TOUCHPLATE, DEPLOY_BLOCK, to, base) : (base as RegistrySnapshot);
      cache = { snap, finalized: fin.number, at: Date.now() };
      return cache;
    })().finally(() => {
      inflight = undefined;
    });
  }
  return inflight;
}

export function refsOf(c: Cache): EntryRef[] {
  return toEntryRefs(c.snap, c.finalized);
}

const times = new Map<bigint, number>();
export async function blockTimeOf(n: bigint): Promise<number> {
  const hit = times.get(n);
  if (hit !== undefined) return hit;
  const b = await client.getBlock({ blockNumber: n });
  times.set(n, Number(b.timestamp));
  return Number(b.timestamp);
}

export async function certificateFor(query: PdqResult, marks: MarkProof[] = []): Promise<{ cert: Certificate; refs: EntryRef[] }> {
  const c = await getRegistry();
  const refs = refsOf(c);
  const build = (): Certificate =>
    attest({ chainId: CHAIN_ID, contract: TOUCHPLATE, query, entries: refs, snapshot: c.snap, marks, blockTime: (n) => times.get(n) ?? 0 });
  // Decide first, then fetch timestamps only for the blocks the verdict actually cites (keeps RPC load low).
  let cert = build();
  const v = cert.verdict;
  if (v.kind === "MATCHED" || v.kind === "AUTHORED") {
    const rev = c.snap.revealed.find((r) => r.commitment === v.entry.commitment);
    const needed = [v.entry.touchBlock, ...(rev ? [rev.blockNumber] : [])];
    await Promise.all(needed.map((n) => blockTimeOf(n)));
    cert = build();
  }
  return { cert, refs };
}

export const replacer = (_: string, v: unknown): unknown => (typeof v === "bigint" ? v.toString() : v);
export const jsonResponse = (data: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(data, replacer), { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });

export function isHex32(v: unknown): v is Hex {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}
