import { hamming256, type PdqResult } from "./pdq.ts";
import type { Hex } from "viem";

export const MATCH_THRESHOLD = 31;
export const MARK_Z_THRESHOLD = 6;
export const MIN_QUALITY = 50;

export interface EntryRef {
  commitment: Hex;
  author: Hex;
  pdq: Hex;
  touchBlock: bigint;
  touchTxIndex: number;
  touchLogIndex: number;
  /** True only when the touch block is Finalized. Pending entries never decide a verdict. */
  finalized: boolean;
  derivative: boolean;
}

export interface MarkProof {
  commitment: Hex;
  /** z recomputed by the caller from the published seed and the suspect file. */
  z: number;
}

export type Verdict =
  | { kind: "AUTHORED"; entry: EntryRef; distance: number; markZ: number }
  | { kind: "MATCHED"; entry: EntryRef; distance: number; laterMatches: EntryRef[] }
  | { kind: "CONTESTED"; candidates: EntryRef[] }
  | { kind: "NO_RECORD" };

export function distanceTo(query: PdqResult, entry: EntryRef): number {
  return Math.min(...query.dihedral.map((h) => hamming256(h, entry.pdq)));
}

const order = (a: EntryRef, b: EntryRef): number =>
  a.touchBlock < b.touchBlock ? -1 : a.touchBlock > b.touchBlock ? 1 : a.touchTxIndex - b.touchTxIndex || a.touchLogIndex - b.touchLogIndex;

/** Deterministic: pixels decide the match, finalized order decides the priority. */
export function decide(query: PdqResult, entries: EntryRef[], marks: MarkProof[]): Verdict {
  const matches = entries
    .filter((e) => e.finalized)
    .map((e) => ({ e, d: distanceTo(query, e) }))
    .filter((x) => x.d <= MATCH_THRESHOLD)
    .sort((a, b) => order(a.e, b.e));
  if (matches.length === 0) return { kind: "NO_RECORD" };
  const first = matches[0];
  const sameBlockOthers = matches.filter((m) => m.e.touchBlock === first.e.touchBlock && m.e.author !== first.e.author);
  if (sameBlockOthers.length > 0) {
    return { kind: "CONTESTED", candidates: [first.e, ...sameBlockOthers.map((m) => m.e)] };
  }
  const proof = marks.find((m) => m.commitment === first.e.commitment && m.z >= MARK_Z_THRESHOLD);
  if (proof) return { kind: "AUTHORED", entry: first.e, distance: first.d, markZ: proof.z };
  return { kind: "MATCHED", entry: first.e, distance: first.d, laterMatches: matches.slice(1).map((m) => m.e) };
}
