import { toHex, type Hex } from "viem";

/** secp256r1 group order. */
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export interface WebAuthnAuth {
  r: Hex;
  s: Hex;
  challengeIndex: bigint;
  typeIndex: bigint;
  authenticatorData: Hex;
  clientDataJSON: string;
}

/** Decodes a DER ECDSA signature into 32-byte r and s, low-s normalised (the P-256 verifier rejects high s). */
export function derToRs(der: Uint8Array): { r: Hex; s: Hex } {
  let o = 2;
  if ((der[1] & 0x80) !== 0) o += der[1] & 0x7f;
  const read = (): bigint => {
    if (der[o] !== 0x02) throw new Error("malformed DER signature");
    const len = der[o + 1];
    const v = BigInt(toHex(der.slice(o + 2, o + 2 + len)));
    o += 2 + len;
    return v;
  };
  const r = read();
  let s = read();
  if (s > N / 2n) s = N - s;
  const pad = (v: bigint): Hex => `0x${v.toString(16).padStart(64, "0")}`;
  return { r: pad(r), s: pad(s) };
}

export function authFromAssertion(response: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
}): WebAuthnAuth {
  const clientDataJSON = new TextDecoder().decode(response.clientDataJSON);
  const challengeIndex = clientDataJSON.indexOf('"challenge":"');
  const typeIndex = clientDataJSON.indexOf('"type":"');
  if (challengeIndex < 0 || typeIndex < 0) throw new Error("clientDataJSON is missing type or challenge");
  const { r, s } = derToRs(response.signature);
  return {
    r, s,
    challengeIndex: BigInt(challengeIndex),
    typeIndex: BigInt(typeIndex),
    authenticatorData: toHex(response.authenticatorData),
    clientDataJSON,
  };
}

/** Extracts the P-256 public key (x, y) from an SPKI DER key as returned by `getPublicKey()`. */
export function p256FromSpki(spki: Uint8Array): { qx: Hex; qy: Hex } {
  if (spki.length !== 91) throw new Error("unexpected SPKI length for P-256");
  return { qx: toHex(spki.slice(27, 59)), qy: toHex(spki.slice(59, 91)) };
}
