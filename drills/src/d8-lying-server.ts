import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCertificate, verifyCertificateHash, type Certificate } from "@touchplate/core";
import sharp from "sharp";
import { certificateOf, registry, writeReport } from "./harness.ts";
import { ROOT } from "./lib.ts";

const seal = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/seal-run-mainnet.json"), "utf8")) as { author: string; entries: { index: number }[] };
const img = await sharp(readFileSync(resolve(ROOT, "spikes/out/sealed/1.jpg"))).resize({ width: 900 }).jpeg({ quality: 75 }).toBuffer();
const honest = await certificateOf(img);
const attacker = "0x000000000000000000000000000000000000dEaD";

// What the verifier does in certificate mode: hash check, then the author on chain for the claimed commitment.
async function audit(c: Certificate): Promise<{ hashOk: boolean; chainOk: boolean }> {
  const hashOk = verifyCertificateHash(c);
  const { snap } = await registry();
  const rev = snap.revealed.find((r) => r.commitment === c.commitment);
  const chainOk = !!rev && rev.author.toLowerCase() === (c.author ?? "").toLowerCase();
  return { hashOk, chainOk };
}

const forgedNaive: Certificate = { ...honest, author: attacker as `0x${string}` };
const forgedClever = buildCertificate({ ...(({ certSha256: _a, engineVersion: _b, ...rest }) => rest)(honest), author: attacker as `0x${string}` });
const [h, f1, f2] = [await audit(honest), await audit(forgedNaive), await audit(forgedClever)];
writeReport({
  id: "D8",
  title: "Lying server",
  attack: "A proxy returns a forged verdict naming a different author, first without fixing the certificate hash, then with a recomputed hash.",
  outcome: `Honest certificate: hash ${h.hashOk ? "reproduces" : "mismatch"}, chain ${h.chainOk ? "agrees" : "disagrees"}. Forged without rehash: hash ${f1.hashOk ? "reproduces" : "MISMATCH (detected as a hash mismatch)"}. Forged with rehash: hash ${f2.hashOk ? "reproduces" : "mismatch"}, chain ${f2.chainOk ? "agrees" : "DISAGREES (detected as a verdict mismatch)"}.`,
  passed: h.hashOk && h.chainOk && !f1.hashOk && f2.hashOk && !f2.chainOk,
  txs: [],
  data: { honest: h, forgedWithoutRehash: f1, forgedWithRehash: f2, expectedAuthor: seal.author },
});
