import { hamming256, touchplateAbi } from "@touchplate/core";
import {
  certificateOf, cocoImages, deployer, fund, newActor, platformRoundTrip, register, reveal, seal, sendForced, writeReport, type Tx,
} from "./harness.ts";
import { TP, pub, send } from "./lib.ts";

const [src] = await cocoImages(160, 1);
const alice = newActor("Alice");
const bob = newActor("Bob (thief)");
await fund([alice.account.address, bob.account.address], 0.15);
const txs: Tx[] = [];
txs.push(await register(alice));
const a = await seal(alice, [src]);
txs.push(a.touch, ...(await reveal(alice, a)));
const stolen = await platformRoundTrip(a.prepared[0].published); // the thief copies the published image and strips it
txs.push(await register(bob));
const b = await seal(bob, [{ name: "stolen.jpg", buf: stolen }]);
txs.push(b.touch, ...(await reveal(bob, b)));

const v = (await certificateOf(stolen)).verdict;
const originalWins = (v.kind === "MATCHED" || v.kind === "AUTHORED") && v.entry.author.toLowerCase() === alice.account.address.toLowerCase();

// recordPriority: the earlier author's committed dihedral variant closest to the thief's fingerprint
const thiefPdq = b.prepared[0].pdq.hash;
const variants = a.prepared[0].pdq.dihedral;
const idx = variants.reduce((best, h, i) => (hamming256(h, thiefPdq) < hamming256(variants[best], thiefPdq) ? i : best), 0);
const rec = await send(deployer.wallet, deployer.account, "recordPriority", "recordPriority", [
  a.prepared[0].commitment, b.prepared[0].commitment, variants[idx], a.prepared[0].dihedral.proofs[idx],
]);
txs.push({ label: "anyone calls recordPriority: thief entry marked derivative", hash: rec.hash });
const lic = await sendForced(bob, "license", [b.prepared[0].commitment, process.env.MAINNET_AUSD_ADDRESS, 12_000_000n]);
txs.push({ label: `thief license() attempt (status ${lic.status}; IsDerivative)`, hash: lic.hash });
const entry = (await pub.readContract({ address: TP, abi: touchplateAbi, functionName: "entries", args: [b.prepared[0].commitment] })) as readonly unknown[];
const derivative = entry[7] === true;
writeReport({
  id: "D3",
  title: "Late thief",
  attack: "A second wallet registers a stripped copy of the original after the original was sealed and revealed.",
  outcome: `Verdict names the original author: ${originalWins}. recordPriority marked the thief entry derivative: ${derivative}. The thief license() call ${lic.status === "reverted" ? "reverted" : "did not revert"}.`,
  passed: originalWins && derivative && lic.status === "reverted",
  txs,
  data: { variantIndexUsed: idx, distance: hamming256(variants[idx], thiefPdq), verdict: v.kind },
});
