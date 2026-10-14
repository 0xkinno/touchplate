import type { Metadata } from "next";
import { GlowCard } from "@/components/ui";
import verify from "@/data/verify-output.json";
import { TOUCHPLATE, addrUrl, short } from "@/lib/env";

export const metadata: Metadata = {
  title: "Build on Touchplate",
  description: "Seal, look up and verify image provenance from your own app, against one contract, without asking us.",
};

const DEPLOY_BLOCK = 113077560;

const pdqCode = `import { pdqFromRgba } from "@touchplate/core";

// rgba is the decoded pixel buffer, 512 px on the long edge.
const q = pdqFromRgba(rgba, width, height);
// q.hash      0x... 256-bit PDQ fingerprint
// q.quality   0..100 (below 50 is excluded from automatic priority)
// q.dihedral  8 hashes: the fingerprint under each flip and rotation
// Only q leaves the page. The pixels never do.`;

const lookupCode = `const res = await fetch("https://touchplate.vercel.app/api/lookup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ pdq: { hash: q.hash, quality: q.quality, dihedral: q.dihedral } }),
});
const { certificate, seeds, finalizedBlock, entries } = await res.json();
// certificate.verdict.kind  MATCHED | AUTHORED | CONTESTED | NO_RECORD
// certificate.certSha256    reproducible offline
// seeds                     public mark seeds, for local z-scores
// finalizedBlock, entries   registry head and revealed count`;

const sealCode = `// After your generator produces an image (full script: drills/src/seal.ts):
const batch = buildBatch(commitments);          // Merkle root over the shoot
await wallet.writeContract({ address, abi: touchplateAbi, functionName: "touch",
  args: [batch.root, commitments.length, passkeyAssertion] });
// wait until the touch block is Finalized, then once per image:
await wallet.writeContract({ address, abi: touchplateAbi, functionName: "reveal",
  args: [batch.root, batch.proofs[i], pdq, dihedralRoot, salt, markSeedHash, manifestHash, licensePrice] });`;

const contractRows: [string, string, string, string][] = [
  ["registerStudio", "Any address, once", "Binds a P-256 passkey and an Ed25519 studio key to the caller", "AlreadyRegistered, BadAssertion"],
  ["touch", "A registered studio", "Commits a Merkle root. The passkey assertion is verified on chain; the block number is the priority", "NotStudio, CountZero, TouchExists, BadAssertion"],
  ["reveal", "The studio that touched", "Opens one commitment, no earlier than the block after the touch", "NotAuthor, RevealTooEarly, RevealTooLate, BadProof, AlreadyRevealed, PriceTooLarge"],
  ["recordPriority", "Anyone", "Marks a later entry as a derivative of an earlier one by another author, proven by a committed dihedral variant", "NotRevealed, NotMatched, IsDerivative, SameBlock, NotEarlier, BadProof"],
  ["proveMark", "The entry author", "Publishes the watermark seed of one image, checked against the committed hash", "NotAuthor, SeedMismatch"],
  ["license", "Anyone", "Pays the author in an allowed token with the fee capped in code. Derivatives revert", "TokenNotAllowed, NotRevealed, IsDerivative, PriceAboveMax"],
];

const eventRows: [string, string][] = [
  ["StudioRegistered", "author, qx, qy, ed25519Pub"],
  ["Touched", "root, author, count, nonce"],
  ["Revealed", "commitment, root, author, pdq, dihedralRoot, touchBlock, markSeedHash, manifestHash, licensePrice"],
  ["PriorityRecorded", "earlier, later, distance"],
  ["MarkProven", "commitment, suspectSha256, seed, zMilli, uri"],
  ["Licensed", "commitment, licensee, author, token, paid, fee"],
];

function Code({ children, label }: { children: string; label: string }) {
  return (
    <pre aria-label={label} className="mono text-[12px] leading-relaxed rounded-xl border border-line bg-ink text-paper p-4 overflow-x-auto" data-no-overlap="code"><code>{children}</code></pre>
  );
}

