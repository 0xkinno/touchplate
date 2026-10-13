import { ed25519 } from "@noble/curves/ed25519.js";
import canonicalize from "canonicalize";
import { keccak256, toHex, type Hex } from "viem";

export interface Manifest {
  title: string;
  creator: string;
  captureDate?: string;
  licenseTerms: string;
  priceAusd: string;
  pdq: Hex;
  quality: number;
  markSeedHash: Hex;
  appVersion: string;
}

export interface SignedManifest {
  manifest: Manifest;
  manifestHash: Hex;
  signature: Hex;
  studioPublicKey: Hex;
}

export function manifestBytes(m: Manifest): Uint8Array {
  const text = canonicalize(m);
  if (text === undefined) throw new Error("manifest is not serialisable");
  return new TextEncoder().encode(text);
}

export function manifestHashOf(m: Manifest): Hex {
  return keccak256(toHex(manifestBytes(m)));
}

export function signManifest(m: Manifest, studioSeed: Uint8Array): SignedManifest {
  const bytes = manifestBytes(m);
  const sig = ed25519.sign(bytes, studioSeed);
  return {
    manifest: m,
    manifestHash: keccak256(toHex(bytes)),
    signature: toHex(sig),
    studioPublicKey: toHex(ed25519.getPublicKey(studioSeed)),
  };
}

export function verifyManifest(s: SignedManifest): boolean {
  const bytes = manifestBytes(s.manifest);
  if (keccak256(toHex(bytes)) !== s.manifestHash) return false;
  const hex = (h: Hex): Uint8Array => Uint8Array.from(Buffer.from(h.slice(2), "hex"));
  return ed25519.verify(hex(s.signature), bytes, hex(s.studioPublicKey));
}
