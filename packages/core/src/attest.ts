import type { Address, Hex } from "viem";
import { buildCertificate, type Certificate } from "./certificate.ts";
import type { RegistrySnapshot } from "./chain.ts";
import type { PdqResult } from "./pdq.ts";
import { decide, MATCH_THRESHOLD, type EntryRef, type MarkProof } from "./verdict.ts";

export interface AttestInput {
  chainId: number;
  contract: Address;
  query: PdqResult;
  entries: EntryRef[];
  snapshot: RegistrySnapshot;
  marks: MarkProof[];
  /** Unix seconds of a block, as read from the chain. */
  blockTime: (n: bigint) => number;
}

/** Single place where a certificate is assembled, so the server and the offline verifier agree byte for byte. */
export function attest(i: AttestInput): Certificate {
  const verdict = decide(i.query, i.entries, i.marks);
  const base = {
    chainId: i.chainId,
    contract: i.contract,
    verdict,
    threshold: MATCH_THRESHOLD,
    quality: i.query.quality,
  };
  if (verdict.kind === "NO_RECORD" || verdict.kind === "CONTESTED") {
    return buildCertificate({ ...base, finalized: false, ladder: [] });
  }
  const e = verdict.entry;
  const touch = i.snapshot.touched.find((t) => t.txHash && t.blockNumber === e.touchBlock && t.logIndex === e.touchLogIndex);
  const rev = i.snapshot.revealed.find((r) => r.commitment === e.commitment);
  const studio = i.snapshot.studios.find((s) => s.author === e.author);
  const ladder = [
    ...(touch ? [{ rung: "touched", at: i.blockTime(touch.blockNumber), blockNumber: touch.blockNumber.toString() }] : []),
    ...(rev ? [{ rung: "revealed", at: i.blockTime(rev.blockNumber), blockNumber: rev.blockNumber.toString() }] : []),
  ];
  return buildCertificate({
    ...base,
    author: e.author as Hex,
    studioEd25519Pub: studio?.ed25519Pub,
    commitment: e.commitment,
    touchTx: touch?.txHash,
    revealTx: rev?.txHash,
    touchBlock: e.touchBlock.toString(),
    revealBlock: rev?.blockNumber.toString(),
    finalized: e.finalized,
    ladder,
    distance: verdict.distance,
    markZ: verdict.kind === "AUTHORED" ? verdict.markZ : undefined,
  });
}
