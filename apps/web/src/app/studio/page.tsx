"use client";
import { useAppKit } from "@reown/appkit/react";
import {
  buildBatch, commitmentOf, dihedralRootOf, embed, manifestHashOf, markSeedFor, markSeedHash, psnr, signManifest, studioChallenge,
  touchChallenge, trackLadder, detect, touchplateAbi, type Manifest, type PdqResult,
} from "@touchplate/core";
import { ed25519 } from "@noble/curves/ed25519.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toHex, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { ErrorNote, Ladder, type RungKey } from "@/components/ui";
import { CHAIN_ID, TOUCHPLATE, WS_URL, short, txUrl } from "@/lib/env";
import { fingerprintOf, jpegOf, rasterOf, sha256Hex, type Raster } from "@/lib/image";
import {
  assertChallenge, createPasskey, loadPasskey, unlockFamilies, PrfUnavailableError, type StoredPasskey,
} from "@/lib/passkey";
import { getSession, startSession, subscribeSession } from "@/lib/session";
import { humanError, useTx } from "@/lib/tx";
import { Providers } from "@/components/Providers";

interface Item {
  id: string;
  name: string;
  before: string;
  after: string;
  published: Blob;
  pdq: PdqResult;
  quality: number;
  psnr: number;
  salt: Hex;
  srcPdq: Hex;
  commitment: Hex;
  msh: Hex;
  manifestHash: Hex;
  signedManifest: string;
  dihedralRoot: Hex;
  dihedralProofs: Hex[][];
  priceUnits: bigint;
  revealTx?: Hex;
}

interface Batch {
  root: Hex;
  proofs: Hex[][];
  touchTx?: Hex;
  touchBlock?: bigint;
  touchHash?: Hex;
  rungs: Partial<Record<RungKey, number>>;
}

interface SavedEntry { commitment: Hex; srcPdq: Hex; salt: Hex; name: string; revealTx?: Hex }
const SAVED = (a: string): string => `touchplate.entries.${a.toLowerCase()}`;

