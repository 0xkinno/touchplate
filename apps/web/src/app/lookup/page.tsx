import { LookupPanel } from "@/components/LookupPanel";

export const metadata = { title: "Look up an image · Touchplate" };

export default function LookupPage() {
  return (
    <div className="mx-auto w-[min(860px,calc(100%-32px))] pb-24 space-y-6">
      <header className="pt-6">
        <h1 className="display text-5xl md:text-6xl">Look up <span className="accent-serif">any</span> image</h1>
        <p className="mt-3 text-ink-2 max-w-xl">
          Drag in a repost, a screenshot or a recompressed copy. Touchplate fingerprints it here in your browser and finds the earliest finalized seal.
          No wallet is needed to look up.
        </p>
      </header>
      <LookupPanel />
    </div>
  );
}