export default function Developers() {
  return (
    <div className="mx-auto w-[min(1120px,calc(100%-32px))] pb-24 space-y-12">
      <header className="pt-6 max-w-3xl">
        <h1 data-no-overlap="headline" className="display text-5xl md:text-7xl">Build on <span className="accent-serif">Touchplate</span></h1>
        <p className="mt-4 text-lg text-ink-2">Touchplate is a provenance primitive. Any app can seal, look up and verify without asking us.</p>
        <p className="mono text-[12px] text-mute mt-3">@touchplate/core is a workspace package, publishing next. Use it from the repository today.</p>
      </header>

      <section className="grid lg:grid-cols-3 gap-5" aria-label="Integration paths">
        <GlowCard className="space-y-3 min-w-0">
          <p className="mono text-[12px] text-violet-deep">01</p>
          <h2 className="font-semibold text-xl" data-no-overlap="path-title">Fingerprint in the browser</h2>
          <p className="text-sm text-ink-2">Only the 256-bit hash and its 8 dihedral variants leave the page.</p>
          <Code label="Fingerprint in the browser">{pdqCode}</Code>
        </GlowCard>
        <GlowCard className="space-y-3 min-w-0">
          <p className="mono text-[12px] text-violet-deep">02</p>
          <h2 className="font-semibold text-xl" data-no-overlap="path-title">Look up by fingerprint</h2>
          <p className="text-sm text-ink-2">The endpoint never accepts image bytes (invariant I9). It returns the engine verdict and a certificate.</p>
          <Code label="Look up by fingerprint">{lookupCode}</Code>
        </GlowCard>
        <GlowCard className="space-y-3 min-w-0">
          <p className="mono text-[12px] text-violet-deep">03</p>
          <h2 className="font-semibold text-xl" data-no-overlap="path-title">Verify without us</h2>
          <p className="text-sm text-ink-2">The verifier reads chain logs and your file. No Touchplate server is involved. Output is from a real run.</p>
          <Code label="Verify without us">{`$ ${verify.command}\n${verify.lines.join("\n")}`}</Code>
        </GlowCard>
      </section>

      <section className="space-y-4">
        <h2 className="display text-3xl md:text-4xl">The <span className="accent-serif">contract</span></h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-paper-2 mono text-[12px] text-mute text-left"><tr><th className="p-3">Function</th><th className="p-3">Who may call</th><th className="p-3">What it guarantees</th><th className="p-3">Reverts with</th></tr></thead>
            <tbody className="divide-y divide-line">
              {contractRows.map(([f, who, g, e]) => (
                <tr key={f} className="align-top"><td className="p-3 mono text-[12px]">{f}</td><td className="p-3">{who}</td><td className="p-3 text-ink-2">{g}</td><td className="p-3 mono text-[11px] text-ink-2">{e}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="display text-3xl md:text-4xl">Events for <span className="accent-serif">indexers</span></h2>
        <p className="mono text-[12px] text-ink-2">
          Monad mainnet {TOUCHPLATE ? <a className="text-violet-deep underline" href={addrUrl(TOUCHPLATE)} target="_blank" rel="noreferrer">{short(TOUCHPLATE, 6)}</a> : null} · deployed at block {DEPLOY_BLOCK}
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-paper-2 mono text-[12px] text-mute text-left"><tr><th className="p-3">Event</th><th className="p-3">Fields</th></tr></thead>
            <tbody className="divide-y divide-line">
              {eventRows.map(([e, f]) => (<tr key={e}><td className="p-3 mono text-[12px]">{e}</td><td className="p-3 mono text-[11px] text-ink-2">{f}</td></tr>))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="display text-3xl md:text-4xl">Seal at <span className="accent-serif">creation</span></h2>
        <p className="text-ink-2 max-w-2xl">The sequence an image generator follows after it produces an image: commit with one touch, wait for Finalized, then reveal.</p>
        <Code label="Seal at creation">{sealCode}</Code>
      </section>
    </div>
  );
}
