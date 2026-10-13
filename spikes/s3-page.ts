import {
  createEd25519SigningSession,
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
  type WebAuthnClient,
} from "@category-labs/mera";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const RP = { id: "localhost", name: "Touchplate spike" };
const hex = (b: Uint8Array): string => `0x${bytesToHex(b)}`;

interface Captured {
  spki?: Uint8Array;
  attestationAuthData?: Uint8Array;
  createdFlags?: number;
}
const captured: Captured = {};

const capturingClient: WebAuthnClient = {
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
    })) as PublicKeyCredential;
    const resp = cred.response as AuthenticatorAttestationResponse;
    const pk = resp.getPublicKey();
    if (pk) captured.spki = new Uint8Array(pk);
    captured.attestationAuthData = new Uint8Array(resp.getAuthenticatorData());
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
    })) as PublicKeyCredential;
    const prf = (cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf;
    return {
      credentialId: new Uint8Array(cred.rawId),
      ...(prf?.results?.first ? { prfOutput: new Uint8Array(prf.results.first) } : {}),
    };
  },
};

async function families(prf: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prf, wordlist));
  const evmKey = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0").privateKey;
  if (!evmKey) throw new Error("no evm key");
  const evm = createSecp256k1SigningSession({ privateKey: evmKey });
  const studioSeed = hkdf(sha256, prf, utf8ToBytes("touchplate"), utf8ToBytes("studio.ed25519.v1"), 32);
  const studio = createEd25519SigningSession({ privateKey: studioSeed });
  const markRoot = hkdf(sha256, prf, utf8ToBytes("touchplate"), utf8ToBytes("mark.v1"), 32);
  const probe = await studio.signMessage(utf8ToBytes("touchplate-probe"));
  const out = {
    evmAddress: getEvmAddress(evm.publicKey),
    studioEd25519Pub: hex(studio.publicKey),
    studioSignatureOverProbe: hex(probe),
    markRootSha256: hex(sha256(markRoot)),
    prfSha256: hex(sha256(prf)),
  };
  evm.end();
  studio.end();
  markRoot.fill(0);
  studioSeed.fill(0);
  return out;
}

function derToRs(der: Uint8Array): { r: Uint8Array; s: Uint8Array } {
  let o = 2;
  if (der[1] & 0x80) o += der[1] & 0x7f;
  const read = (): Uint8Array => {
    if (der[o] !== 0x02) throw new Error("bad DER");
    const len = der[o + 1];
    let v = der.slice(o + 2, o + 2 + len);
    o += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  return { r: read(), s: read() };
}

async function assertion(credential: PasskeyCredentialMetadata, challenge: Uint8Array) {
  const id = Uint8Array.from(atob(credential.credentialId.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const cred = (await navigator.credentials.get({
    publicKey: { rpId: RP.id, challenge: new Uint8Array(challenge), allowCredentials: [{ id, type: "public-key" }], userVerification: "required" },
  })) as PublicKeyCredential;
  const r = cred.response as AuthenticatorAssertionResponse;
  const { r: rr, s: ss } = derToRs(new Uint8Array(r.signature));
  const clientDataJSON = new TextDecoder().decode(r.clientDataJSON);
  return {
    challenge: hex(challenge),
    r: hex(rr),
    s: hex(ss),
    authenticatorData: hex(new Uint8Array(r.authenticatorData)),
    clientDataJSON,
    challengeIndex: clientDataJSON.indexOf('"challenge":"'),
    typeIndex: clientDataJSON.indexOf('"type":"'),
    derSignature: hex(new Uint8Array(r.signature)),
  };
}

(window as unknown as { runS3: () => Promise<unknown> }).runS3 = async () => {
  const created = await createPasskeyWithPrfOutput({
    rp: RP,
    user: { name: "ada@touchplate.test", displayName: "Ada Okafor" },
    webAuthnClient: capturingClient,
  });
  const first = await families(created.prfOutput);
  const again = await getPasskeyPrfOutput({ rpId: RP.id, credential: { credentialId: created.credentialId }, webAuthnClient: capturingClient });
  const second = await families(again.prfOutput);
  const spki = captured.spki;
  if (!spki || spki.length !== 91) throw new Error(`unexpected SPKI length ${spki?.length}`);
  const qx = spki.slice(27, 59);
  const qy = spki.slice(59, 91);
  const challenge = sha256(utf8ToBytes("touchplate.s4.challenge.v1"));
  const a1 = await assertion({ credentialId: created.credentialId }, challenge);
  const challenge2 = sha256(utf8ToBytes("touchplate.s4.challenge.v2"));
  const a2 = await assertion({ credentialId: created.credentialId }, challenge2);
  return {
    credentialId: created.credentialId,
    prfEnabledAtCreate: true,
    spkiPrefix: hex(spki.slice(0, 27)),
    qx: hex(qx),
    qy: hex(qy),
    flagsAtCreate: captured.attestationAuthData ? captured.attestationAuthData[32] : null,
    first,
    second,
    reproducible: JSON.stringify({ ...first, studioSignatureOverProbe: 0 }) === JSON.stringify({ ...second, studioSignatureOverProbe: 0 }),
    assertions: [a1, a2],
  };
};
