import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { createPublicClient, http, parseAbi, type Hex, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildBatch, buildCertificate, commitmentOf, decide, derToRs, deriveKeyFamilies, detect, embed, GAS_PROFILE,
  hamming256, isFinalized, markSeedFor, markSeedHash, pdqFromRgba, psnr, signManifest, touchChallenge,
  verifyCertificateHash, verifyManifest, type EntryRef, type Manifest,
} from "../src/index.ts";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Smooth photo-like test image: low-frequency blobs plus mild noise, RGB. */
function synth(w: number, h: number, seed: number): Uint8Array {
  const r = lcg(seed);
  const blobs = Array.from({ length: 14 }, () => ({ x: r() * w, y: r() * h, s: 20 + r() * 60, c: [r() * 255, r() * 255, r() * 255] }));
  const rects = Array.from({ length: 40 }, () => ({ x: r() * w, y: r() * h, w: 10 + r() * 90, h: 10 + r() * 90, c: [r() * 255, r() * 255, r() * 255] }));
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = [60, 60, 60], wsum = 1;
    for (const b of blobs) {
      const g = Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.s * b.s));
      for (let k = 0; k < 3; k++) acc[k] += b.c[k] * g;
      wsum += g;
    }
    const rect = rects.filter((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h).pop();
    for (let k = 0; k < 3; k++) {
      const base = rect ? rect.c[k] * 0.8 + acc[k] / wsum * 0.2 : acc[k] / wsum;
      out[(y * w + x) * 3 + k] = Math.max(0, Math.min(255, base + (r() - 0.5) * 6));
    }
  }
  return out;
}
const toRgba = (rgb: Uint8Array, w: number, h: number): Uint8Array => {
  const a = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { a[i * 4] = rgb[i * 3]; a[i * 4 + 1] = rgb[i * 3 + 1]; a[i * 4 + 2] = rgb[i * 3 + 2]; a[i * 4 + 3] = 255; }
  return a;
};
const rotate90 = (rgb: Uint8Array, w: number, h: number): Uint8Array => {
  const out = new Uint8Array(rgb.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) out[(x * h + (h - 1 - y)) * 3 + k] = rgb[(y * w + x) * 3 + k];
  return out;
};

describe("pdq", () => {
  const rgb = synth(320, 240, 7);
  const q = pdqFromRgba(toRgba(rgb, 320, 240), 320, 240);
  it("is deterministic and has 8 dihedral variants", () => {
    expect(pdqFromRgba(toRgba(rgb, 320, 240), 320, 240).hash).toBe(q.hash);
    expect(q.dihedral).toHaveLength(8);
    expect(q.dihedral[0]).toBe(q.hash);
    expect(q.quality).toBeGreaterThanOrEqual(0);
  });
  it("a 90 degree rotation lands on one of the dihedral variants", () => {
    const rot = pdqFromRgba(toRgba(rotate90(rgb, 320, 240), 240, 320), 240, 320);
    expect(Math.min(...q.dihedral.map((d) => hamming256(d, rot.hash)))).toBeLessThanOrEqual(31);
    expect(hamming256(q.hash, rot.hash)).toBeGreaterThan(31);
  });
  it("hamming256 is a metric on identical and opposite hashes", () => {
    expect(hamming256(q.hash, q.hash)).toBe(0);
    expect(hamming256(`0x${"00".repeat(32)}`, `0x${"ff".repeat(32)}`)).toBe(256);
  });
});

describe("mark", () => {
  const w = 384, h = 288;
  const rgb = synth(w, h, 11);
  const seed = new Uint8Array(32).map((_, i) => (i * 29 + 3) & 255);
  const wrong = new Uint8Array(32).map((_, i) => (i * 53 + 9) & 255);
  const marked = embed(rgb, w, h, 3, seed);
  it("meets the PSNR target", () => {
    expect(marked.psnr).toBeGreaterThanOrEqual(40);
    expect(psnr(rgb, marked.rgb)).toBeGreaterThanOrEqual(40);
  });
  it("detects the right seed and rejects a wrong one", () => {
    expect(detect(marked.rgb, w, h, 3, seed)).toBeGreaterThan(6);
    expect(Math.abs(detect(marked.rgb, w, h, 3, wrong))).toBeLessThan(4);
    expect(Math.abs(detect(rgb, w, h, 3, seed))).toBeLessThan(4);
  });
});

