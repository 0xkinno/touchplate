import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { toHex, type Hex } from "viem";
import type { WebAuthnAuth } from "./webauthn.ts";

const b64url = (b: Uint8Array): string => Buffer.from(b).toString("base64url");

/**
 * Software WebAuthn authenticator for scripts, benchmarks and drills. It produces real P-256 assertions in
 * the WebAuthn wire format that the contract verifies through the precompile. The web app uses real
 * passkeys; this exists so automated runs do not need a human touch.
 */
export class SoftPasskey {
  readonly qx: Hex;
  readonly qy: Hex;
  private counter = 0;
  private readonly priv: Uint8Array;

  constructor(priv: Uint8Array = p256.utils.randomSecretKey()) {
    this.priv = priv;
    const pub = p256.getPublicKey(priv, false);
    this.qx = toHex(pub.slice(1, 33));
    this.qy = toHex(pub.slice(33, 65));
  }

  assert(challenge: Hex, rpId = "touchplate.app"): WebAuthnAuth {
    const authData = new Uint8Array(37);
    authData.set(sha256(utf8ToBytes(rpId)), 0);
    authData[32] = 0x05;
    new DataView(authData.buffer).setUint32(33, ++this.counter, false);
    const cd = `{"type":"webauthn.get","challenge":"${b64url(Buffer.from(challenge.slice(2), "hex"))}","origin":"https://${rpId}"}`;
    const msg = new Uint8Array([...authData, ...sha256(utf8ToBytes(cd))]);
    const sig = p256.sign(sha256(msg), this.priv, { prehash: false, lowS: true, format: "compact" });
    return {
      r: toHex(sig.slice(0, 32)),
      s: toHex(sig.slice(32, 64)),
      challengeIndex: BigInt(cd.indexOf('"challenge":"')),
      typeIndex: BigInt(cd.indexOf('"type":"')),
      authenticatorData: toHex(authData),
      clientDataJSON: cd,
    };
  }
}
