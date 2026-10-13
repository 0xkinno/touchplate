import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import canonicalize from "canonicalize";
import type { Hex } from "viem";
import type { Verdict } from "./verdict.ts";

export const ENGINE_VERSION = "touchplate-engine/1";

export interface LadderStamp {
  rung: string;
  at: number;
  blockNumber?: string;
}

export interface Certificate {
  engineVersion: string;
  chainId: number;
  contract: Hex;
  verdict: Verdict;
  author?: Hex;
  studioEd25519Pub?: Hex;
  commitment?: Hex;
  touchTx?: Hex;
  revealTx?: Hex;
  touchBlock?: string;
  revealBlock?: string;
  finalized: boolean;
  ladder: LadderStamp[];
  distance?: number;
  threshold: number;
  quality: number;
  markZ?: number;
  certSha256: string;
}

const replacer = (_: string, v: unknown): unknown => (typeof v === "bigint" ? v.toString() : v);

/** Hash of the canonical JSON of every field except `certSha256`. The verifier reproduces it byte for byte. */
export function certHash(c: Omit<Certificate, "certSha256">): string {
  const json = JSON.parse(JSON.stringify(c, replacer)) as unknown as object;
  const text = canonicalize(json);
  if (text === undefined) throw new Error("certificate is not serialisable");
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

export function buildCertificate(c: Omit<Certificate, "certSha256" | "engineVersion">): Certificate {
  const base = { ...c, engineVersion: ENGINE_VERSION };
  return { ...base, certSha256: certHash(base) };
}

export function verifyCertificateHash(c: Certificate): boolean {
  const { certSha256, ...rest } = c;
  return certHash(rest) === certSha256;
}

/** JSON text of a certificate with bigints as decimal strings; `verifyCertificateHash` accepts the parsed result. */
export function certToJson(c: Certificate): string {
  return JSON.stringify(c, replacer, 2);
}
