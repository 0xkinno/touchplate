"use client";
import type { Certificate } from "@touchplate/core/src/certificate.ts";
import { detect } from "@touchplate/core/src/mark.ts";
import type { PdqResult } from "@touchplate/core/src/pdq.ts";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { addrUrl, short, txUrl } from "@/lib/env";
import { fetchImage, fingerprintOf, rasterOf } from "@/lib/image";
import { ErrorNote, Ladder } from "./ui";
const LicensePanel = dynamic(() => import("./LicensePanel").then((m) => m.LicensePanel), { ssr: false });

interface LookupResponse {
  certificate: Certificate;
  seeds: { commitment: string; seed: `0x${string}`; zMilli: number; tx: string }[];
  finalizedBlock: string;
}

interface Result {
  res: LookupResponse;
  q: PdqResult;
  markZ?: number;
  fileName: string;
}

const DISTANCE_MAX = 64;

function DistanceMeter({ d, t }: { d: number; t: number }) {
  const pct = Math.min(100, (d / DISTANCE_MAX) * 100);
  return (
    <div aria-label={`Distance ${d} of threshold ${t}`}>
      <div className="relative h-2 rounded-full bg-line">
        <div className="absolute h-2 rounded-full bg-violet" style={{ width: `${pct}%` }} />
        <div className="absolute -top-1 h-4 w-px bg-ink" style={{ left: `${(t / DISTANCE_MAX) * 100}%` }} />
      </div>
      <div className="mono text-[11px] text-mute mt-1 flex justify-between"><span>0 identical</span><span>match threshold {t}</span></div>
    </div>
  );
}

