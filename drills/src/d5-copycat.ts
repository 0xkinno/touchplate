import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { monad, monadTestnet } from "viem/chains";
import { cocoImages, deployer, fund, newActor, register, seal, sendForced, writeReport, type Tx } from "./harness.ts";
import { MAINNET, ROOT, TP, pdqOf, pub, send } from "./lib.ts";

const WS = MAINNET ? "wss://rpc.monad.xyz" : "wss://testnet-rpc.monad.xyz";
const chain = MAINNET ? monad : monadTestnet;
const naive = JSON.parse(readFileSync(resolve(ROOT, "drills/contracts/out/NaiveRegistry.sol/NaiveRegistry.json"), "utf8")) as { abi: never; bytecode: { object: Hex } };
const naiveAbi = parseAbi(["function claim(bytes32)", "function first(bytes32) view returns (address)", "function firstBlock(bytes32) view returns (uint256)", "event Claimed(bytes32 indexed pdq, address indexed claimer)"]);

const txs: Tx[] = [];
const dep = await deployer.wallet.deployContract({ abi: naive.abi, bytecode: naive.bytecode.object, gas: 400_000n, chain, account: deployer.account } as never);
const depRc = await pub.waitForTransactionReceipt({ hash: dep });
const NAIVE = depRc.contractAddress as Hex;
txs.push({ label: `deploy NaiveRegistry ${NAIVE} (drill-only contract)`, hash: dep });

const victim = newActor("Victim");
const bot = newActor("Copycat bot");
await fund([victim.account.address, bot.account.address], 0.2);
const [src] = await cocoImages(190, 1);
const pdq = (await pdqOf(src.buf)).hash;

// The bot watches the speculative feed for Claimed events of the naive registry.
const seen: { state: string; at: number; block: number }[] = [];
let botHash: Hex | undefined;
let botSeenAt = 0;
const ws = new WebSocket(WS);
await new Promise<void>((r) => ws.on("open", () => r()));
ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["monadLogs", { address: NAIVE }] }));
ws.on("message", async (d) => {
  const r = JSON.parse(d.toString()).params?.result as { commitState?: string; topics?: string[]; blockNumber?: string } | undefined;
  if (!r?.topics || r.topics.length < 3) return;
  seen.push({ state: r.commitState ?? "?", at: Date.now(), block: parseInt(r.blockNumber ?? "0", 16) });
  if (!botHash && r.topics[2]?.toLowerCase().endsWith(victim.account.address.slice(2).toLowerCase())) {
    botSeenAt = Date.now();
    const leaked = r.topics[1] as Hex; // the fingerprint, readable by every subscriber
    botHash = await bot.wallet.writeContract({
      address: NAIVE, abi: naiveAbi, functionName: "claim", args: [leaked], gas: 80_000n, chain, account: bot.account,
      maxPriorityFeePerGas: 50_000_000_000n,
    } as never).catch(() => undefined);
  }
});
const tVictim = Date.now();
const v = await victim.wallet.writeContract({ address: NAIVE, abi: naiveAbi, functionName: "claim", args: [pdq], gas: 80_000n, chain, account: victim.account } as never);
const vr = await pub.waitForTransactionReceipt({ hash: v });
txs.push({ label: "victim claim(pdq) on the naive registry: fingerprint is public in the claiming tx", hash: v });
await new Promise((r) => setTimeout(r, 6000));
ws.close();
let botBlock: bigint | undefined;
if (botHash) {
  const br = await pub.waitForTransactionReceipt({ hash: botHash });
  botBlock = br.blockNumber;
  txs.push({ label: "bot copies the leaked fingerprint into its own claim", hash: botHash });
}
const owner = (await pub.readContract({ address: NAIVE, abi: naiveAbi, functionName: "first", args: [pdq] })) as string;
const firstSeenProposed = seen.find((s) => s.state === "Proposed");
const leakBeforeFinal = firstSeenProposed ? firstSeenProposed.at - tVictim : null;

// Touchplate side: the bot watches the real contract while the victim seals. Only a root is visible.
const studio = newActor("Victim studio");
await fund([studio.account.address], 0.15);
txs.push(await register(studio));
const s = await seal(studio, [src]);
txs.push(s.touch);
const attempt = await sendForced(bot, "reveal", [s.root, s.proofs[0], pdq, `0x${"00".repeat(32)}`, `0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`, `0x${"33".repeat(32)}`, 1n]);
txs.push({ label: `bot tries to reveal against the victim's root (status ${attempt.status}; NotAuthor)`, hash: attempt.hash });
void encodeFunctionData;
void send;
void TP;

writeReport({
  id: "D5",
  title: "Copycat on speculative data",
  attack: "A bot subscribes to the speculative monadLogs feed and tries to copy a claim. Naive registry (fingerprint in the claim) versus Touchplate (hidden commitment).",
  outcome: `Naive mode leaked the fingerprint on the Proposed feed ${leakBeforeFinal ?? "n/a"} ms after the victim sent it; the bot copied it ${botSeenAt ? `${botSeenAt - tVictim} ms after submission` : "(not triggered)"} and landed in block ${botBlock ?? "n/a"} versus the victim's block ${vr.blockNumber}; first claimant on chain: ${owner.toLowerCase() === victim.account.address.toLowerCase() ? "the victim" : "the bot"}. Touchplate's touch exposed only a Merkle root; the bot's reveal attempt reverted (${attempt.status}).`,
  passed: attempt.status === "reverted",
  txs,
  data: { seenOnFeed: seen, victimBlock: vr.blockNumber, botBlock, naive: NAIVE, honestNote: "On a healthy chain the copier cannot overtake an already-proposed block; the exposure is the fingerprint itself and the abandoned-block and same-block cases, which a hidden commitment removes." },
});
