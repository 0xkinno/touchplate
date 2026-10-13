import { certificateFor, getRegistry, isHex32, jsonResponse } from "@/lib/registry";
import type { PdqResult } from "@touchplate/core";

export const dynamic = "force-dynamic";

/**
 * Receives a fingerprint only (never image bytes, invariant I9) and returns the engine's verdict plus the
 * public mark seeds that authors have proven, so the browser can recompute the mark z-score locally.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { pdq?: PdqResult };
  try {
    body = (await req.json()) as { pdq?: PdqResult };
  } catch {
    return jsonResponse({ error: "Send JSON with a fingerprint." }, { status: 400 });
  }
  const q = body.pdq;
  if (!q || !isHex32(q.hash) || !Array.isArray(q.dihedral) || q.dihedral.length !== 8 || !q.dihedral.every(isHex32) || typeof q.quality !== "number") {
    return jsonResponse({ error: "A fingerprint with 8 dihedral variants is required." }, { status: 400 });
  }
  try {
    const reg = await getRegistry();
    const { cert } = await certificateFor(q);
    const seeds = reg.snap.marks.map((m) => ({ commitment: m.commitment, seed: m.seed, zMilli: m.zMilli, tx: m.txHash }));
    return jsonResponse({ certificate: cert, seeds, finalizedBlock: reg.finalized, entries: reg.snap.revealed.length });
  } catch (e) {
    return jsonResponse({ error: "The registry could not be read right now. Try again in a moment.", detail: String(e) }, { status: 503 });
  }
}
