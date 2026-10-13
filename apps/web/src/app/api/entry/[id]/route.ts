import { blockTimeOf, getRegistry, isHex32, jsonResponse, refsOf } from "@/lib/registry";

export const dynamic = "force-dynamic";

/** Public record for one entry, assembled only from chain logs. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!isHex32(id)) return jsonResponse({ error: "That is not a valid entry id." }, { status: 400 });
  try {
    const c = await getRegistry();
    const rev = c.snap.revealed.find((r) => r.commitment.toLowerCase() === id.toLowerCase());
    if (!rev) return jsonResponse({ error: "No entry with that id has been revealed." }, { status: 404 });
    const touch = c.snap.touched.find((t) => t.root === rev.root);
    const ref = refsOf(c).find((r) => r.commitment === rev.commitment);
    const studio = c.snap.studios.find((s) => s.author === rev.author);
    const [touchTime, revealTime] = await Promise.all([
      touch ? blockTimeOf(touch.blockNumber) : Promise.resolve(0),
      blockTimeOf(rev.blockNumber),
    ]);
    return jsonResponse({
      commitment: rev.commitment,
      author: rev.author,
      pdq: rev.pdq,
      dihedralRoot: rev.dihedralRoot,
      manifestHash: rev.manifestHash,
      markSeedHash: rev.markSeedHash,
      licensePrice: rev.licensePrice,
      studioEd25519Pub: studio?.ed25519Pub,
      touchTx: touch?.txHash,
      touchBlock: touch?.blockNumber ?? rev.touchBlock,
      touchTime,
      revealTx: rev.txHash,
      revealBlock: rev.blockNumber,
      revealTime,
      finalized: ref?.finalized ?? false,
      derivative: ref?.derivative ?? false,
      marks: c.snap.marks.filter((m) => m.commitment === rev.commitment),
      licenses: c.snap.licenses.filter((l) => l.commitment === rev.commitment).length,
      finalizedBlock: c.finalized,
    });
  } catch (e) {
    return jsonResponse({ error: "The record could not be read right now.", detail: String(e) }, { status: 503 });
  }
}
