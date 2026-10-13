"use client";
import { useEffect, useState } from "react";
import { ErrorNote, Skeleton } from "./ui";
import { short, txUrl } from "@/lib/env";

interface Row { kind: string; tx: string; block: string; logIndex: number; detail: string; finalized: boolean }

export function LedgerPreview() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const es = new EventSource("/api/ledger?stream=1");
    es.onmessage = (e) => { setErr(null); setRows((JSON.parse(e.data) as { rows: Row[] }).rows.slice(0, 8)); };
    es.onerror = () => setErr("The live feed is reconnecting.");
    return () => es.close();
  }, []);
  if (err && !rows) return <ErrorNote message={err} />;
  if (!rows) return <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={34} />)}</div>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-paper-2/60">
      <table className="t"><tbody>
        {rows.map((r) => (
          <tr key={`${r.tx}-${r.logIndex}`}>
            <td className={r.finalized ? "text-violet-deep" : "text-mute"}>{r.finalized ? "Finalized" : "Pending"}</td>
            <td>{r.kind}</td><td>{r.block}</td><td>{r.detail}</td>
            <td><a className="text-violet-deep underline" href={txUrl(r.tx)} target="_blank" rel="noreferrer">{short(r.tx, 5)}</a></td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}
