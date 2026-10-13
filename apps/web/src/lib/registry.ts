import "server-only";
import {
  attest, scanRegistry, toEntryRefs, type Certificate, type EntryRef, type MarkProof, type PdqResult, type RegistrySnapshot,
} from "@touchplate/core";
import { createPublicClient, http, type Hex } from "viem";
import { CHAIN_ID, DEPLOY_BLOCK, RPC_URL, TOUCHPLATE } from "./env";

export const client = createPublicClient({ transport: http(RPC_URL) });

interface Cache {
  snap: RegistrySnapshot;
  finalized: bigint;
  at: number;
}
let cache: Cache | undefined;
let inflight: Promise<Cache> | undefined;

/** Registry view. The chain is the database; this is only an in-memory cache that resumes from the last block. */
export async function getRegistry(maxAgeMs = 4000): Promise<Cache> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache;
  if (!inflight) {
    inflight = (async () => {
      const [snap, fin] = await Promise.all([
        scanRegistry(client, TOUCHPLATE, DEPLOY_BLOCK, undefined, cache?.snap),
        client.getBlock({ blockTag: "finalized" }),
      ]);
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
  const needed = new Set<bigint>();
  for (const r of refs) needed.add(r.touchBlock);
  for (const r of c.snap.revealed) needed.add(r.blockNumber);
  await Promise.all([...needed].map((n) => blockTimeOf(n)));
  const cert = attest({
    chainId: CHAIN_ID, contract: TOUCHPLATE, query, entries: refs, snapshot: c.snap, marks,
    blockTime: (n) => times.get(n) ?? 0,
  });
  return { cert, refs };
}

export const replacer = (_: string, v: unknown): unknown => (typeof v === "bigint" ? v.toString() : v);
export const jsonResponse = (data: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(data, replacer), { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });

export function isHex32(v: unknown): v is Hex {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}
