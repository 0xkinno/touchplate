/**
 * Phase 0 spikes that need gas: S8 (faucet tx), S4 (on-chain verify), S2 (gas on limit), S1 (timed txs).
 * Usage: npx tsx funded.ts [s8] [s4] [s2] [s1]   (no args runs all, in dependency order)
 * Needs SPIKE_PRIVATE_KEY in spikes/.env and a funded testnet balance.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  formatEther,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const key = process.env.SPIKE_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("SPIKE_PRIVATE_KEY missing in spikes/.env");
const account = privateKeyToAccount(key);
const RPC = "https://testnet-rpc.monad.xyz";
const WS_URL = "wss://testnet-rpc.monad.xyz";
const pub = createPublicClient({ chain: monadTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC) });

const AUSD = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC" as const;
const FAUCET = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C" as const;
const explorer = (h: string) => `https://testnet.monadexplorer.com/tx/${h}`;
const wanted = new Set(process.argv.slice(2));
const want = (s: string) => wanted.size === 0 || wanted.has(s);
const save = (f: string, v: unknown) => writeFileSync(f, JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"]);
const faucetAbi = parseAbi(["function requestFunds(address)"]);
const probeAbi = parseAbi([
  "struct Auth { bytes32 r; bytes32 s; uint256 challengeIndex; uint256 typeIndex; bytes authenticatorData; string clientDataJSON; }",
  "function attest(bytes32 challenge, Auth auth, bytes32 qx, bytes32 qy) returns (bool ok)",
  "event Verified(address indexed caller, bool ok, bytes32 challenge)",
]);

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const lowS = (s: Hex): Hex => {
  const v = BigInt(s);
  return `0x${(v > N / 2n ? N - v : v).toString(16).padStart(64, "0")}`;
};
interface Assertion { challenge: Hex; r: Hex; s: Hex; authenticatorData: Hex; clientDataJSON: string; challengeIndex: number; typeIndex: number }
const s3 = JSON.parse(readFileSync("s3-families.json", "utf8")) as { qx: Hex; qy: Hex; assertions: Assertion[] };
const authOf = (a: Assertion) => ({
  r: a.r, s: lowS(a.s), challengeIndex: BigInt(a.challengeIndex), typeIndex: BigInt(a.typeIndex),
  authenticatorData: a.authenticatorData, clientDataJSON: a.clientDataJSON,
});

const bal = await pub.getBalance({ address: account.address });
console.log(`spike account ${account.address} balance ${formatEther(bal)} MON`);
if (bal === 0n) throw new Error("balance is 0: fund the spike account from https://faucet.monad.xyz first");

// ---------------------------------------------------------------- S8
if (want("s8")) {
  const before = await pub.readContract({ address: AUSD, abi: erc20, functionName: "balanceOf", args: [account.address] });
  const decimals = await pub.readContract({ address: AUSD, abi: erc20, functionName: "decimals" });
  const data = encodeFunctionData({ abi: faucetAbi, functionName: "requestFunds", args: [account.address] });
  const gas = await pub.estimateGas({ account, to: FAUCET, data });
  const hash = await wallet.sendTransaction({ to: FAUCET, data, gas: (gas * 12n) / 10n });
  const rc = await pub.waitForTransactionReceipt({ hash });
  const after = await pub.readContract({ address: AUSD, abi: erc20, functionName: "balanceOf", args: [account.address] });
  save("s8-faucet-tx.json", { faucet: FAUCET, ausd: AUSD, decimals, hash, explorer: explorer(hash), status: rc.status, gasUsed: rc.gasUsed, balanceBefore: before, balanceAfter: after, increased: after > before });
  console.log("S8", { hash, status: rc.status, before, after, decimals });
}

// ---------------------------------------------------------------- S4 + S2 share the probe deployment
let probe: Hex | undefined;
const deployed = (): Hex | undefined => {
  try { return JSON.parse(readFileSync("s4-onchain.json", "utf8")).probe as Hex; } catch { return undefined; }
};
if (want("s4") || want("s2")) {
  probe = deployed();
  if (!probe) {
    const art = JSON.parse(readFileSync("s4/out/P256Probe.sol/P256Probe.json", "utf8"));
    const hash = await wallet.deployContract({ abi: probeAbi, bytecode: art.bytecode.object as Hex, gas: 1_500_000n });
    const rc = await pub.waitForTransactionReceipt({ hash });
    probe = rc.contractAddress as Hex;
    save("s4-deploy.json", { probe, hash, explorer: explorer(hash), gasUsed: rc.gasUsed, block: rc.blockNumber });
    console.log("S4 deployed", probe, hash);
  }
}

if (want("s4") && probe) {
  const a = s3.assertions[0];
  const data = (auth: ReturnType<typeof authOf>, challenge: Hex) =>
    encodeFunctionData({ abi: probeAbi, functionName: "attest", args: [challenge, auth, s3.qx, s3.qy] });
  const send = async (label: string, d: Hex, expect: boolean) => {
    const est = await pub.estimateGas({ account, to: probe, data: d });
    const hash = await wallet.sendTransaction({ to: probe, data: d, gas: (est * 12n) / 10n });
    const rc = await pub.waitForTransactionReceipt({ hash });
    let ok: boolean | null = null;
    for (const l of rc.logs) {
      try { ok = (decodeEventLog({ abi: probeAbi, data: l.data, topics: l.topics }).args as { ok: boolean }).ok; } catch { /* other log */ }
    }
    console.log("S4", label, { hash, ok, expect, gasUsed: rc.gasUsed });
    return { label, hash, explorer: explorer(hash), eventOk: ok, expected: expect, gasUsed: rc.gasUsed, gasLimit: (est * 12n) / 10n, block: rc.blockNumber };
  };
  const tampered = { ...authOf(a), r: `0x${(BigInt(a.r) ^ 1n).toString(16).padStart(64, "0")}` as Hex };
  const results = [
    await send("valid assertion", data(authOf(a), a.challenge), true),
    await send("tampered signature", data(tampered, a.challenge), false),
    await send("wrong challenge", data(authOf(a), s3.assertions[1].challenge), false),
  ];
  save("s4-onchain.json", { probe, qx: s3.qx, qy: s3.qy, results });
}