function readSaved(a: string): SavedEntry[] {
  try { return JSON.parse(localStorage.getItem(SAVED(a)) ?? "[]") as SavedEntry[]; } catch { return []; }
}
function writeSaved(a: string, v: SavedEntry[]): void {
  try { localStorage.setItem(SAVED(a), JSON.stringify(v)); } catch { /* storage unavailable */ }
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="rounded-2xl border border-line bg-paper-2/70 p-6">
      <h2 className="flex items-center gap-3 font-semibold text-lg">
        <span className={`mono text-[12px] w-7 h-7 rounded-lg grid place-items-center ${done ? "bg-violet text-paper" : "bg-ink text-paper"}`}>{done ? "✓" : n}</span>
        {title}
      </h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function StudioInner() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const pub = usePublicClient({ chainId: CHAIN_ID });
  const tx = useTx();
  const [stored, setStored] = useState<StoredPasskey | null>(null);
  const [, bump] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [price, setPrice] = useState("12");
  const [log, setLog] = useState<{ label: string; hash: Hex }[]>([]);
  const [proveFor, setProveFor] = useState<Hex | null>(null);
  const [proveResult, setProveResult] = useState<string>("");

  useEffect(() => subscribeSession(() => bump((n) => n + 1)), []);
  useEffect(() => { setStored(address ? loadPasskey(address) : null); }, [address]);

  const families = getSession();
  const { data: studio, refetch: refetchStudio } = useReadContract({
    address: TOUCHPLATE, abi: touchplateAbi, functionName: "studios", args: address ? [address] : undefined, chainId: CHAIN_ID,
    query: { enabled: !!address },
  });
  const registered = !!studio && (studio as readonly unknown[])[4] === true;
  const studioPub = useMemo(() => (families ? toHex(ed25519.getPublicKey(families.studioSeed)) : undefined), [families]);
  const saved = address ? readSaved(address) : [];

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof PrfUnavailableError ? e.message : humanError(e)); } finally { setBusy(null); }
  }, []);

  const onCreatePasskey = (): Promise<void> => run("passkey", async () => {
    if (!address) return;
    const { stored: s, families: f } = await createPasskey(address);
    setStored(s);
    startSession(f);
  });
  const onUnlock = (): Promise<void> => run("unlock", async () => {
    if (!stored) return;
    startSession(await unlockFamilies(stored));
  });

  const onRegister = (): Promise<void> => run("register", async () => {
    if (!address || !stored || !studioPub) return;
    const challenge = studioChallenge(BigInt(CHAIN_ID), address, stored.qx, stored.qy, studioPub);
    const auth = await assertChallenge(stored, challenge);
    const r = await tx({ kind: "registerStudio", functionName: "registerStudio", args: [stored.qx, stored.qy, studioPub, auth] });
    setLog((l) => [...l, { label: "Studio registered", hash: r.hash }]);
    await refetchStudio();
  });

  const onFiles = (files: FileList | null): Promise<void> => run("mark", async () => {
    if (!files || !address || !families) return;
    const units = BigInt(Math.round(Number(price) * 1e6));
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      const raster: Raster = await rasterOf(file, 1600);
      const srcPdq = await fingerprintOf(file);
      const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const seed = markSeedFor(families.markRoot, srcPdq.hash, salt);
      await tick();
      const marked = embed(raster.rgb, raster.width, raster.height, 3, seed);
      const published = await jpegOf({ rgb: marked.rgb, width: raster.width, height: raster.height }, 0.92);
      const pdq = await fingerprintOf(published);
      const dih = dihedralRootOf(pdq.dihedral);
      const manifest: Manifest = {
        title: file.name, creator: short(address), licenseTerms: "Editorial use, one year", priceAusd: (Number(units) / 1e6).toFixed(6),
        pdq: pdq.hash, quality: pdq.quality, markSeedHash: markSeedHash(seed), appVersion: "0.1.0",
      };
      const signed = signManifest(manifest, families.studioSeed);
      const commitment = commitmentOf(BigInt(CHAIN_ID), address, {
        pdq: pdq.hash, dihedralRoot: dih.root, salt, markSeedHash: markSeedHash(seed), manifestHash: manifestHashOf(manifest),
      });
      next.push({
        id: commitment, name: file.name, before: URL.createObjectURL(file), after: URL.createObjectURL(published), published, pdq,
        quality: pdq.quality, psnr: psnr(raster.rgb, marked.rgb), salt, srcPdq: srcPdq.hash, commitment, msh: markSeedHash(seed), manifestHash: signed.manifestHash,
        signedManifest: JSON.stringify(signed, null, 2), dihedralRoot: dih.root, dihedralProofs: dih.proofs, priceUnits: units,
      });
      setItems([...next]);
      await tick();
    }
    const b = buildBatch(next.map((i) => i.commitment));
    setBatch({ root: b.root, proofs: b.proofs, rungs: {} });
  });

  const onTouch = (): Promise<void> => run("touch", async () => {
    if (!address || !stored || !batch || !pub) return;
    const nonce = (await pub.readContract({ address: TOUCHPLATE, abi: touchplateAbi, functionName: "touchNonce", args: [address] })) as bigint;
    const challenge = touchChallenge(BigInt(CHAIN_ID), address, batch.root, items.length, nonce);
    const auth = await assertChallenge(stored, challenge);
    const r = await tx({ kind: "touch", functionName: "touch", args: [batch.root, items.length, auth] }, (h) => setBatch((b) => (b ? { ...b, touchTx: h } : b)));
    setLog((l) => [...l, { label: "Touched", hash: r.hash }]);
    setBatch((b) => (b ? { ...b, touchTx: r.hash, touchBlock: r.receipt.blockNumber, touchHash: r.receipt.blockHash, rungs: { proposed: Date.now() } } : b));
    writeSaved(address, [...readSaved(address), ...items.map((i) => ({ commitment: i.commitment, srcPdq: i.srcPdq, salt: i.salt, name: i.name }))]);
    void trackLadder(pub as never, r.hash, (rung, at) => {
      if (rung === "proposed" || rung === "voted" || rung === "finalized" || rung === "verified") {
        setBatch((b) => (b ? { ...b, rungs: { ...b.rungs, [rung]: at } } : b));
      }
    }, { wsUrl: WS_URL }).catch((e: unknown) => setErr(humanError(e)));
  });

  const finalized = batch?.rungs.finalized !== undefined;

  const onReveal = (): Promise<void> => run("reveal", async () => {
    if (!batch || !address) return;
    for (const [i, it] of items.entries()) {
      if (it.revealTx) continue;
      const r = await tx({
        kind: "reveal", functionName: "reveal",
        args: [batch.root, batch.proofs[i], it.pdq.hash, it.dihedralRoot, it.salt, it.msh, it.manifestHash, it.priceUnits],
      });
      setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, revealTx: r.hash } : x)));
      setLog((l) => [...l, { label: `Revealed ${it.name}`, hash: r.hash }]);
      writeSaved(address, readSaved(address).map((s) => (s.commitment === it.commitment ? { ...s, revealTx: r.hash } : s)));
    }
  });

  const download = (blob: Blob, name: string): void => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };

  const onProve = (file: File): Promise<void> => run("prove", async () => {
    if (!proveFor || !families) return;
    const entry = saved.find((s) => s.commitment === proveFor);
    if (!entry) throw new Error("This entry was sealed from another browser; its seed inputs are not stored here.");
    const seed = markSeedFor(families.markRoot, entry.srcPdq, entry.salt);
    const raster = await rasterOf(file, 4096);
    const z = detect(raster.rgb, raster.width, raster.height, 3, seed);
    if (z < 6) throw new Error(`The watermark was not found in that file (z ${z.toFixed(1)}). A mark is lost by crops.`);
    const r = await tx({
      kind: "proveMark", functionName: "proveMark",
      args: [proveFor, await sha256Hex(file), toHex(seed), Math.round(z * 1000), ""],
    });
    setLog((l) => [...l, { label: "Mark proven", hash: r.hash }]);
    setProveResult(`Mark proven on chain with z ${z.toFixed(1)}. The seed is now public so anyone can recompute it.`);
  });

  return (
    <div className="mx-auto w-[min(960px,calc(100%-32px))] pb-24 space-y-5">
      <header className="pt-6">
        <h1 className="display text-5xl md:text-6xl">Seal your <span className="accent-serif">work</span></h1>
        <p className="mt-3 text-ink-2 max-w-xl">One touch seals a whole shoot. Your images are watermarked and fingerprinted in this browser and never uploaded.</p>
      </header>

      <Step n={1} title="Connect a wallet" done={isConnected}>
        <p className="text-sm text-ink-2">Your wallet pays gas and confirms every transaction. Your passkey signs the touch.</p>
        {!isConnected && <button className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]" onClick={() => open()}>Connect wallet</button>}
        {isConnected && <p className="mono text-[12px]">{address}</p>}
      </Step>

      <Step n={2} title="Passkey" done={!!families}>
        {!stored && <button disabled={!isConnected || busy !== null} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]" onClick={onCreatePasskey}>{busy === "passkey" ? "Waiting for your device…" : "Create passkey"}</button>}
        {stored && !families && <button disabled={busy !== null} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]" onClick={onUnlock}>{busy === "unlock" ? "Waiting for your device…" : "Unlock with passkey"}</button>}
        {families && <p className="mono text-[12px] text-ink-2">Unlocked. Keys are held in memory only and cleared after 10 idle minutes or 2 minutes with the tab hidden.</p>}
        <p className="mono text-[11px] text-mute">Works with iCloud Keychain, Google Password Manager and 1Password. A desktop Chrome local profile cannot derive keys.</p>
      </Step>

      <Step n={3} title="Register your studio" done={registered}>
        {registered ? <p className="mono text-[12px]">Registered. Your passkey is bound to this address on chain.</p> : (
          <button disabled={!families || !isConnected || busy !== null} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]" onClick={onRegister}>
            {busy === "register" ? "Confirm in wallet…" : "Touch and register"}
          </button>
        )}
      </Step>

      <Step n={4} title="Drop a shoot" done={items.length > 0}>
        <label className="mono text-[12px] block">License price (AUSD)
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} className="ml-2 w-24 rounded-lg border border-line bg-paper px-2 py-1" />
        </label>
        <input type="file" accept="image/*" multiple disabled={!families || !registered || busy !== null} onChange={(e) => void onFiles(e.target.files)} aria-label="Choose images to seal" className="block text-sm" />
        {busy === "mark" && <p className="mono text-[12px] text-mute" role="status">Watermarking and fingerprinting…</p>}
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((it) => (
            <figure key={it.id} className="rounded-xl border border-line bg-paper p-3 space-y-2">
              <BeforeAfter before={it.before} after={it.after} alt={it.name} />
              <figcaption className="mono text-[11px] flex justify-between gap-2 flex-wrap">
                <span>{it.name}</span><span>PSNR {it.psnr.toFixed(1)} dB</span>
                <span className={it.quality < 50 ? "text-ember" : ""}>{it.quality < 50 ? "low detail: excluded from automatic priority" : `quality ${it.quality}`}</span>
              </figcaption>
              <div className="flex gap-2 flex-wrap">
                <button className="btn-outline rounded-lg px-3 py-1 mono text-[11px]" onClick={() => download(it.published, `sealed-${it.name.replace(/\.[^.]+$/, "")}.jpg`)}>Marked image</button>
                <button className="btn-outline rounded-lg px-3 py-1 mono text-[11px]" onClick={() => download(new Blob([it.signedManifest], { type: "application/json" }), `manifest-${it.commitment.slice(2, 10)}.json`)}>Signed manifest</button>
              </div>
            </figure>
          ))}
        </div>
      </Step>

      <Step n={5} title="Touch" done={!!batch?.touchTx}>
        {batch && <p className="mono text-[11px] text-mute break-all">Batch root {batch.root}</p>}
        <button disabled={!batch || !!batch.touchTx || busy !== null} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]" onClick={onTouch}>
          {busy === "touch" ? "Touch your passkey, then confirm in wallet…" : `Seal ${items.length || ""} image${items.length === 1 ? "" : "s"} with one touch`}
        </button>
        {batch?.touchTx && (
          <div className="space-y-2">
            <Ladder reached={batch.rungs} />
            <p className="mono text-[12px]">
              {finalized ? "Priority locked: the touch block is Finalized." : "Waiting for Finalized. Nothing is called locked before then."}
              {" "}<a className="text-violet-deep underline" href={txUrl(batch.touchTx)} target="_blank" rel="noreferrer">{short(batch.touchTx, 8)}</a>
            </p>
          </div>
        )}
      </Step>

      <Step n={6} title="Reveal" done={items.length > 0 && items.every((i) => i.revealTx)}>
        <p className="text-sm text-ink-2">Reveal is only allowed once the touch block is Finalized, so a copier watching the speculative feed learns nothing in time.</p>
        <button disabled={!finalized || busy !== null || items.every((i) => i.revealTx)} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]" onClick={onReveal}>
          {busy === "reveal" ? "Confirm each reveal in wallet…" : "Reveal all"}
        </button>
        <ul className="mono text-[12px] space-y-1">
          {items.filter((i) => i.revealTx).map((i) => (
            <li key={i.id}>{i.name}: <a className="text-violet-deep underline" href={txUrl(i.revealTx as string)} target="_blank" rel="noreferrer">{short(i.revealTx as string, 8)}</a> · <a className="underline" href={`/c/${i.commitment}`}>entry page</a></li>
          ))}
        </ul>
      </Step>

      <Step n={7} title="Prove it's mine">
        <p className="text-sm text-ink-2">If someone posts a copy, drop it here. If your watermark is in it, you can publish that image&apos;s seed on chain. Only that one image is revealed.</p>
        <select className="rounded-lg border border-line bg-paper px-2 py-2 mono text-[12px]" value={proveFor ?? ""} onChange={(e) => setProveFor((e.target.value || null) as Hex | null)} aria-label="Entry to prove">
          <option value="">Choose a sealed entry</option>
          {saved.filter((s) => s.revealTx).map((s) => <option key={s.commitment} value={s.commitment}>{s.name} · {short(s.commitment, 5)}</option>)}
        </select>
        <input type="file" accept="image/*" disabled={!proveFor || !families || busy !== null} onChange={(e) => e.target.files?.[0] && void onProve(e.target.files[0])} aria-label="Suspect image" className="block text-sm" />
        {proveResult && <p className="mono text-[12px] text-violet-deep">{proveResult}</p>}
      </Step>

      {err && <ErrorNote message={err} />}
      {log.length > 0 && (
        <section className="rounded-2xl border border-line p-4">
          <h3 className="font-semibold mb-2">Transactions</h3>
          <ul className="mono text-[12px] space-y-1">
            {log.map((l, i) => <li key={i}>{l.label}: <a className="text-violet-deep underline" href={txUrl(l.hash)} target="_blank" rel="noreferrer">{short(l.hash, 10)}</a></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative select-none overflow-hidden rounded-lg" style={{ aspectRatio: "4 / 3" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={`${alt}, watermarked`} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${alt}, original`} className="absolute inset-0 h-full object-cover" style={{ width: `${100 / (pos / 100)}%`, maxWidth: "none" }} />
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Before and after" className="absolute bottom-2 left-2 right-2" />
    </div>
  );
}

export default function StudioPage() {
  return (
    <Providers>
      <StudioInner />
    </Providers>
  );
}
