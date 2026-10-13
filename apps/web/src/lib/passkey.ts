import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
  type WebAuthnClient,
} from "@category-labs/mera";
import { authFromAssertion, deriveKeyFamilies, p256FromSpki, type KeyFamilies, type WebAuthnAuth } from "@touchplate/core";
import type { Hex } from "viem";

export interface StoredPasskey {
  credentialId: string;
  qx: Hex;
  qy: Hex;
  createdAt: number;
}

const KEY = (wallet: string): string => `touchplate.passkey.${wallet.toLowerCase()}`;
const rpId = (): string => window.location.hostname;

export function loadPasskey(wallet: string): StoredPasskey | null {
  try {
    const raw = localStorage.getItem(KEY(wallet));
    return raw ? (JSON.parse(raw) as StoredPasskey) : null;
  } catch {
    return null;
  }
}

function savePasskey(wallet: string, p: StoredPasskey): void {
  try {
    localStorage.setItem(KEY(wallet), JSON.stringify(p));
  } catch {
    /* storage unavailable: the passkey still works for this session */
  }
}

/** Reads the P-256 public key out of the creation ceremony by wrapping Mera's injectable WebAuthn client. */
function capturingClient(sink: { spki?: Uint8Array }): WebAuthnClient {
  return {
    async createCredential(req) {
      const cred = (await navigator.credentials.create({
        publicKey: {
          rp: req.rp,
          user: req.user,
          challenge: req.challenge,
          pubKeyCredParams: req.algorithms.map((alg) => ({ type: "public-key" as const, alg })),
          attestation: req.attestation,
          authenticatorSelection: { residentKey: req.residentKey, requireResidentKey: true, userVerification: req.userVerification },
          extensions: { prf: { eval: { first: req.prfSalt } } } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("no credential returned");
      const resp = cred.response as AuthenticatorAttestationResponse;
      const pk = resp.getPublicKey();
      if (pk) sink.spki = new Uint8Array(pk);
      const prf = (cred.getClientExtensionResults() as { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }).prf;
      return {
        credentialId: new Uint8Array(cred.rawId),
        transports: resp.getTransports?.() ?? [],
        prfEnabled: prf?.enabled === true,
        ...(prf?.results?.first ? { prfOutput: new Uint8Array(prf.results.first) } : {}),
      };
    },
    async getCredential(req) {
      const cred = (await navigator.credentials.get({
        publicKey: {
          rpId: req.rpId,
          challenge: req.challenge,
          userVerification: req.userVerification,
          extensions: { prf: { eval: { first: req.prfSalt } } } as AuthenticationExtensionsClientInputs,
          ...(req.allowCredential ? { allowCredentials: [{ id: req.allowCredential.credentialId, type: "public-key" as const }] } : {}),
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("no credential returned");
      const prf = (cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf;
      return {
        credentialId: new Uint8Array(cred.rawId),
        ...(prf?.results?.first ? { prfOutput: new Uint8Array(prf.results.first) } : {}),
      };
    },
  };
}

export class PrfUnavailableError extends Error {
  constructor() {
    super(
      "This device or browser cannot derive keys from a passkey. Use iCloud Keychain, Google Password Manager or 1Password. A desktop Chrome local profile is not supported.",
    );
  }
}

/** One ceremony: creates the passkey, captures its P-256 key, derives the three key families. */
export async function createPasskey(wallet: string): Promise<{ stored: StoredPasskey; families: KeyFamilies }> {
  const sink: { spki?: Uint8Array } = {};
  try {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: rpId(), name: "Touchplate" },
      user: { name: `${wallet.slice(0, 10)}@touchplate`, displayName: "Touchplate studio" },
      webAuthnClient: capturingClient(sink),
    });
    if (!sink.spki) throw new Error("the authenticator did not expose its public key");
    const { qx, qy } = p256FromSpki(sink.spki);
    const stored: StoredPasskey = { credentialId: created.credentialId, qx, qy, createdAt: Date.now() };
    savePasskey(wallet, stored);
    return { stored, families: deriveKeyFamilies(created.prfOutput) };
  } catch (e) {
    if (isMeraError(e) && e.code === "PRF_UNAVAILABLE") throw new PrfUnavailableError();
    throw e;
  }
}

/** Passkey touch that re-derives the key families (mark root, studio key) for a session. */
export async function unlockFamilies(stored: StoredPasskey): Promise<KeyFamilies> {
  try {
    const r = await getPasskeyPrfOutput({ rpId: rpId(), credential: { credentialId: stored.credentialId }, webAuthnClient: capturingClient({}) });
    return deriveKeyFamilies(r.prfOutput);
  } catch (e) {
    if (isMeraError(e) && e.code === "PRF_UNAVAILABLE") throw new PrfUnavailableError();
    throw e;
  }
}

/** A passkey assertion over a bare 32-byte challenge, shaped for `WebAuthn.verify` on chain. */
export async function assertChallenge(stored: StoredPasskey, challenge: Hex): Promise<WebAuthnAuth> {
  const id = Uint8Array.from(atob(stored.credentialId.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const cred = (await navigator.credentials.get({
    publicKey: {
      rpId: rpId(),
      challenge: Uint8Array.from(Buffer.from(challenge.slice(2), "hex")),
      allowCredentials: [{ id, type: "public-key" }],
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey assertion cancelled");
  const r = cred.response as AuthenticatorAssertionResponse;
  return authFromAssertion({
    authenticatorData: new Uint8Array(r.authenticatorData),
    clientDataJSON: new Uint8Array(r.clientDataJSON),
    signature: new Uint8Array(r.signature),
  });
}
