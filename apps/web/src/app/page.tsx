import Link from "next/link";
import { LookupPanel } from "@/components/LookupPanel";
import { LedgerPreview } from "@/components/LedgerPreview";
import { TouchplateArt } from "@/components/TouchplateArt";
import { GlowCard, Reveal } from "@/components/ui";
import numbers from "@/data/numbers.json";
import { TOUCHPLATE, addrUrl, short } from "@/lib/env";

const steps = [
  ["Mark", "A secret watermark, keyed by your passkey, is added invisibly. It proves authorship on demand."],
  ["Fingerprint", "A perceptual fingerprint that survives re-encoding is computed in your browser."],
  ["Touch", "One passkey touch seals the whole shoot. The fingerprints stay hidden inside a commitment."],
  ["Lock", "Once the sealing block is Finalized you reveal. Priority is then a fact no server can change."],
];

const faq = [
  ["Does my image get uploaded?", "No. Watermarking and fingerprinting happen in your browser. Lookups send a fingerprint, never the image."],
  ["What if I crop it?", `Large crops are out of scope. Measured fingerprint recall is ${numbers.crop.find((c) => c.perAxisPct === 2)?.recall} at a 2% crop per axis and ${numbers.crop.find((c) => c.perAxisPct === 6)?.recall} at 6%. Re-encoding, resizing, colour changes, flips and rotations are covered.`],
  ["What if someone registers first with my image?", "Priority is decided by the earliest Finalized touch. A copier cannot see your fingerprint before it is final, because it is hidden until your reveal."],
  ["What does it cost?", "A few cents of MON gas per seal and per reveal on Monad. Licensing is paid in AUSD or USDC, with a protocol fee capped at 3%."],
];

