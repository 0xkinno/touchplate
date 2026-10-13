import { config } from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  createPublicClient, createWalletClient, encodeFunctionData, http, type Account, type Address, type Hash, type Hex,
  type PublicClient, type TransactionReceipt, type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";
import {
  buildBatch, commitmentOf, dihedralRootOf, embed, gasFor, markSeedFor, markSeedHash, pdqFromRgba, signManifest,
  deriveKeyFamilies, touchChallenge, SoftPasskey, studioChallenge, touchplateAbi, manifestHashOf,
  type Manifest, type PdqResult, type TxKind,
} from "@touchplate/core";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "../..");
config({ path: resolve(ROOT, ".env.local") });

export const MAINNET = process.env.NETWORK !== "testnet";
const chain = MAINNET ? monad : monadTestnet;
export const RPC = MAINNET ? (process.env.MONAD_MAINNET_RPC ?? "https://rpc.monad.xyz") : (process.env.MONAD_TESTNET_RPC ?? "https://testnet-rpc.monad.xyz");
export const TP = (MAINNET ? process.env.MAINNET_TOUCHPLATE_ADDRESS : process.env.NEXT_PUBLIC_TOUCHPLATE_ADDRESS) as Address;
export const AUSD = (MAINNET ? process.env.MAINNET_AUSD_ADDRESS : process.env.NEXT_PUBLIC_AUSD_ADDRESS) as Address;
export const DEPLOYER_KEY = (MAINNET ? process.env.MAINNET_DEPLOYER_PRIVATE_KEY : process.env.DEPLOYER_PRIVATE_KEY) as Hex;
export const explorerTx = (h: string): string => MAINNET ? `https://monadscan.com/tx/${h}` : `https://testnet.monadexplorer.com/tx/${h}`;

export const pub: PublicClient = createPublicClient({ chain, transport: http(RPC) });

export function walletFor(key: Hex): { account: Account; wallet: WalletClient } {
  const account = privateKeyToAccount(key);
  return { account, wallet: createWalletClient({ account, chain, transport: http(RPC) }) };
}

export interface Sent {
  hash: Hash;
  receipt: TransactionReceipt;
  gasLimit: bigint;
  estimate: bigint;
}

/** Simulates for an estimate, then sends with a tight explicit limit (Monad charges the limit). */
export async function send(
  wallet: WalletClient,
  account: Account,
  kind: TxKind,
  functionName: string,
  args: readonly unknown[],
  address: Address = TP,
  abi: readonly unknown[] = touchplateAbi,
): Promise<Sent> {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const estimate = await pub.estimateGas({ account, to: address, data });
  const gasLimit = gasFor(kind, estimate);
  const hash = await wallet.writeContract({ address, abi, functionName, args, account, chain, gas: gasLimit } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  return { hash, receipt, gasLimit, estimate };
}

export async function waitFinalized(blockNumber: bigint, blockHash: Hex, timeoutMs = 60_000): Promise<number> {
  const t0 = Date.now();
  for (;;) {
    const fin = await pub.getBlock({ blockTag: "finalized" });
    if (fin.number >= blockNumber) {
      const canon = await pub.getBlock({ blockNumber });
      if (canon.hash !== blockHash) throw new Error("block abandoned");
      return Date.now() - t0;
    }
    if (Date.now() - t0 > timeoutMs) throw new Error("finalization timeout");
    await new Promise((r) => setTimeout(r, 150));
  }
}

export interface PreparedImage {
  file: string;
  published: Buffer;
  pdq: PdqResult;
  salt: Hex;
  markSeed: Uint8Array;
  markSeedHash: Hex;
  dihedral: ReturnType<typeof dihedralRootOf>;
  manifestHash: Hex;
  signed: ReturnType<typeof signManifest>;
  commitment: Hex;
  markScale: number;
  markPsnr: number;
}

export async function pdqOf(buf: Buffer): Promise<PdqResult> {
  const { data, info } = await sharp(buf).removeAlpha().resize(512, 512, { fit: "inside", withoutEnlargement: true, kernel: "cubic" })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return pdqFromRgba(new Uint8Array(data), info.width, info.height);
}

export function randomHex32(): Hex {
  return `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
}

/** Watermark, publish (JPEG q92), fingerprint, commit. `author` is the Monad account that will reveal. */
export async function prepareImage(
  source: Buffer, title: string, author: Address, markRoot: Uint8Array, studioSeed: Uint8Array, chainId: bigint, priceUnits: bigint,
): Promise<PreparedImage> {
  const { data, info } = await sharp(source).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const salt = randomHex32();
  // fingerprint of the unmarked source decides the seed identity; the mark must not move the fingerprint
  const srcPdq = await pdqOf(source);
  const seed = markSeedFor(markRoot, srcPdq.hash, salt);
  const marked = embed(new Uint8Array(data), info.width, info.height, 3, seed);
  const published = await sharp(Buffer.from(marked.rgb), { raw: { width: info.width, height: info.height, channels: 3 } })
    .jpeg({ quality: 92 }).toBuffer();
  const pdq = await pdqOf(published);
  const msh = markSeedHash(seed);
  const dihedral = dihedralRootOf(pdq.dihedral);
  const manifest: Manifest = {
    title, creator: "Touchplate demo studio", licenseTerms: "Editorial use, one year",
    priceAusd: (Number(priceUnits) / 1e6).toFixed(6), pdq: pdq.hash, quality: pdq.quality, markSeedHash: msh, appVersion: "0.1.0",
  };
  const signed = signManifest(manifest, studioSeed);
  const commitment = commitmentOf(chainId, author, {
    pdq: pdq.hash, dihedralRoot: dihedral.root, salt, markSeedHash: msh, manifestHash: manifestHashOf(manifest),
  });
  return {
    file: title, published, pdq, salt, markSeed: seed, markSeedHash: msh, dihedral,
    manifestHash: signed.manifestHash, signed, commitment, markScale: marked.scale, markPsnr: marked.psnr,
  };
}

export { buildBatch, deriveKeyFamilies, touchChallenge, SoftPasskey, studioChallenge, touchplateAbi };

export function saveJson(path: string, value: unknown): void {
  const full = resolve(ROOT, path);
  if (!existsSync(dirname(full))) mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
}
