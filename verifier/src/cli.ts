#!/usr/bin/env -S npx tsx
/**
 * touchplate-verify: recomputes everything from chain logs and the image. No Touchplate server is involved.
 *   --image suspect.jpg --rpc <url> --contract <addr> --from-block <n> [--chain-id 10143]
 *   --certificate cert.json --rpc <url> --contract <addr>
 */
import { readFileSync } from "node:fs";
import { createPublicClient, http, keccak256, encodeAbiParameters, type Address, type Hex } from "viem";
import sharp from "sharp";
import {
  attest, certToJson, detect, emptySnapshot, pdqFromRgba, scanRegistry, toEntryRefs, verifyCertificateHash,
  type Certificate, type MarkProof,
} from "@touchplate/core";

interface Args { [k: string]: string | undefined }
const args: Args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args[a.slice(2)] = process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[++i];
}

const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const rpc = args.rpc ?? "https://testnet-rpc.monad.xyz";
const contract = (args.contract ?? process.env.NEXT_PUBLIC_TOUCHPLATE_ADDRESS) as Address | undefined;
if (!contract) throw new Error("--contract is required");
const client = createPublicClient({ transport: http(rpc) });
const chainId = await client.getChainId();
if (args["chain-id"]) check("chain id", chainId === Number(args["chain-id"]), String(chainId));
const code = await client.getCode({ address: contract });
check("contract has code", !!code && code !== "0x", `${((code?.length ?? 2) - 2) / 2} bytes`);

const blockTimes = new Map<bigint, number>();
const blockTime = async (n: bigint): Promise<number> => {
  const cached = blockTimes.get(n);
  if (cached !== undefined) return cached;
  const b = await client.getBlock({ blockNumber: n });
  blockTimes.set(n, Number(b.timestamp));
  return Number(b.timestamp);
};

async function finalizedCheck(touchBlock: bigint, revealBlock: bigint): Promise<void> {
  const fin = await client.getBlock({ blockTag: "finalized" });
  check("touch block is Finalized", fin.number >= touchBlock && fin.number >= revealBlock, `finalized head ${fin.number}, touch ${touchBlock}`);
}

if (args.certificate) {
  const cert = JSON.parse(readFileSync(args.certificate, "utf8")) as Certificate;
  check("certSha256 reproduces", verifyCertificateHash(cert), cert.certSha256);
  check("contract matches certificate", cert.contract.toLowerCase() === contract.toLowerCase());
  check("chain id matches certificate", cert.chainId === chainId, String(chainId));
  if (cert.commitment && cert.revealBlock && cert.touchBlock) {
    const snap = await scanRegistry(client, contract, BigInt(cert.revealBlock), BigInt(cert.revealBlock));
    const r = snap.revealed.find((x) => x.commitment === cert.commitment);
    check("Revealed event exists for the commitment", !!r, cert.revealTx ?? "");
    check("author matches the chain", !!r && r.author.toLowerCase() === (cert.author ?? "").toLowerCase());
    check("reveal tx matches", !!r && r.txHash === cert.revealTx);
    await finalizedCheck(BigInt(cert.touchBlock), BigInt(cert.revealBlock));
  }
} else if (args.image) {
  const buf = readFileSync(args.image);
  const fromBlock = BigInt(args["from-block"] ?? "0");
  const { data, info } = await sharp(buf).removeAlpha().resize(512, 512, { fit: "inside", withoutEnlargement: true, kernel: "cubic" })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const query = pdqFromRgba(new Uint8Array(data), info.width, info.height);
  check("fingerprint recomputed locally", true, `${query.hash} quality ${query.quality}`);
  if (query.quality < 50) console.log("NOTE  low detail image (quality < 50): excluded from automatic priority");

  const snap = await scanRegistry(client, contract, fromBlock, undefined, emptySnapshot(fromBlock));
  check("registry scanned from logs", true, `${snap.revealed.length} reveals, ${snap.touched.length} touches, blocks ${snap.scannedFrom}-${snap.scannedTo}`);
  const fin = await client.getBlock({ blockTag: "finalized" });
  const entries = toEntryRefs(snap, fin.number);

  // Mark proofs: recompute z from the published seed and this file.
  const raw = await sharp(buf).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const marks: MarkProof[] = [];
  for (const m of snap.marks) {
    const rev = snap.revealed.find((r) => r.commitment === m.commitment);
    if (!rev) continue;
    const seedOk = keccak256(encodeAbiParameters([{ type: "bytes32" }], [m.seed])) === rev.markSeedHash;
    check(`seed matches committed markSeedHash (${m.commitment.slice(0, 10)})`, seedOk);
    if (!seedOk) continue;
    const seedBytes = Uint8Array.from(Buffer.from(m.seed.slice(2), "hex"));
    marks.push({ commitment: m.commitment, z: detect(new Uint8Array(raw.data), raw.info.width, raw.info.height, 3, seedBytes) });
  }

  const times = new Map<bigint, number>();
  for (const e of entries) for (const n of [e.touchBlock]) times.set(n, await blockTime(n));
  for (const r of snap.revealed) times.set(r.blockNumber, await blockTime(r.blockNumber));
  const cert = attest({
    chainId, contract, query, entries, snapshot: snap, marks,
    blockTime: (n) => times.get(n) ?? 0,
  });
  check("verdict recomputed", true, cert.verdict.kind);
  if (cert.verdict.kind === "MATCHED" || cert.verdict.kind === "AUTHORED") {
    await finalizedCheck(BigInt(cert.touchBlock ?? 0), BigInt(cert.revealBlock ?? 0));
    console.log(`author   ${cert.author}\nsealed   block ${cert.touchBlock}\ndistance ${cert.distance} (threshold ${cert.threshold})`);
    if (cert.markZ !== undefined) console.log(`mark z   ${cert.markZ.toFixed(1)}`);
  }
  console.log(`certSha256 ${cert.certSha256}`);
  console.log(certToJson(cert));
} else {
  console.error("usage: touchplate-verify --image <file> | --certificate <file> --rpc <url> --contract <addr> [--from-block <n>]");
  process.exit(2);
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length === 0 ? "\nRESULT: PASS" : `\nRESULT: FAIL (${failed.length})`);
process.exit(failed.length === 0 ? 0 : 1);

export type { Hex };
