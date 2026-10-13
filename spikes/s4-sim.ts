import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, encodeFunctionData, http, parseAbi, type Hex } from "viem";

const RPC = process.env.RPC ?? "https://testnet-rpc.monad.xyz";
const client = createPublicClient({ transport: http(RPC) });
const art = JSON.parse(readFileSync("s4/out/P256Probe.sol/P256Probe.json", "utf8"));
const s3 = JSON.parse(readFileSync("s3-families.json", "utf8"));
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const PROBE = "0x00000000000000000000000000000000000c0de1" as const;
const FROM = "0x000000000000000000000000000000000000dEaD" as const;
const abi = parseAbi([
  "struct Auth { bytes32 r; bytes32 s; uint256 challengeIndex; uint256 typeIndex; bytes authenticatorData; string clientDataJSON; }",
  "function verifyWebAuthn(bytes32 challenge, Auth auth, bytes32 qx, bytes32 qy) view returns (bool)",
  "function verifyNative(bytes32 h, bytes32 r, bytes32 s, bytes32 qx, bytes32 qy) view returns (bool)",
  "function verifySolidityFallback(bytes32 h, bytes32 r, bytes32 s, bytes32 qx, bytes32 qy) view returns (bool)",
]);

interface Assertion {
  challenge: Hex; r: Hex; s: Hex; authenticatorData: Hex; clientDataJSON: string; challengeIndex: number; typeIndex: number;
}
const lowS = (s: Hex): Hex => {
  const v = BigInt(s);
  return `0x${(v > N / 2n ? N - v : v).toString(16).padStart(64, "0")}`;
};
const toAuth = (a: Assertion) => ({
  r: a.r, s: lowS(a.s), challengeIndex: BigInt(a.challengeIndex), typeIndex: BigInt(a.typeIndex),
  authenticatorData: a.authenticatorData, clientDataJSON: a.clientDataJSON,
});
const override = { [PROBE]: { code: art.deployedBytecode.object as Hex } };

async function run(name: string, data: Hex) {
  let result: string; let gas: string | null = null;
  try {
    const r = await client.call({ account: FROM, to: PROBE, data, stateOverride: [{ address: PROBE, code: art.deployedBytecode.object as Hex }] });
    result = r.data ?? "0x";
  } catch (e) { result = `ERR ${(e as Error).message.split("\n")[0]}`; }
  try {
    gas = String(await client.estimateGas({ account: FROM, to: PROBE, data, stateOverride: [{ address: PROBE, code: art.deployedBytecode.object as Hex }] }));
  } catch (e) { gas = `ERR ${(e as Error).message.split("\n")[0]}`; }
  const ok = result === "0x0000000000000000000000000000000000000000000000000000000000000001";
  return { name, returned: result.slice(0, 66), accepted: ok, estimateGas: gas };
}

const qx = s3.qx as Hex, qy = s3.qy as Hex;
const a1 = s3.assertions[0] as Assertion, a2 = s3.assertions[1] as Assertion;
const flip = (h: Hex): Hex => `0x${(BigInt(h) ^ 1n).toString(16).padStart(64, "0")}`;
const cases = [
  ["valid assertion (a1, challenge1)", encodeFunctionData({ abi, functionName: "verifyWebAuthn", args: [a1.challenge, toAuth(a1), qx, qy] })],
  ["valid assertion (a2, challenge2)", encodeFunctionData({ abi, functionName: "verifyWebAuthn", args: [a2.challenge, toAuth(a2), qx, qy] })],
  ["tampered r (one bit flipped)", encodeFunctionData({ abi, functionName: "verifyWebAuthn", args: [a1.challenge, { ...toAuth(a1), r: flip(a1.r) }, qx, qy] })],
  ["wrong challenge (a1 auth, challenge2)", encodeFunctionData({ abi, functionName: "verifyWebAuthn", args: [a2.challenge, toAuth(a1), qx, qy] })],
  ["wrong public key (qx flipped)", encodeFunctionData({ abi, functionName: "verifyWebAuthn", args: [a1.challenge, toAuth(a1), flip(qx), qy] })],
  ["high-s malleated signature", encodeFunctionData({ abi, functionName: "verifyWebAuthn", args: [a1.challenge, { ...toAuth(a1), s: `0x${(N - BigInt(lowS(a1.s))).toString(16).padStart(64, "0")}` }, qx, qy] })],
] as const;

const results = [] as Awaited<ReturnType<typeof run>>[];
for (const [name, data] of cases) results.push(await run(name, data));

// Precompile presence and raw cost: hash is any 32 bytes; signature need not verify for presence.
const zero = `0x${"00".repeat(32)}` as Hex;
const rawNative = await run("verifyNative on garbage (precompile reachable?)", encodeFunctionData({ abi, functionName: "verifyNative", args: [zero, zero, zero, qx, qy] }));
const solFallback = await run("Solidity fallback verify (valid-shaped input)", encodeFunctionData({ abi, functionName: "verifySolidityFallback", args: [zero, a1.r, lowS(a1.s), qx, qy] }));

// Direct staticcall to 0x100 with a known-valid WebAuthn digest: reconstruct digest and call the precompile raw.
import { sha256 } from "viem";
const cdHash = sha256(new TextEncoder().encode(a1.clientDataJSON));
const digest = sha256(`0x${a1.authenticatorData.slice(2)}${cdHash.slice(2)}` as Hex);
const input = `0x${digest.slice(2)}${a1.r.slice(2)}${lowS(a1.s).slice(2)}${qx.slice(2)}${qy.slice(2)}` as Hex;
const rawPrecompile = await client.call({ to: "0x0000000000000000000000000000000000000100", data: input });
const bad = `0x${digest.slice(2)}${flip(a1.r).slice(2)}${lowS(a1.s).slice(2)}${qx.slice(2)}${qy.slice(2)}` as Hex;
const rawPrecompileBad = await client.call({ to: "0x0000000000000000000000000000000000000100", data: bad });

void override;
const out = {
  rpc: RPC,
  method: "eth_call with runtime-code stateOverride (no gas funds required); on-chain tx pending funding",
  cases: results,
  precompileProbe: rawNative,
  solidityFallback: solFallback,
  directPrecompile0x100: { validInput: rawPrecompile.data ?? "0x", tamperedInput: rawPrecompileBad.data ?? "0x" },
};
writeFileSync("s4-sim.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
