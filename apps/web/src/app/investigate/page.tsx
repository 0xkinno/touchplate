"use client";
import type { Certificate } from "@touchplate/core";
import { useState } from "react";
import { FileDrop } from "@/components/FileDrop";
import { ErrorNote } from "@/components/ui";
import { fetchImage, fingerprintOf } from "@/lib/image";

type Event =
  | { type: "tool"; name: string; args: Record<string, string>; result: unknown }
  | { type: "validator"; ok: boolean; note: string }
  | { type: "report"; verdict: { kind: string }; certificate: Certificate; narrative: string; narrativeSource: string }
  | { type: "error"; message: string };

export default function InvestigatePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [page, setPage] = useState("");
  const [fileName, setFileName] = useState<string[]>([]);

  const go = async (blob: Blob): Promise<void> => {
    setBusy(true); setErr(null); setEvents([]);
    try {
      const pdq = await fingerprintOf(blob);
      const r = await fetch("/api/investigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pdq, url: page || undefined }) });
      if (!r.ok || !r.body) throw new Error("The investigator could not start.");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) setEvents((e) => [...e, JSON.parse(line) as Event]);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The investigation failed.");
    } finally { setBusy(false); }
  };

  const report = events.find((e): e is Extract<Event, { type: "report" }> => e.type === "report");
  const failed = events.find((e): e is Extract<Event, { type: "error" }> => e.type === "error");

  return (
    <div className="mx-auto w-[min(860px,calc(100%-32px))] pb-24 space-y-6">
      <header className="pt-6">
        <h1 className="display text-5xl md:text-6xl">The <span className="accent-serif">investigator</span></h1>
        <p className="mt-3 text-ink-2 max-w-xl">A language model plans and calls tools against Monad. Deterministic code owns the verdict; the model only explains it, and any name or number it adds that the engine did not output is rejected.</p>
      </header>
      <div className="rounded-2xl border border-line bg-paper-2/70 p-5 space-y-3">
        <FileDrop label="Drop the image to investigate" hint="Only its fingerprint is sent to the investigator." disabled={busy} names={fileName} onFiles={(f) => { setFileName([f[0].name]); void go(f[0]); }} />
        <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); if (url) fetchImage(url).then(go).catch((x: unknown) => setErr(x instanceof Error ? x.message : "Could not fetch.")); }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="or an image address" aria-label="Image address" className="mono text-[12px] px-3 py-2 rounded-[10px] border border-line bg-paper w-72 max-w-full" />
          <button className="btn-outline rounded-[10px] px-3 py-2 mono text-[12px]">Investigate</button>
        </form>
        <input value={page} onChange={(e) => setPage(e.target.value)} placeholder="optional: the page where you found it" aria-label="Page address" className="mono text-[12px] px-3 py-2 rounded-[10px] border border-line bg-paper w-full max-w-md" />
      </div>
      {busy && <p className="mono text-[13px] text-mute" role="status">Investigating…</p>}
      {err && <ErrorNote message={err} />}
      {failed && <ErrorNote message={failed.message} />}
      {report && (
        <article className="rounded-2xl border border-line bg-paper-2/80 p-6 space-y-3" data-no-overlap="report">
          <p className="inline-block mono text-[12px] rounded-full border border-violet/40 bg-violet/10 text-violet-deep px-3 py-1">Verdict copied from the engine: {report.verdict.kind}</p>
          <p className="text-lg whitespace-pre-line">{report.narrative.replace(/\*\*/g, "").replace(/\s+(Who|What|When|Confidence|Likely transforms|Next):/g, "
$1:").trim()}</p>
          <p className="mono text-[11px] text-mute">Narrative source: {report.narrativeSource}. certSha256 {report.certificate.certSha256.slice(0, 20)}…</p>
        </article>
      )}
      <ol className="space-y-3 min-w-0">
        {events.filter((e) => e.type === "tool" || e.type === "validator").map((e, i) => (
          <li key={i} className="rounded-xl border border-line bg-paper p-4 min-w-0">
            {e.type === "tool" ? <ToolCard name={e.name} args={e.args} result={e.result} /> : <p className="mono text-[12px] text-ember">{e.note}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function oneLine(name: string, r: Record<string, unknown>): string {
  const kind = typeof r.kind === "string" ? r.kind : typeof (r.verdict as { kind?: string } | undefined)?.kind === "string" ? (r.verdict as { kind: string }).kind : null;
  const parts: string[] = [];
  if (kind) parts.push(kind);
  if (typeof r.distance === "number") parts.push(`distance ${r.distance}`);
  for (const k of ["touchBlock", "blockNumber", "finalizedBlock"]) if (r[k] !== undefined) parts.push(`block ${String(r[k])}`);
  return parts.length ? parts.join(" · ") : `${name} returned ${Object.keys(r).length} fields`;
}

function ToolCard({ name, args, result }: { name: string; args: Record<string, string>; result: unknown }) {
  const r = (result && typeof result === "object" ? result : { value: result }) as Record<string, unknown>;
  const scalar = Object.entries(r).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)).slice(0, 8);
  return (
    <div className="space-y-2">
      <p className="mono text-[13px] font-semibold">{name}</p>
      <p className="text-sm text-ink-2">{oneLine(name, r)}</p>
      {scalar.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mono text-[12px]">
          {scalar.map(([k, v]) => (<div key={k} className="contents"><dt className="text-mute">{k}</dt><dd className="break-all">{String(v)}</dd></div>))}
        </dl>
      )}
      <details>
        <summary className="mono text-[12px] text-violet-deep cursor-pointer">Show raw</summary>
        <pre className="mono text-[11px] whitespace-pre-wrap break-all text-ink-2 mt-1 max-h-48 overflow-auto">{JSON.stringify({ args, result }, null, 1).slice(0, 2400)}</pre>
      </details>
    </div>
  );
}