// ---------------------------------------------------------------- S2
if (want("s2") && probe) {
  const a = s3.assertions[0];
  const data = encodeFunctionData({ abi: probeAbi, functionName: "attest", args: [a.challenge, authOf(a), s3.qx, s3.qy] });
  const base = await pub.estimateGas({ account, to: probe, data });
  const runWith = async (gas: bigint) => {
    const before = await pub.getBalance({ address: account.address });
    const hash = await wallet.sendTransaction({ to: probe, data, gas });
    const rc = await pub.waitForTransactionReceipt({ hash });
    const after = await pub.getBalance({ address: account.address });
    return { gasLimit: gas, hash, explorer: explorer(hash), gasUsed: rc.gasUsed, effectiveGasPrice: rc.effectiveGasPrice, feePaid: before - after, predictedByLimit: gas * rc.effectiveGasPrice, predictedByUsed: rc.gasUsed * rc.effectiveGasPrice, status: rc.status };
  };
  const one = await runWith(base);
  const two = await runWith(base * 2n);
  const out = {
    estimateGas: base,
    oneX: one,
    twoX: two,
    feeDifference: two.feePaid - one.feePaid,
    limitDifferenceTimesPrice: (two.gasLimit - one.gasLimit) * two.effectiveGasPrice,
    chargedOnLimit: one.feePaid === one.predictedByLimit && two.feePaid === two.predictedByLimit,
    gasUsedIdentical: one.gasUsed === two.gasUsed,
  };
  save("s2-gas.json", out);
  console.log("S2", out);
}

// ---------------------------------------------------------------- S1
if (want("s1")) {
  const COUNT = Number(process.env.S1_COUNT ?? 100);
  type Rung = "Proposed" | "Voted" | "Finalized" | "Verified";
  const heads = new Map<string, Partial<Record<Rung, number>>>();
  const ws = new WebSocket(WS_URL);
  await new Promise<void>((r) => ws.on("open", () => r()));
  ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["monadNewHeads"] }));
  ws.on("message", (d) => {
    const r = JSON.parse(d.toString()).params?.result as { hash?: string; commitState?: Rung } | undefined;
    if (!r?.hash || !r.commitState) return;
    const e = heads.get(r.hash) ?? {};
    if (e[r.commitState] === undefined) e[r.commitState] = Date.now();
    heads.set(r.hash, e);
  });
  let nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
  const txs: { hash: Hex; submit: number; blockHash?: Hex; blockNumber?: bigint; seen?: number }[] = [];
  const gasPrice = await pub.getGasPrice();
  const fee = { maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: 1n };
  for (let i = 0; i < COUNT; i++) {
    const submit = Date.now();
    const hash = await wallet.sendTransaction({ to: account.address, value: 0n, gas: 21_000n, nonce: nonce++, ...fee });
    txs.push({ hash, submit });
    // Track receipt in the background so submissions are paced, not serialised on finality.
    void (async () => {
      const t = txs[txs.length - 1];
      for (let k = 0; k < 400; k++) {
        const rc = await pub.getTransactionReceipt({ hash: t.hash }).catch(() => null);
        if (rc) { t.blockHash = rc.blockHash; t.blockNumber = rc.blockNumber; t.seen = Date.now(); return; }
        await sleep(40);
      }
    })();
    await sleep(700);
  }
  await sleep(8000);
  ws.close();
  const rows = txs.map((t) => {
    const h = t.blockHash ? heads.get(t.blockHash) : undefined;
    const d = (a?: number) => (a === undefined ? null : a - t.submit);
    return {
      hash: t.hash, block: t.blockNumber, submitToReceiptMs: d(t.seen), submitToProposedMs: d(h?.Proposed), submitToVotedMs: d(h?.Voted),
      submitToFinalizedMs: d(h?.Finalized), submitToVerifiedMs: d(h?.Verified),
    };
  });
  const col = (k: keyof (typeof rows)[number]) => rows.map((r) => r[k]).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const summ = (a: number[]) => ({ n: a.length, min: a[0], p50: q(a, 0.5), p90: q(a, 0.9), p99: q(a, 0.99), max: a[a.length - 1] });
  const out = {
    count: rows.length,
    from: account.address,
    note: "self-transfers, gas 21000; rung times from monadNewHeads commitState keyed by block hash; submit = just before eth_sendRawTransaction",
    distribution: {
      submitToReceiptMs: summ(col("submitToReceiptMs")),
      submitToProposedMs: summ(col("submitToProposedMs")),
      submitToVotedMs: summ(col("submitToVotedMs")),
      submitToFinalizedMs: summ(col("submitToFinalizedMs")),
      submitToVerifiedMs: summ(col("submitToVerifiedMs")),
    },
    rows,
  };
  save("s1-ladder.json", out);
  console.log("S1", JSON.stringify(out.distribution, null, 2));
}
