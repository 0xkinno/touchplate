import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  attest, buildBatch, deriveKeyFamilies, scanRegistry, snapshotFromJson, studioChallenge, toEntryRefs, touchChallenge,
  SoftPasskey, touchplateAbi, type Certificate, type KeyFamilies, type RegistrySnapshot,
} from "@touchplate/core";
import { ed25519 } from "@noble/curves/ed25519.js";
import { toHex, type Address, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { encodeFunctionData } from "viem";
import { monad, monadTestnet } from "viem/chains";
import {
  DEPLOYER_KEY, MAINNET, ROOT, TP, explorerTx, pdqOf, prepareImage, pub, send, waitFinalized, walletFor, type PreparedImage,
} from "./lib.ts";

export const CHAIN_ID = BigInt(await pub.getChainId());
export const deployer = walletFor(DEPLOYER_KEY);
const PRICE = 12_000_000n;

export interface Actor {
  name: string;
  key: Hex;
  account: ReturnType<typeof walletFor>["account"];
  wallet: ReturnType<typeof walletFor>["wallet"];
  passkey: SoftPasskey;
  fam: KeyFamilies;
  studioPub: Hex;
}

export interface Tx {
  label: string;
  hash: Hex;
}

export function newActor(name: string): Actor {
  const key = generatePrivateKey();
  const w = walletFor(key);
  const fam = deriveKeyFamilies(crypto.getRandomValues(new Uint8Array(32)));
  return { name, key, ...w, passkey: new SoftPasskey(), fam, studioPub: toHex(ed25519.getPublicKey(fam.studioSeed)) };
}

/** Sends MON from the deployer with sequential nonces and waits for all receipts. */
export async function fund(targets: Address[], mon: number): Promise<void> {
  let nonce = await pub.getTransactionCount({ address: deployer.account.address, blockTag: "pending" });
  const hashes: Hex[] = [];
  for (const to of targets) {
    hashes.push(
      await deployer.wallet.sendTransaction({
        to, value: BigInt(Math.round(mon * 1e6)) * 10n ** 12n, gas: 21_000n, nonce: nonce++,
        chain: undefined, account: deployer.account,
      }),
    );
  }
  await Promise.all(hashes.map((hash) => pub.waitForTransactionReceipt({ hash })));
}

export async function register(a: Actor): Promise<Tx> {
  const r = await send(a.wallet, a.account, "registerStudio", "registerStudio", [
    a.passkey.qx, a.passkey.qy, a.studioPub, a.passkey.assert(studioChallenge(CHAIN_ID, a.account.address, a.passkey.qx, a.passkey.qy, a.studioPub)),
  ]);
  return { label: `${a.name} registers studio`, hash: r.hash };
}

export interface Sealed {
  prepared: PreparedImage[];
  root: Hex;
  proofs: Hex[][];
  touch: Tx;
  touchBlock: bigint;
  touchBlockHash: Hex;
}

export async function seal(a: Actor, sources: { name: string; buf: Buffer }[], price = PRICE): Promise<Sealed> {
  const prepared: PreparedImage[] = [];
  for (const s of sources) prepared.push(await prepareImage(s.buf, s.name, a.account.address, a.fam.markRoot, a.fam.studioSeed, CHAIN_ID, price));
  const batch = buildBatch(prepared.map((p) => p.commitment));
  const nonce = (await pub.readContract({ address: TP, abi: touchplateAbi, functionName: "touchNonce", args: [a.account.address] })) as bigint;
  const r = await send(a.wallet, a.account, "touch", "touch", [
    batch.root, prepared.length, a.passkey.assert(touchChallenge(CHAIN_ID, a.account.address, batch.root, prepared.length, nonce)),
  ]);
  return { prepared, root: batch.root, proofs: batch.proofs, touch: { label: `${a.name} touches ${prepared.length} image(s)`, hash: r.hash }, touchBlock: r.receipt.blockNumber, touchBlockHash: r.receipt.blockHash };
}

export async function reveal(a: Actor, s: Sealed, indexes?: number[], price = PRICE): Promise<Tx[]> {
  await waitFinalized(s.touchBlock, s.touchBlockHash);
  const out: Tx[] = [];
  for (const i of indexes ?? s.prepared.map((_, k) => k)) {
    const p = s.prepared[i];
    const r = await send(a.wallet, a.account, "reveal", "reveal", [s.root, s.proofs[i], p.pdq.hash, p.dihedral.root, p.salt, p.markSeedHash, p.manifestHash, price]);
    out.push({ label: `${a.name} reveals ${p.file}`, hash: r.hash });
  }
  return out;
}

/** Registry as of now, resuming from the build-time snapshot so a scan is seconds, not minutes. */
let snapCache: RegistrySnapshot | undefined;
export async function registry(): Promise<{ snap: RegistrySnapshot; finalized: bigint }> {
  if (!snapCache) {
    try {
      snapCache = snapshotFromJson(readFileSync(resolve(ROOT, "apps/web/src/data/registry-snapshot.json"), "utf8")).snapshot;
    } catch {
      snapCache = undefined;
    }
  }
  const from = BigInt(process.env.MAINNET_DEPLOY_BLOCK ?? process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");
  snapCache = await scanRegistry(pub, TP, from, undefined, snapCache, { concurrency: 16 });
  const fin = await pub.getBlock({ blockTag: "finalized" });
  return { snap: snapCache, finalized: fin.number };
}

export async function certificateOf(buf: Buffer): Promise<Certificate> {
  const q = await pdqOf(buf);
  const { snap, finalized } = await registry();
  const times = new Map<bigint, number>();
  const refs = toEntryRefs(snap, finalized);
  for (const b of new Set([...refs.map((r) => r.touchBlock), ...snap.revealed.map((r) => r.blockNumber)])) {
    times.set(b, Number((await pub.getBlock({ blockNumber: b })).timestamp));
  }
  return attest({ chainId: Number(CHAIN_ID), contract: TP, query: q, entries: refs, snapshot: snap, marks: [], blockTime: (n) => times.get(n) ?? 0 });
}

export async function cocoImages(from: number, count: number): Promise<{ name: string; buf: Buffer }[]> {
  const dir = resolve(ROOT, "spikes/out/coco");
  const ids: string[] = JSON.parse(readFileSync(resolve(dir, "ids.json"), "utf8"));
  return ids.slice(from, from + count).map((id) => ({ name: id, buf: readFileSync(resolve(dir, id)) }));
}

export const platformRoundTrip = async (buf: Buffer): Promise<Buffer> => {
  const m = await sharp(buf).metadata();
  const r = await sharp(buf).resize({ width: Math.min(1080, m.width ?? 1080) }).png().toBuffer();
  return sharp(r).jpeg({ quality: 72 }).toBuffer();
};

export interface DrillReport {
  id: string;
  title: string;
  attack: string;
  outcome: string;
  passed: boolean;
  txs: Tx[];
  data?: Record<string, unknown>;
}

export function writeReport(r: DrillReport): void {
  const dir = resolve(ROOT, "docs/drills");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${r.id}.json`), JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
  const lines = [
    `# ${r.id}: ${r.title}`,
    "",
    `**Attack or fault.** ${r.attack}`,
    "",
    `**Outcome.** ${r.outcome}`,
    "",
    `**Result.** ${r.passed ? "As expected." : "Not as expected; see outcome."}`,
    "",
    "## Transactions",
    "",
    ...(r.txs.length ? r.txs.map((t) => `- ${t.label}: [${t.hash}](${explorerTx(t.hash)})`) : ["- none (off-chain drill)"]),
    "",
    ...(r.data ? ["## Data", "", "```json", JSON.stringify(r.data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2), "```", ""] : []),
  ];
  writeFileSync(resolve(dir, `${r.id}.md`), lines.join("\n"));
  console.log(`${r.id} ${r.passed ? "PASS" : "FAIL"}: ${r.outcome}`);
}

/** Sends a call with an explicit gas limit, skipping simulation, so a revert is recorded on chain. */
export async function sendForced(a: Actor, fn: string, args: readonly unknown[], gas = 250_000n): Promise<{ hash: Hex; status: string }> {
  const data = encodeFunctionData({ abi: touchplateAbi, functionName: fn, args } as never);
  const hash = await a.wallet.sendTransaction({ to: TP, data, gas, chain: MAINNET ? monad : monadTestnet, account: a.account });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: rc.status };
}
