import { getRegistry, jsonResponse, replacer } from "@/lib/registry";

export const dynamic = "force-dynamic";

type Row = {
  kind: "touch" | "reveal" | "priority" | "mark" | "license" | "studio";
  tx: string;
  block: string;
  logIndex: number;
  author?: string;
  commitment?: string;
  detail: string;
  finalized: boolean;
};

async function rows(): Promise<{ rows: Row[]; finalized: string; head: string }> {
  const c = await getRegistry(2500);
  const f = c.finalized;
  const out: Row[] = [
    ...c.snap.studios.map((s): Row => ({ kind: "studio", tx: s.txHash, block: String(s.blockNumber), logIndex: s.logIndex, author: s.author, detail: "studio registered", finalized: s.blockNumber <= f })),
    ...c.snap.touched.map((t): Row => ({ kind: "touch", tx: t.txHash, block: String(t.blockNumber), logIndex: t.logIndex, author: t.author, commitment: t.root, detail: `sealed ${t.count} image${t.count === 1 ? "" : "s"}`, finalized: t.blockNumber <= f })),
    ...c.snap.revealed.map((r): Row => ({ kind: "reveal", tx: r.txHash, block: String(r.blockNumber), logIndex: r.logIndex, author: r.author, commitment: r.commitment, detail: `fingerprint ${r.pdq.slice(0, 14)}…`, finalized: r.blockNumber <= f })),
    ...c.snap.priority.map((p): Row => ({ kind: "priority", tx: p.txHash, block: String(p.blockNumber), logIndex: p.logIndex, commitment: p.later, detail: `derivative of ${p.earlier.slice(0, 10)}… (distance ${p.distance})`, finalized: p.blockNumber <= f })),
    ...c.snap.marks.map((m): Row => ({ kind: "mark", tx: m.txHash, block: String(m.blockNumber), logIndex: m.logIndex, commitment: m.commitment, detail: `mark proven z ${(m.zMilli / 1000).toFixed(1)}`, finalized: m.blockNumber <= f })),
    ...c.snap.licenses.map((l): Row => ({ kind: "license", tx: l.txHash, block: String(l.blockNumber), logIndex: l.logIndex, author: l.author, commitment: l.commitment, detail: `licensed for ${Number(l.paid) / 1e6}`, finalized: l.blockNumber <= f })),
  ];
  out.sort((a, b) => Number(BigInt(b.block) - BigInt(a.block)) || b.logIndex - a.logIndex);
  return { rows: out, finalized: String(f), head: String(c.snap.scannedTo) };
}

/** `?stream=1` returns Server-Sent Events; otherwise a JSON snapshot. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("stream") !== "1") {
    try {
      return jsonResponse(await rows());
    } catch (e) {
      return jsonResponse({ error: "The ledger could not be read right now.", detail: String(e) }, { status: 503 });
    }
  }
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const push = async (): Promise<void> => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(await rows(), replacer)}\n\n`));
        } catch {
          controller.enqueue(enc.encode(`event: error\ndata: {"error":"read failed"}\n\n`));
        }
      };
      await push();
      timer = setInterval(push, 3000);
      req.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        controller.close();
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}
