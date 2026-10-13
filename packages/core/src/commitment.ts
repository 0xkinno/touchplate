import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from "viem";

export const DOMAIN_STUDIO = keccak256(stringToHex("touchplate.studio.v1"));
export const DOMAIN_TOUCH = keccak256(stringToHex("touchplate.touch.v1"));
export const DOMAIN_ENTRY = keccak256(stringToHex("touchplate.entry.v1"));

export interface EntryInput {
  pdq: Hex;
  dihedralRoot: Hex;
  salt: Hex;
  markSeedHash: Hex;
  manifestHash: Hex;
}

/** Must equal `Touchplate.commitmentOf` in Solidity. */
export function commitmentOf(chainId: bigint, author: Address, e: EntryInput): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" },
        { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
      ],
      [DOMAIN_ENTRY, chainId, author, e.pdq, e.dihedralRoot, e.salt, e.markSeedHash, e.manifestHash],
    ),
  );
}

export function studioChallenge(chainId: bigint, author: Address, qx: Hex, qy: Hex, ed25519Pub: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
      [DOMAIN_STUDIO, chainId, author, qx, qy, ed25519Pub],
    ),
  );
}

export function touchChallenge(chainId: bigint, author: Address, root: Hex, count: number, nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint32" }, { type: "uint256" }],
      [DOMAIN_TOUCH, chainId, author, root, count, nonce],
    ),
  );
}

export interface Batch {
  root: Hex;
  proofs: Hex[][];
}

/** Merkle batch over bytes32 values, compatible with OpenZeppelin StandardMerkleTree and MerkleProof. */
export function buildBatch(values: Hex[]): Batch {
  if (values.length === 0) throw new Error("empty batch");
  const tree = StandardMerkleTree.of(values.map((v) => [v]), ["bytes32"]);
  const proofs = values.map((v) => {
    for (const [i, leaf] of tree.entries()) if (leaf[0] === v) return tree.getProof(i) as Hex[];
    throw new Error("value missing from tree");
  });
  return { root: tree.root as Hex, proofs };
}

/** Root over an image's eight dihedral hashes, committed on chain so rotated copies can be matched. */
export function dihedralRootOf(variants: Hex[]): Batch {
  return buildBatch(variants);
}