/** Drop or paste an image. Fingerprint is computed here; only the fingerprint is sent. */
export function LookupPanel({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<Result | null>(null);
  const [url, setUrl] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const run = useCallback(async (blob: Blob, name: string) => {
    setBusy(true);
    setErr(null);
    setOut(null);
    try {
      const q = await fingerprintOf(blob);
      const r = await fetch("/api/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pdq: q }) });
      const body = (await r.json()) as LookupResponse & { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Lookup failed.");
      let markZ: number | undefined;
      const v = body.certificate.verdict;
      if (v.kind === "MATCHED" || v.kind === "AUTHORED") {
        const proof = body.seeds.find((s) => s.commitment === v.entry.commitment);
        if (proof) {
          const raster = await rasterOf(blob);
          const seed = Uint8Array.from(Buffer.from(proof.seed.slice(2), "hex"));
          markZ = detect(raster.rgb, raster.width, raster.height, 3, seed);
        }
      }
      setOut({ res: body, q, markZ, fileName: name });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const onFiles = (files: FileList | null): void => {
    const f = files?.[0];
    if (f) void run(f, f.name);
  };

  const cert = out?.res.certificate;
  const v = cert?.verdict;
  const downloadCert = (): void => {
    if (!cert) return;
    const blob = new Blob([JSON.stringify(cert, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `touchplate-certificate-${cert.certSha256.slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
        onPaste={(e) => onFiles(e.clipboardData.files)}
        className={`rounded-2xl border-2 border-dashed ${over ? "border-violet bg-violet/5" : "border-line bg-paper-2/60"} ${compact ? "p-5" : "p-10"} text-center transition-colors`}
      >
        <p className="font-semibold">Drop any image here</p>
        <p className="text-sm text-ink-2 mt-1">Your image stays in this browser. Only a fingerprint is sent.</p>
        <div className="mt-4 flex gap-2 justify-center flex-wrap">
          <button onClick={() => input.current?.click()} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]">Choose a file</button>
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFiles(e.target.files)} aria-label="Choose an image" />
        </div>
        <form
          className="mt-3 flex gap-2 justify-center flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (!url) return;
            setBusy(true);
            setErr(null);
            fetchImage(url).then((b) => run(b, url)).catch((x: unknown) => { setErr(x instanceof Error ? x.message : "Could not fetch."); setBusy(false); });
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="or paste an image address" className="mono text-[12px] px-3 py-2 rounded-[10px] border border-line bg-paper w-72 max-w-full" aria-label="Image address" />
          <button className="btn-outline rounded-[10px] px-3 py-2 mono text-[12px]" type="submit">Look up</button>
        </form>
      </div>

      {busy && <p className="mono text-[13px] text-mute" role="status">Fingerprinting and checking finalized entries…</p>}
      {err && <ErrorNote message={err} />}

      {cert && v && out && (
        <article className="rounded-2xl border border-line bg-paper-2/80 p-6 space-y-5" aria-live="polite">
          {v.kind === "NO_RECORD" && (
            <>
              <h3 className="display text-3xl">No finalized record</h3>
              <p className="text-ink-2">Nothing sealed on Monad matches this image within distance {cert.threshold}.{out.q.quality < 50 ? " This image has very little detail, which makes matching unreliable." : ""}</p>
            </>
          )}
          {v.kind === "CONTESTED" && (
            <>
              <h3 className="display text-3xl">Contested</h3>
              <p className="text-ink-2">Several authors sealed a match in the same block. Priority cannot be decided on chain.</p>
              <ul className="mono text-[12px] space-y-1">
                {v.candidates.map((c) => (<li key={c.commitment}><Link className="text-violet-deep underline" href={`/c/${c.commitment}`}>{short(c.author)}</Link></li>))}
              </ul>
            </>
          )}
          {(v.kind === "MATCHED" || v.kind === "AUTHORED") && (
            <>
              <div>
                <p className="mono text-[12px] text-mute">{out.markZ !== undefined && out.markZ >= 6 ? "AUTHORED · mark proven" : "FIRST SEALED"}</p>
                <h3 className="display text-3xl">Sealed by {short(v.entry.author)}</h3>
                <p className="text-ink-2 mt-1">
                  Priority locked at block {String(v.entry.touchBlock)}. Distance {v.distance} of {cert.threshold}
                  {out.markZ !== undefined ? `, watermark z ${out.markZ.toFixed(1)}` : ""}.
                </p>
              </div>
              <DistanceMeter d={v.distance} t={cert.threshold} />
              <Ladder reached={v.entry.finalized ? { proposed: 1, voted: 1, finalized: 1 } : { proposed: 1 }} />
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mono text-[12px]">
                <div><dt className="text-mute">Author</dt><dd><a className="text-violet-deep underline" href={addrUrl(v.entry.author)} target="_blank" rel="noreferrer">{short(v.entry.author, 8)}</a></dd></div>
                <div><dt className="text-mute">Entry</dt><dd><Link className="text-violet-deep underline" href={`/c/${v.entry.commitment}`}>{short(v.entry.commitment, 8)}</Link></dd></div>
                {cert.touchTx && <div><dt className="text-mute">Touch tx</dt><dd><a className="text-violet-deep underline" href={txUrl(cert.touchTx)} target="_blank" rel="noreferrer">{short(cert.touchTx, 8)}</a></dd></div>}
                {cert.revealTx && <div><dt className="text-mute">Reveal tx</dt><dd><a className="text-violet-deep underline" href={txUrl(cert.revealTx)} target="_blank" rel="noreferrer">{short(cert.revealTx, 8)}</a></dd></div>}
              </dl>
              {v.laterMatches.length > 0 && <p className="text-sm text-ink-2">{v.laterMatches.length} later entr{v.laterMatches.length === 1 ? "y" : "ies"} by other authors match this image.</p>}
              <div className="flex gap-2 flex-wrap">
                <button onClick={downloadCert} className="btn-outline rounded-[10px] px-4 py-2 mono text-[13px]">Download certificate</button>
                <Link href={`/c/${v.entry.commitment}`} className="btn-outline rounded-[10px] px-4 py-2 mono text-[13px]">Open entry page</Link>
              </div>
              <p className="mono text-[11px] text-mute break-all">certSha256 {cert.certSha256}. Re-run offline: touchplate-verify --image {out.fileName.slice(0, 40)} …</p>
              {!v.entry.derivative && <LicensePanel commitment={v.entry.commitment} />}
              {v.entry.derivative && <p className="text-sm text-ember">This entry is recorded as a derivative of an earlier one and cannot be licensed.</p>}
            </>
          )}
        </article>
      )}
    </div>
  );
}
