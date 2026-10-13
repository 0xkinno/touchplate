import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { encodeAbiParameters, keccak256, toHex, type Hex } from "viem";

const SALT = utf8ToBytes("touchplate");

export interface KeyFamilies {
  /** secp256k1 private key for the Monad account (BIP-44 m/44'/60'/0'/0/0 over the PRF-derived mnemonic). */
  evmPrivateKey: Uint8Array;
  /** 32-byte Ed25519 seed for manifest signing. */
  studioSeed: Uint8Array;
  /** 32-byte root for per-image watermark seeds. Never leaves memory. */
  markRoot: Uint8Array;
}

/** Derives the three unrelated key families from one passkey PRF output. */
export function deriveKeyFamilies(prfOutput: Uint8Array): KeyFamilies {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const evm = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0").privateKey;
  if (!evm) throw new Error("BIP-32 derivation produced no key");
  return {
    evmPrivateKey: evm,
    studioSeed: hkdf(sha256, prfOutput, SALT, utf8ToBytes("studio.ed25519.v1"), 32),
    markRoot: hkdf(sha256, prfOutput, SALT, utf8ToBytes("mark.v1"), 32),
  };
}

/** Per-image watermark seed: HMAC-SHA256(markRoot, keccak(pdq, salt)). */
export function markSeedFor(markRoot: Uint8Array, pdq: Hex, salt: Hex): Uint8Array {
  const id = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [pdq, salt]));
  return hmac(sha256, markRoot, Uint8Array.from(Buffer.from(id.slice(2), "hex")));
}

/** `markSeedHash` committed on chain: keccak256(abi.encode(seed)). */
export function markSeedHash(seed: Uint8Array): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }], [toHex(seed, { size: 32 })]));
}
