import { buildBatch, touchChallenge, touchplateAbi } from "@touchplate/core";
import { monad, monadTestnet } from "viem/chains";
import sharp from "sharp";
import {
  CHAIN_ID, certificateOf, cocoImages, fund, newActor, register, reveal, seal, writeReport, type Actor, type Sealed, type Tx,
} from "./harness.ts";
import { MAINNET, TP, pub, prepareImage, waitFinalized } from "./lib.ts";
import type { Hex } from "viem";

const txs: Tx[] = [];
const alice = newActor("Alice");
const bob = newActor("Bob");
await fund([alice.account.address, bob.account.address], 0.3);
txs.push(await register(alice), await register(bob));

// Part 1: near-identical image, adjacent blocks. Alice touches first.
const [x] = await cocoImages(180, 1);
const xPrime = await sharp(x.buf).jpeg({ quality: 95 }).modulate({ brightness: 1.01 }).toBuffer();
const a = await seal(alice, [x]);
const b = await seal(bob, [{ name: "near-identical.jpg", buf: xPrime }]);
txs.push(a.touch, b.touch, ...(await reveal(alice, a)), ...(await reveal(bob, b)));
const v1 = (await certificateOf(a.prepared[0].published)).verdict;
const aliceFirst = a.touchBlock < b.touchBlock;
const adjacentOk = aliceFirst && (v1.kind === "MATCHED" || v1.kind === "AUTHORED") && v1.entry.author.toLowerCase() === alice.account.address.toLowerCase();

// Part 2: same-block tie. Both touches are submitted back to back; retry with fresh images until they share a block.
async function touchNow(a: Actor, s: { root: Hex; count: number }): Promise<Hex> {
  const nonce = (await pub.readContract({ address: TP, abi: touchplateAbi, functionName: "touchNonce", args: [a.account.address] })) as bigint;
  const auth = a.passkey.assert(touchChallenge(CHAIN_ID, a.account.address, s.root, s.count, nonce));
  return a.wallet.writeContract({ address: TP, abi: touchplateAbi, functionName: "touch", args: [s.root, s.count, auth], gas: 200_000n, chain: MAINNET ? monad : monadTestnet, account: a.account } as never);
}
let tie: { verdict: string; sameBlock: boolean; aIndex?: number; bIndex?: number; attempts: number } = { verdict: "n/a", sameBlock: false, attempts: 0 };
for (let attempt = 1; attempt <= 6 && !tie.sameBlock; attempt++) {
  const [src] = await cocoImages(181 + attempt, 1);
  const srcB = await sharp(src.buf).jpeg({ quality: 94 }).toBuffer();
  const pa = await prepareImage(src.buf, `tie-a-${attempt}`, alice.account.address, alice.fam.markRoot, alice.fam.studioSeed, CHAIN_ID, 12_000_000n);
  const pb = await prepareImage(srcB, `tie-b-${attempt}`, bob.account.address, bob.fam.markRoot, bob.fam.studioSeed, CHAIN_ID, 12_000_000n);
  const ba = buildBatch([pa.commitment]);
  const bb = buildBatch([pb.commitment]);
  const [ha, hb] = await Promise.all([touchNow(alice, { root: ba.root, count: 1 }), touchNow(bob, { root: bb.root, count: 1 })]);
  const [ra, rb] = await Promise.all([pub.waitForTransactionReceipt({ hash: ha }), pub.waitForTransactionReceipt({ hash: hb })]);
  tie.attempts = attempt;
  txs.push({ label: `tie attempt ${attempt}: Alice touch (block ${ra.blockNumber}, index ${ra.transactionIndex})`, hash: ha });
  txs.push({ label: `tie attempt ${attempt}: Bob touch (block ${rb.blockNumber}, index ${rb.transactionIndex})`, hash: hb });
  if (ra.blockNumber === rb.blockNumber) {
    tie = { ...tie, sameBlock: true, aIndex: ra.transactionIndex, bIndex: rb.transactionIndex };
    await waitFinalized(ra.blockNumber, ra.blockHash);
    const sa: Sealed = { prepared: [pa], root: ba.root, proofs: ba.proofs, touch: { label: "", hash: ha }, touchBlock: ra.blockNumber, touchBlockHash: ra.blockHash };
    const sb: Sealed = { prepared: [pb], root: bb.root, proofs: bb.proofs, touch: { label: "", hash: hb }, touchBlock: rb.blockNumber, touchBlockHash: rb.blockHash };
    txs.push(...(await reveal(alice, sa)), ...(await reveal(bob, sb)));
    tie.verdict = (await certificateOf(pa.published)).verdict.kind;
  }
}
const tiePass = !tie.sameBlock || tie.verdict === "CONTESTED";
writeReport({
  id: "D4",
  title: "Same-image race",
  attack: "Two authors touch near-identical images in adjacent blocks, and then in the same block.",
  outcome: `Adjacent blocks: the earlier finalized touch won (Alice block ${a.touchBlock} vs Bob block ${b.touchBlock}): ${adjacentOk}. Same-block case: ${tie.sameBlock ? `reached after ${tie.attempts} attempt(s), verdict ${tie.verdict}, touch tx indices ${tie.aIndex} and ${tie.bIndex}` : `not reached in ${tie.attempts} attempts (back-to-back submissions landed in different blocks)`}.`,
  passed: adjacentOk && tiePass,
  txs,
  data: { adjacent: { aliceBlock: a.touchBlock, bobBlock: b.touchBlock, verdict: v1.kind }, tie },
});
