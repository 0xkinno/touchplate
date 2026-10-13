import { decodeEventLog, type Address, type Hex, type Log, type PublicClient } from "viem";
import { touchplateAbi } from "./abi.ts";
import type { EntryRef, MarkProof } from "./verdict.ts";

export interface LogMeta {
  blockNumber: bigint;
  blockHash: Hex;
  txHash: Hex;
  txIndex: number;
  logIndex: number;
}

export interface RevealedEvent extends LogMeta {
  commitment: Hex;
  root: Hex;
  author: Address;
  pdq: Hex;
  dihedralRoot: Hex;
  touchBlock: bigint;
  markSeedHash: Hex;
  manifestHash: Hex;
  licensePrice: bigint;
}
export interface TouchedEvent extends LogMeta { root: Hex; author: Address; count: number; nonce: bigint }
export interface PriorityEvent extends LogMeta { earlier: Hex; later: Hex; distance: bigint }
export interface MarkEvent extends LogMeta { commitment: Hex; suspectSha256: Hex; seed: Hex; zMilli: number; uri: string }
export interface LicenseEvent extends LogMeta { commitment: Hex; licensee: Address; author: Address; token: Address; paid: bigint; fee: bigint }
export interface StudioEvent extends LogMeta { author: Address; qx: Hex; qy: Hex; ed25519Pub: Hex }

export interface RegistrySnapshot {
  studios: StudioEvent[];
  touched: TouchedEvent[];
  revealed: RevealedEvent[];
  priority: PriorityEvent[];
  marks: MarkEvent[];
  licenses: LicenseEvent[];
  scannedFrom: bigint;
  scannedTo: bigint;
}

export const emptySnapshot = (from: bigint): RegistrySnapshot => ({
  studios: [], touched: [], revealed: [], priority: [], marks: [], licenses: [], scannedFrom: from, scannedTo: from - 1n,
});

const meta = (l: Log): LogMeta => ({
  blockNumber: l.blockNumber as bigint,
  blockHash: l.blockHash as Hex,
  txHash: l.transactionHash as Hex,
  txIndex: l.transactionIndex as number,
  logIndex: l.logIndex as number,
});

function absorb(snap: RegistrySnapshot, logs: Log[]): void {
  for (const l of logs) {
    let ev: { eventName: string; args: Record<string, unknown> };
    try {
      ev = decodeEventLog({ abi: touchplateAbi, data: l.data, topics: l.topics }) as never;
    } catch {
      continue;
    }
    const a = ev.args;
    const m = meta(l);
    switch (ev.eventName) {
      case "StudioRegistered": snap.studios.push({ ...m, author: a.author as Address, qx: a.qx as Hex, qy: a.qy as Hex, ed25519Pub: a.ed25519Pub as Hex }); break;
      case "Touched": snap.touched.push({ ...m, root: a.root as Hex, author: a.author as Address, count: Number(a.count), nonce: a.nonce as bigint }); break;
      case "Revealed": snap.revealed.push({
        ...m, commitment: a.commitment as Hex, root: a.root as Hex, author: a.author as Address, pdq: a.pdq as Hex,
        dihedralRoot: a.dihedralRoot as Hex, touchBlock: BigInt(a.touchBlock as number), markSeedHash: a.markSeedHash as Hex,
        manifestHash: a.manifestHash as Hex, licensePrice: BigInt(a.licensePrice as bigint),
      }); break;
      case "PriorityRecorded": snap.priority.push({ ...m, earlier: a.earlier as Hex, later: a.later as Hex, distance: a.distance as bigint }); break;
      case "MarkProven": snap.marks.push({ ...m, commitment: a.commitment as Hex, suspectSha256: a.suspectSha256 as Hex, seed: a.seed as Hex, zMilli: Number(a.zMilli), uri: a.uri as string }); break;
      case "Licensed": snap.licenses.push({ ...m, commitment: a.commitment as Hex, licensee: a.licensee as Address, author: a.author as Address, token: a.token as Address, paid: a.paid as bigint, fee: a.fee as bigint }); break;
      default: break;
    }
  }
}

/**
 * Scans contract logs in 100-block chunks (the public RPC limit) with bounded concurrency.
 * Resumable: pass a previous snapshot to continue from `scannedTo + 1`.
 */
export async function scanRegistry(
  client: PublicClient,
  address: Address,
  fromBlock: bigint,
  toBlock?: bigint,
  prev?: RegistrySnapshot,
  opts: { chunk?: bigint; concurrency?: number } = {},
): Promise<RegistrySnapshot> {
  const chunk = opts.chunk ?? 100n;
  const conc = opts.concurrency ?? 12;
  const snap = prev ?? emptySnapshot(fromBlock);
  const start = prev ? prev.scannedTo + 1n : fromBlock;
  const end = toBlock ?? (await client.getBlockNumber());
  const ranges: [bigint, bigint][] = [];
  for (let b = start; b <= end; b += chunk) ranges.push([b, b + chunk - 1n > end ? end : b + chunk - 1n]);
  let next = 0;
  const results = new Map<number, Log[]>();
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= ranges.length) return;
      const [f, t] = ranges[i];
      for (let attempt = 0; ; attempt++) {
        try {
          results.set(i, (await client.getLogs({ address, fromBlock: f, toBlock: t })) as Log[]);
          break;
        } catch (e) {
          if (attempt >= 4) throw e;
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, ranges.length || 1) }, worker));
  for (let i = 0; i < ranges.length; i++) absorb(snap, results.get(i) ?? []);
  snap.scannedTo = end;
  return snap;
}

/** Builds verdict-engine inputs. An entry is finalized only when its touch block is at or below the finalized head. */
export function toEntryRefs(snap: RegistrySnapshot, finalizedHead: bigint): EntryRef[] {
  const touchByRoot = new Map(snap.touched.map((t) => [t.root, t]));
  const derivative = new Set(snap.priority.map((p) => p.later));
  return snap.revealed.map((r) => {
    const t = touchByRoot.get(r.root);
    return {
      commitment: r.commitment,
      author: r.author,
      pdq: r.pdq,
      touchBlock: t?.blockNumber ?? r.touchBlock,
      touchTxIndex: t?.txIndex ?? 0,
      touchLogIndex: t?.logIndex ?? 0,
      finalized: (t?.blockNumber ?? r.touchBlock) <= finalizedHead && r.blockNumber <= finalizedHead,
      derivative: derivative.has(r.commitment),
    };
  });
}

export function proofsToMarks(snap: RegistrySnapshot, zByCommitment: Map<Hex, number>): MarkProof[] {
  return snap.marks.flatMap((m) => {
    const z = zByCommitment.get(m.commitment);
    return z === undefined ? [] : [{ commitment: m.commitment, z }];
  });
}
