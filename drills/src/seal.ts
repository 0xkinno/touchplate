/**
 * Phase 3: first real touch and reveal from a script (software passkey, real P-256 assertions verified by the
 * 0x100 precompile on Monad testnet). Registers a studio, seals a batch with one touch, waits for Finalized,
 * reveals every image, and writes the evidence file.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { toHex } from "viem";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  AUSD, ROOT, TP, SoftPasskey, buildBatch, deriveKeyFamilies, explorerTx, prepareImage, pub, saveJson, send,
  studioChallenge, touchChallenge, touchplateAbi, waitFinalized, walletFor,
} from "./lib.ts";

const COUNT = Number(process.env.SEAL_COUNT ?? 4);
const key = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const { account, wallet } = walletFor(key);
const chainId = BigInt(await pub.getChainId());
const fam = deriveKeyFamilies(crypto.getRandomValues(new Uint8Array(32)));
const passkey = new SoftPasskey();
const studioPub = toHex(ed25519.getPublicKey(fam.studioSeed));

const log: Record<string, unknown>[] = [];
const rec = (step: string, hash: string, extra: Record<string, unknown> = {}): void => {
  log.push({ step, hash, explorer: explorerTx(hash), ...extra });
  console.log(step, hash);
};

const reg = await send(
  wallet, account, "registerStudio", "registerStudio",
  [passkey.qx, passkey.qy, studioPub, passkey.assert(studioChallenge(chainId, account.address, passkey.qx, passkey.qy, studioPub))],
);
rec("registerStudio", reg.hash, { gasLimit: reg.gasLimit, estimate: reg.estimate });

const dir = resolve(ROOT, "spikes/out/coco");
const ids: string[] = JSON.parse(readFileSync(resolve(dir, "ids.json"), "utf8"));
const price = 12_000_000n;
const prepared = [];
for (const id of ids.slice(40, 40 + COUNT)) {
  prepared.push(await prepareImage(readFileSync(resolve(dir, id)), id, account.address, fam.markRoot, fam.studioSeed, chainId, price));
}
const batch = buildBatch(prepared.map((p) => p.commitment));
const nonce = (await pub.readContract({ address: TP, abi: touchplateAbi, functionName: "touchNonce", args: [account.address] })) as bigint;
const touch = await send(
  wallet, account, "touch", "touch",
  [batch.root, prepared.length, passkey.assert(touchChallenge(chainId, account.address, batch.root, prepared.length, nonce))],
);
rec("touch", touch.hash, { root: batch.root, count: prepared.length, block: touch.receipt.blockNumber, gasLimit: touch.gasLimit });
const ms = await waitFinalized(touch.receipt.blockNumber, touch.receipt.blockHash);
console.log("touch block finalized after", ms, "ms");

mkdirSync(resolve(ROOT, "spikes/out/sealed"), { recursive: true });
const sealed = [];
for (const [i, p] of prepared.entries()) {
  const r = await send(wallet, account, "reveal", "reveal", [
    batch.root, batch.proofs[i], p.pdq.hash, p.dihedral.root, p.salt, p.markSeedHash, p.manifestHash, price,
  ]);
  rec("reveal", r.hash, { commitment: p.commitment, block: r.receipt.blockNumber, gasLimit: r.gasLimit, estimate: r.estimate });
  writeFileSync(resolve(ROOT, `spikes/out/sealed/${i}.jpg`), p.published);
  sealed.push({ index: i, source: p.file, commitment: p.commitment, pdq: p.pdq.hash, quality: p.pdq.quality, markPsnr: p.markPsnr, revealTx: r.hash, seed: toHex(p.markSeed) });
}
saveJson("docs/evidence/seal-run.json", {
  chainId: Number(chainId), contract: TP, author: account.address, studioPublicKey: studioPub, ausd: AUSD,
  p256: { qx: passkey.qx, qy: passkey.qy }, root: batch.root, touchTx: touch.hash, finalizedAfterMs: ms, log,
  entries: sealed.map(({ seed: _seed, ...rest }) => rest),
});
saveJson("spikes/out/sealed/secrets.json", { markRoot: toHex(fam.markRoot), seeds: sealed.map((s) => s.seed) });
console.log("done", sealed.length, "entries");
