import { Ladder } from "@/components/ui";
import { LicensePanel } from "@/components/LicensePanel";
import { addrUrl, short, txUrl } from "@/lib/env";
import { blockTimeOf, getRegistry, isHex32, refsOf } from "@/lib/registry";
import { formatUnits } from "viem";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return {
    title: `Entry ${short(id, 5)} · Touchplate`,
    openGraph: { title: "Sealed on Monad", description: "Proof of who made it first.", images: [`/c/${id}/opengraph-image`] },
  };
}

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isHex32(id)) return <Missing text="That is not a valid entry id." />;
  const c = await getRegistry().catch(() => null);
  if (!c) return <Missing text="The registry could not be read right now. Try again in a moment." />;
  const rev = c.snap.revealed.find((r) => r.commitment.toLowerCase() === id.toLowerCase());
  if (!rev) return <Missing text="No entry with that id has been revealed yet." />;
  const touch = c.snap.touched.find((t) => t.root === rev.root);
  const ref = refsOf(c).find((r) => r.commitment === rev.commitment);
  const touchTime = touch ? await blockTimeOf(touch.blockNumber) : 0;
  const finalized = ref?.finalized ?? false;
  const marks = c.snap.marks.filter((m) => m.commitment === rev.commitment);
  const licenses = c.snap.licenses.filter((l) => l.commitment === rev.commitment);

  return (
    <div className="mx-auto w-[min(860px,calc(100%-32px))] pb-24 space-y-6">
      <header className="pt-6">
        <p className="mono text-[12px] text-mute">{finalized ? "PRIORITY LOCKED" : "PENDING FINALITY"}</p>
        <h1 className="display text-4xl md:text-5xl">Sealed by {short(rev.author, 5)} at block {String(touch?.blockNumber ?? rev.touchBlock)}</h1>
        {touchTime > 0 && <p className="mt-2 text-ink-2">{new Date(touchTime * 1000).toUTCString()}</p>}
      </header>
      <Ladder reached={finalized ? { proposed: 1, voted: 1, finalized: 1 } : { proposed: 1 }} />
      {ref?.derivative && <p className="rounded-xl border border-ember/40 bg-ember/5 p-4">This entry is recorded on chain as a derivative of an earlier matching entry by another author. It cannot be licensed.</p>}
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mono text-[12px] rounded-2xl border border-line bg-paper-2/70 p-5">
        <div><dt className="text-mute">Author</dt><dd><a className="text-violet-deep underline" href={addrUrl(rev.author)} target="_blank" rel="noreferrer">{rev.author}</a></dd></div>
        <div><dt className="text-mute">Entry</dt><dd className="break-all">{rev.commitment}</dd></div>
        <div><dt className="text-mute">Fingerprint</dt><dd className="break-all">{rev.pdq}</dd></div>
        <div><dt className="text-mute">Manifest hash</dt><dd className="break-all">{rev.manifestHash}</dd></div>
        {touch && <div><dt className="text-mute">Touch tx</dt><dd><a className="text-violet-deep underline" href={txUrl(touch.txHash)} target="_blank" rel="noreferrer">{short(touch.txHash, 10)}</a></dd></div>}
        <div><dt className="text-mute">Reveal tx</dt><dd><a className="text-violet-deep underline" href={txUrl(rev.txHash)} target="_blank" rel="noreferrer">{short(rev.txHash, 10)}</a></dd></div>
        <div><dt className="text-mute">License price</dt><dd>{formatUnits(rev.licensePrice, 6)} (AUSD or USDC)</dd></div>
        <div><dt className="text-mute">Licenses paid</dt><dd>{licenses.length}</dd></div>
        <div><dt className="text-mute">Mark proofs</dt><dd>{marks.length === 0 ? "none published" : marks.map((m) => `z ${(m.zMilli / 1000).toFixed(1)}`).join(", ")}</dd></div>
      </dl>
      {!ref?.derivative && rev.licensePrice > 0n && <LicensePanel commitment={rev.commitment} />}
      <p className="mono text-[11px] text-mute">Check a copy of this image offline with touchplate-verify using the contract address on the proof page.</p>
    </div>
  );
}

function Missing({ text }: { text: string }) {
  return (
    <div className="mx-auto w-[min(640px,calc(100%-32px))] pt-10">
      <h1 className="display text-4xl">Entry not found</h1>
      <p className="mt-3 text-ink-2">{text}</p>
    </div>
  );
}
