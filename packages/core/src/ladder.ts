import type { Hex, PublicClient } from "viem";

export type Rung = "submitted" | "proposed" | "voted" | "finalized" | "verified" | "abandoned";
type NativeState = "Proposed" | "Voted" | "Finalized" | "Verified";
const RANK: Record<NativeState, number> = { Proposed: 0, Voted: 1, Finalized: 2, Verified: 3 };
const RUNG: Record<NativeState, Rung> = { Proposed: "proposed", Voted: "voted", Finalized: "finalized", Verified: "verified" };

export interface LadderOptions {
  /** `wss://` endpoint exposing monadNewHeads. When absent or failing, block tags are polled. */
  wsUrl?: string;
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  now?: () => number;
}

export type OnRung = (rung: Rung, at: number, blockNumber?: bigint) => void;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Tracks one transaction through Monad's commit states. Uses the native `commitState` field of
 * `monadNewHeads` (Verified is native, not derived) and falls back to polling `safe` and `finalized`.
 * Resolves once the block is Verified, or throws if the block was abandoned.
 */
export async function trackLadder(
  client: PublicClient,
  hash: Hex,
  onRung: OnRung,
  opts: LadderOptions = {},
): Promise<{ blockNumber: bigint; blockHash: Hex }> {
  const now = opts.now ?? Date.now;
  const poll = opts.pollMs ?? 250;
  const deadline = now() + (opts.timeoutMs ?? 120_000);
  onRung("submitted", now());
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: opts.timeoutMs ?? 120_000 });
  const { blockNumber, blockHash } = receipt;
  const seen = new Set<Rung>();
  const emit = (r: Rung): void => {
    if (seen.has(r)) return;
    seen.add(r);
    onRung(r, now(), blockNumber);
  };
  emit("proposed");

  let ws: WebSocket | undefined;
  if (opts.wsUrl && typeof WebSocket !== "undefined") {
    try {
      ws = new WebSocket(opts.wsUrl);
      ws.onopen = () => ws?.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["monadNewHeads"] }));
      ws.onmessage = (ev: MessageEvent) => {
        const r = (JSON.parse(String(ev.data)) as { params?: { result?: { hash?: string; commitState?: NativeState } } }).params?.result;
        if (r?.hash === blockHash && r.commitState && r.commitState in RANK) {
          for (const s of Object.keys(RANK) as NativeState[]) if (RANK[s] <= RANK[r.commitState]) emit(RUNG[s]);
        }
      };
    } catch {
      ws = undefined;
    }
  }

  try {
    while (!seen.has("verified")) {
      if (opts.signal?.aborted) throw new Error("aborted");
      if (now() > deadline) throw new Error("ladder tracking timed out");
      const [safe, fin] = await Promise.all([
        client.getBlock({ blockTag: "safe" }),
        client.getBlock({ blockTag: "finalized" }),
      ]);
      if (fin.number >= blockNumber) {
        const canonical = await client.getBlock({ blockNumber });
        if (canonical.hash !== blockHash) {
          emit("abandoned");
          throw new Error("block was abandoned in favour of another proposal");
        }
        emit("voted");
        emit("finalized");
        // Verified is `finalized head >= block + D` with D = 3; the WS feed reports it natively.
        if (fin.number >= blockNumber + 3n) emit("verified");
      } else if (safe.number >= blockNumber) {
        const canonical = await client.getBlock({ blockNumber });
        if (canonical.hash === blockHash) emit("voted");
      }
      await sleep(poll);
    }
  } finally {
    ws?.close();
  }
  return { blockNumber, blockHash };
}

/** True only when a transaction's block has reached Finalized and hash-matches (invariant I3 gate). */
export async function isFinalized(client: PublicClient, blockNumber: bigint, blockHash: Hex): Promise<boolean> {
  const fin = await client.getBlock({ blockTag: "finalized" });
  if (fin.number < blockNumber) return false;
  const canonical = await client.getBlock({ blockNumber });
  return canonical.hash === blockHash;
}
