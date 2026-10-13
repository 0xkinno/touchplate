import { buildBatch, touchChallenge } from "@touchplate/core";
import { CHAIN_ID, cocoImages, fund, newActor, register, seal, sendForced, writeReport, type Tx } from "./harness.ts";
import { randomHex32 } from "./lib.ts";

const a = newActor("Replayer");
await fund([a.account.address], 0.1);
const txs: Tx[] = [];
txs.push(await register(a));
const [img] = await cocoImages(170, 1);
const s = await seal(a, [img]);
txs.push(s.touch);
// the original assertion that sealed root1 at nonce 0 (the soft authenticator signs deterministically per challenge)
const old = a.passkey.assert(touchChallenge(CHAIN_ID, a.account.address, s.root, 1, 0n));
const r1 = await sendForced(a, "touch", [s.root, 1, old]);
txs.push({ label: `replay: same assertion, same root (status ${r1.status}; TouchExists)`, hash: r1.hash });
const other = buildBatch([randomHex32()]).root;
const r2 = await sendForced(a, "touch", [other, 1, old]);
txs.push({ label: `replay: old assertion for a different root (status ${r2.status}; BadAssertion)`, hash: r2.hash });
writeReport({
  id: "D7",
  title: "Replayed touch",
  attack: "Reuse an old WebAuthn assertion, and present an assertion for a different root.",
  outcome: `Both reverted on chain: same assertion and root ${r1.status}; assertion for a different root ${r2.status}.`,
  passed: r1.status === "reverted" && r2.status === "reverted",
  txs,
});