describe("keys and commitments", () => {
  const prf = new Uint8Array(32).map((_, i) => i + 1);
  const fam = deriveKeyFamilies(prf);
  it("derives three distinct deterministic families", () => {
    const again = deriveKeyFamilies(prf);
    expect(Buffer.from(again.markRoot).equals(Buffer.from(fam.markRoot))).toBe(true);
    expect(Buffer.from(fam.markRoot).equals(Buffer.from(fam.studioSeed))).toBe(false);
    expect(Buffer.from(fam.evmPrivateKey).equals(Buffer.from(fam.studioSeed))).toBe(false);
  });
  it("builds OZ-compatible batches whose proofs verify", () => {
    const leaves = Array.from({ length: 5 }, (_, i) => `0x${(i + 1).toString(16).padStart(64, "0")}` as Hex);
    const b = buildBatch(leaves);
    leaves.forEach((v, i) => {
      expect(StandardMerkleTree.verify(b.root, ["bytes32"], [v], b.proofs[i])).toBe(true);
    });
  });
  it("matches the deployed contract's commitmentOf", async () => {
    const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
    const addr = "0x13a5941833F568Cb80d4958ED22B4B9d44a87930";
    const author = "0xDe1413543adAB1C07f87Ff23Eb39946EBc19a20D";
    const e = {
      pdq: `0x${"11".repeat(32)}` as Hex, dihedralRoot: `0x${"22".repeat(32)}` as Hex, salt: `0x${"33".repeat(32)}` as Hex,
      markSeedHash: markSeedHash(markSeedFor(fam.markRoot, `0x${"11".repeat(32)}`, `0x${"33".repeat(32)}`)),
      manifestHash: `0x${"44".repeat(32)}` as Hex,
    };
    const onchain = await client.readContract({
      address: addr,
      abi: parseAbi(["function commitmentOf(address,bytes32,bytes32,bytes32,bytes32,bytes32) view returns (bytes32)"]),
      functionName: "commitmentOf",
      args: [author, e.pdq, e.dihedralRoot, e.salt, e.markSeedHash, e.manifestHash],
    });
    expect(commitmentOf(10143n, author, e)).toBe(onchain);
  }, 40_000);
  it("touch challenge changes with nonce", () => {
    const a = touchChallenge(10143n, "0xDe1413543adAB1C07f87Ff23Eb39946EBc19a20D", `0x${"aa".repeat(32)}`, 3, 0n);
    const b = touchChallenge(10143n, "0xDe1413543adAB1C07f87Ff23Eb39946EBc19a20D", `0x${"aa".repeat(32)}`, 3, 1n);
    expect(a).not.toBe(b);
  });
});

describe("manifest and certificate", () => {
  const m: Manifest = {
    title: "Flood, Lagos", creator: "Ada Okafor", licenseTerms: "Editorial, 1 year", priceAusd: "12.000000",
    pdq: `0x${"11".repeat(32)}`, quality: 88, markSeedHash: `0x${"22".repeat(32)}`, appVersion: "0.1.0",
  };
  it("signs, verifies and detects tampering", () => {
    const seed = new Uint8Array(32).fill(5);
    const s = signManifest(m, seed);
    expect(verifyManifest(s)).toBe(true);
    expect(verifyManifest({ ...s, manifest: { ...m, title: "Other" } })).toBe(false);
  });
  it("certificate hash is reproducible and tamper-evident", () => {
    const c = buildCertificate({
      chainId: 10143, contract: "0x13a5941833F568Cb80d4958ED22B4B9d44a87930", verdict: { kind: "NO_RECORD" },
      finalized: true, ladder: [{ rung: "touched", at: 1 }], threshold: 31, quality: 90,
    });
    expect(verifyCertificateHash(c)).toBe(true);
    expect(verifyCertificateHash({ ...c, quality: 91 })).toBe(false);
  });
});

describe("webauthn", () => {
  it("normalises high-s signatures", () => {
    const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
    const r = 7n, s = N - 5n;
    const enc = (v: bigint): number[] => { const h = v.toString(16).padStart(64, "0"); return [0x02, 32, ...Buffer.from(h, "hex")]; };
    const body = [...enc(r), ...enc(s)];
    const der = Uint8Array.from([0x30, body.length, ...body]);
    expect(BigInt(derToRs(der).s)).toBe(5n);
  });
});

describe("verdict", () => {
  const rgb = synth(256, 256, 3);
  const q = pdqFromRgba(toRgba(rgb, 256, 256), 256, 256);
  const mk = (id: number, block: bigint, finalized = true, pdq: Hex = q.hash, author: Hex = `0x${id.toString(16).padStart(40, "0")}`): EntryRef => ({
    commitment: `0x${id.toString(16).padStart(64, "0")}`, author, pdq, touchBlock: block, touchTxIndex: 0, touchLogIndex: id,
    finalized, derivative: false,
  });
  it("earliest finalized match wins; pending never decides", () => {
    const v = decide(q, [mk(1, 300n), mk(2, 100n, false), mk(3, 200n)], []);
    expect(v.kind).toBe("MATCHED");
    if (v.kind === "MATCHED") expect(v.entry.touchBlock).toBe(200n);
  });
  it("same block by different authors is contested", () => {
    expect(decide(q, [mk(1, 100n), mk(2, 100n)], []).kind).toBe("CONTESTED");
  });
  it("a verified mark proof upgrades to AUTHORED", () => {
    const e = mk(1, 100n);
    expect(decide(q, [e], [{ commitment: e.commitment, z: 40 }]).kind).toBe("AUTHORED");
    expect(decide(q, [e], [{ commitment: e.commitment, z: 2 }]).kind).toBe("MATCHED");
  });
  it("no match beyond the threshold", () => {
    const far: Hex = `0x${"00".repeat(32)}`;
    expect(decide(q, [mk(1, 1n, true, far)], []).kind === "NO_RECORD" || hamming256(q.hash, far) <= 31).toBe(true);
  });
});

describe("ladder and gas", () => {
  it("an abandoned proposal is not finalized (I12)", async () => {
    const client = {
      getBlock: async ({ blockTag, blockNumber }: { blockTag?: string; blockNumber?: bigint }) =>
        blockTag === "finalized" ? { number: 10n, hash: "0xaa" } : { number: blockNumber ?? 10n, hash: "0xbb" },
    } as unknown as PublicClient;
    expect(await isFinalized(client, 9n, "0xaa")).toBe(false);
  });
  it("every transaction kind has an explicit gas limit (I10)", () => {
    for (const v of Object.values(GAS_PROFILE)) expect(v > 0n).toBe(true);
  });
});
