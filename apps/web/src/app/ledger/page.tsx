"use client";
import { useEffect, useState } from "react";
import { ErrorNote, Skeleton } from "@/components/ui";
import { addrUrl, short, txUrl } from "@/lib/env";

interface Row {
  kind: string;
  tx: string;
  block: string;
  logIndex: number;
  author?: string;
  commitment?: string;
  detail: string;
  finalized: boolean;
}

export default function LedgerPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fin, setFin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let misses = 0;
    const load = async (): Promise<void> => {
      try {
        const r = await fetch("/api/ledger", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { rows: Row[]; finalized: string };
        if (!alive) return;
        misses = 0;
        setErr(null);
        setRows(d.rows);
        setFin(d.finalized);
      } catch {
        if (!alive) return;
        misses += 1;
        if (misses >= 2) setErr("The ledger could not be read right now.");
      }
    };
    void load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [attempt]);

  return (
    <div className="mx-auto w-[min(1120px,calc(100%-32px))] pb-24">
      <header className="pt-6 mb-6">
        <h1 className="display text-5xl md:text-6xl">The <span className="accent-serif">ledger</span></h1>
        <p className="mt-3 text-ink-2 max-w-xl">Every seal, reveal, derivative record, mark proof and license, straight from Monad logs. Rows harden as their block is Finalized{fin ? ` (finalized head ${fin})` : ""}.</p>
      </header>
      {err && <ErrorNote message={err} onRetry={() => setAttempt((n) => n + 1)} />}
      {!rows && !err && <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={36} />)}</div>}
      {rows && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-paper-2/60">
          <table className="t">
            <thead><tr><th>State</th><th>Event</th><th>Block</th><th>Author</th><th>Detail</th><th>Tx</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.tx}-${r.logIndex}`}>
                  <td><span className={r.finalized ? "text-violet-deep" : "text-mute"}>{r.finalized ? "Finalized" : "Pending"}</span></td>
                  <td>{r.kind}</td>
                  <td>{r.block}</td>
                  <td>{r.author ? <a className="text-violet-deep underline" href={addrUrl(r.author)} target="_blank" rel="noreferrer">{short(r.author, 4)}</a> : ""}</td>
                  <td>{r.commitment && r.kind !== "touch" ? <a className="underline" href={`/c/${r.commitment}`}>{r.detail}</a> : r.detail}</td>
                  <td><a className="text-violet-deep underline" href={txUrl(r.tx)} target="_blank" rel="noreferrer">{short(r.tx, 5)}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