export default function Landing() {
  const n = numbers;
  return (
    <>
      <section className="relative overflow-hidden" style={{ minHeight: "min(100svh, 880px)" }}>
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-full w-[58%] max-md:w-full max-md:h-[40svh] max-md:top-auto max-md:bottom-0"
          style={{
            backgroundImage: "url(/hero-plate.webp)",
            backgroundSize: "cover",
            backgroundPosition: "60% 50%",
            maskImage: "linear-gradient(to right, transparent 0%, black 38%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 38%)",
          }}
        />
        <div className="relative mx-auto w-[min(1120px,calc(100%-32px))] grid lg:grid-cols-[1.05fr_.95fr] gap-10 items-center py-10">
          <div className="space-y-6 min-w-0">
            <span className="inline-block mono text-[12px] rounded-full border border-line px-3 py-1 bg-paper/70">Monad · Trust, Identity &amp; AI</span>
            <h1 data-no-overlap="headline" className="display text-[44px] sm:text-6xl lg:text-[80px]">
              Proof of who made it first, even after the internet strips the <span className="accent-serif">credit.</span>
            </h1>
            <p className="text-lg text-ink-2 max-w-xl">Drag any image in. Touchplate finds the author who sealed it first, before the repost existed, and shows the block where priority locked.</p>
            <div className="flex gap-3 flex-wrap" data-no-overlap="ctas">
              <Link prefetch={false} href="/lookup" className="btn-ink rounded-[12px] px-5 py-3 font-semibold">Look up an image</Link>
              <Link prefetch={false} href="/studio" className="btn-outline rounded-[12px] px-5 py-3 font-semibold">Seal your work</Link>
            </div>
            <div className="max-w-xl"><LookupPanel compact /></div>
          </div>
          <div className="max-lg:hidden"><TouchplateArt /></div>
        </div>
      </section>

      <section className="mx-auto w-[min(1120px,calc(100%-32px))] py-16">
        <Reveal><h2 className="display text-4xl md:text-5xl mb-8">The problem, in one <span className="accent-serif">strip</span></h2></Reveal>
        <div className="grid md:grid-cols-3 gap-4">
          <GlowCard><p className="mono text-[12px] text-mute">1 · Ada posts</p><p className="mt-2">A photojournalist in Lagos publishes her flood photographs with her name and metadata.</p></GlowCard>
          <GlowCard><p className="mono text-[12px] text-mute">2 · The repost appears</p><p className="mt-2">Within an hour it is re-uploaded, stripped and squeezed. A file-hash registry matches <strong>{n.platformRoundTrip.sha256Match}</strong> of such copies.</p></GlowCard>
          <GlowCard><p className="mono text-[12px] text-mute">3 · The agency credits the repost</p><p className="mt-2">The fingerprint still matches <strong>{n.platformRoundTrip.pdqRecall}</strong> of them. That is what Touchplate keeps.</p></GlowCard>
        </div>
        <p className="mono text-[11px] text-mute mt-3">{n.corpus}. {n.simulatedTransformsNote}.</p>
      </section>

      <section className="mx-auto w-[min(1120px,calc(100%-32px))] py-16">
        <Reveal><h2 className="display text-4xl md:text-5xl mb-8">How a touch <span className="accent-serif">works</span></h2></Reveal>
        <ol className="grid md:grid-cols-4 gap-4">
          {steps.map(([t, d], i) => (
            <li key={t}><GlowCard><p className="mono text-[12px] text-violet-deep">0{i + 1}</p><h3 className="font-semibold text-xl mt-1">{t}</h3><p className="text-sm text-ink-2 mt-2">{d}</p></GlowCard></li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-[min(1120px,calc(100%-32px))] py-16">
        <Reveal><h2 className="display text-4xl md:text-5xl mb-8">Why <span className="accent-serif">Monad</span></h2></Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlowCard><div className="display text-4xl">{n.finalizedMsP50} ms</div><p className="mono text-[11px] mt-2 text-ink-2">Proposed to Finalized, median. Only the Finalized order is a fact.</p></GlowCard>
          <GlowCard><div className="display text-4xl">commit first</div><p className="mono text-[11px] mt-2 text-ink-2">Logs publish at Proposed to every subscriber, so the fingerprint is hidden until after finality.</p></GlowCard>
          <GlowCard><div className="display text-4xl">{n.p256.validGas}</div><p className="mono text-[11px] mt-2 text-ink-2">gas to verify a passkey on chain with the P-256 precompile.</p></GlowCard>
          <GlowCard><div className="display text-4xl">{n.storage.packedWriteGas}</div><p className="mono text-[11px] mt-2 text-ink-2">gas to write an entry, packed in one storage page.</p></GlowCard>
        </div>
      </section>

      <section className="mx-auto w-[min(1120px,calc(100%-32px))] py-16">
        <Reveal><h2 className="display text-4xl md:text-5xl mb-4">The <span className="accent-serif">proof</span></h2></Reveal>
        <p className="text-ink-2 max-w-2xl">Generated numbers, the break campaign with transaction links, and a verifier that recomputes everything offline.</p>
        <div className="mt-4 flex gap-3 flex-wrap">
          <Link prefetch={false} href="/proof" className="btn-ink rounded-[12px] px-5 py-3 font-semibold">Open the proof</Link>
          <code className="mono text-[12px] rounded-xl border border-line bg-paper-2 px-3 py-3 overflow-x-auto max-w-full">touchplate-verify --image suspect.jpg --contract {TOUCHPLATE ? short(TOUCHPLATE, 6) : "…"}</code>
        </div>
      </section>

      <section className="mx-auto w-[min(1120px,calc(100%-32px))] py-16">
        <Reveal><h2 className="display text-4xl md:text-5xl mb-6">Live <span className="accent-serif">ledger</span></h2></Reveal>
        <LedgerPreview />
      </section>

      <section className="mx-auto w-[min(1120px,calc(100%-32px))] py-16 grid md:grid-cols-2 gap-6">
        <GlowCard><h3 className="font-semibold text-xl">For creators</h3><ul className="mt-3 space-y-2 text-ink-2 list-disc pl-5"><li>Seal a whole shoot with one touch.</li><li>Show the block where your priority locked.</li><li>Get paid in AUSD or USDC when an editor licenses.</li></ul></GlowCard>
        <GlowCard><h3 className="font-semibold text-xl">For editors</h3><ul className="mt-3 space-y-2 text-ink-2 list-disc pl-5"><li>Drop a repost, see the original author.</li><li>Download a certificate anyone can re-verify offline.</li><li>License from any chain in a few steps.</li></ul></GlowCard>
      </section>

      <section className="mx-auto w-[min(860px,calc(100%-32px))] py-16">
        <Reveal><h2 className="display text-4xl md:text-5xl mb-6">Questions</h2></Reveal>
        <div className="divide-y divide-line border-y border-line">
          {faq.map(([q, a]) => (<details key={q} className="py-4"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-2 text-ink-2">{a}</p></details>))}
        </div>
      </section>

      <footer className="bg-ink text-paper mt-10">
        <div className="mx-auto w-[min(1120px,calc(100%-32px))] py-12 grid md:grid-cols-3 gap-8 text-sm">
          <div><p className="font-bold text-lg">Touchplate</p><p className="text-paper/60 mt-2">Touchplate proves who made an image first, even after the internet strips the credit.</p></div>
          <div className="mono text-[12px] space-y-2"><p><Link prefetch={false} href="/lookup">Look up</Link> · <Link prefetch={false} href="/studio">Studio</Link> · <Link prefetch={false} href="/ledger">Ledger</Link> · <Link prefetch={false} href="/proof">Proof</Link></p>{TOUCHPLATE && <p>Contract <a className="underline" href={addrUrl(TOUCHPLATE)} target="_blank" rel="noreferrer">{short(TOUCHPLATE, 8)}</a></p>}</div>
          <p className="text-paper/50 mono text-[11px]">Built by 0xkinno for Monad Metropolis.</p>
        </div>
      </footer>
    </>
  );
}
