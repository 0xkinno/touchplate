import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import numbers from "@/data/numbers.json";
import { EXPLORER, TOUCHPLATE, addrUrl, short, txUrl } from "@/lib/env";

export const metadata = { title: "Proof · Touchplate" };

const ROOT = join(process.cwd(), "..", "..");
const readJson = <T,>(p: string): T | null => {
  try { return JSON.parse(readFileSync(join(ROOT, p), "utf8")) as T; } catch { return null; }
};

interface Evidence { log?: { step: string; hash: string }[] }
interface Deploy { address: string; deployTx: string; chainId: number; deployBlock: number }

export default function ProofPage() {
  const deployment = readJson<Deploy>("docs/deployments/10143.json");
  const seal = readJson<Evidence>("docs/evidence/seal-run.json");
  const drillsDir = join(ROOT, "docs", "drills");
  const drills = existsSync(drillsDir)
    ? readdirSync(drillsDir).filter((f) => f.endsWith(".json")).sort().map((f) => readJson<{ id: string; title: string; outcome: string; passed: boolean; txs: { label: string; hash: string }[] }>(`docs/drills/${f}`)).filter((d): d is NonNullable<typeof d> => !!d)
    : [];
  const n = numbers;

  return (
    <div className="mx-auto w-[min(1120px,calc(100%-32px))] pb-24 space-y-10">
      <header className="pt-6">
        <h1 className="display text-5xl md:text-6xl">The <span className="accent-serif">proof</span></h1>
        <p className="mt-3 text-ink-2 max-w-2xl">Every number on this page is generated from a results file in the repository. {n.simulatedTransformsNote.charAt(0).toUpperCase() + n.simulatedTransformsNote.slice(1)}. Corpus: {n.corpus}.</p>
      </header>

      <section aria-labelledby="h-surv">
        <h2 id="h-surv" className="font-semibold text-xl mb-3">What survives a platform round trip</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Stat big={n.platformRoundTrip.pdqRecall} label="fingerprint recall after strip, resize 1080, JPEG 72" />
          <Stat big={n.platformRoundTrip.sha256Match} label="file-hash registry match after the same round trip" />
          <Stat big={String(n.falseMatchRate * n.distractorPairs)} label={`false matches among ${n.distractorPairs} distractor pairs`} />
        </div>
      </section>

      <section aria-labelledby="h-crop">
        <h2 id="h-crop" className="font-semibold text-xl mb-3">Where it breaks: crops</h2>
        <p className="text-ink-2 mb-3 max-w-2xl">Large crops are out of scope. Fingerprint recall falls off quickly and the watermark does not survive a crop.</p>
        <div className="overflow-x-auto rounded-2xl border border-line"><table className="t"><thead><tr><th>Crop, share of each axis</th><th>Fingerprint recall</th></tr></thead>
          <tbody>{n.crop.map((c) => <tr key={c.perAxisPct}><td>{c.perAxisPct}%</td><td>{c.recall}</td></tr>)}</tbody></table></div>
      </section>

      <section aria-labelledby="h-monad">
        <h2 id="h-monad" className="font-semibold text-xl mb-3">Why Monad</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat big={`${n.finalizedMsP50} ms`} label={`Proposed to Finalized, p50 over ${n.ladderBlocks} blocks`} />
          <Stat big={`${n.verifiedMsP50} ms`} label="Proposed to Verified, p50" />
          <Stat big={`${n.p256.validGas}`} label={`gas to verify a passkey on chain (fallback ${n.p256.solidityFallbackGas})`} />
          <Stat big={`${n.storage.packedWriteGas}`} label={`gas to write an entry in one page (scattered ${n.storage.scatteredWriteGas})`} />
        </div>
        {n.ownTx && <p className="mono text-[12px] text-mute mt-3">Own transactions ({n.ownTx.n}): Finalized p50 {n.ownTx.finalizedP50} ms, p90 {n.ownTx.finalizedP90} ms, Verified p50 {n.ownTx.verifiedP50} ms.</p>}
      </section>

      <section aria-labelledby="h-mark">
        <h2 id="h-mark" className="font-semibold text-xl mb-3">Watermark</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Stat big={`${n.mark.psnrMin} dB`} label="minimum PSNR of marked images" />
          <Stat big={`${n.mark.zMinAfterTransforms}`} label="minimum z after JPEG, WebP, resize and round trip" />
          <Stat big={`${n.mark.unmarkedMaxAbsZ}`} label="largest |z| on unmarked images (decision threshold 6)" />
        </div>
      </section>

      <section aria-labelledby="h-dep">
        <h2 id="h-dep" className="font-semibold text-xl mb-3">Deployment</h2>
        {deployment ? (
          <dl className="mono text-[12px] space-y-1 break-all">
            <div>Contract <a className="text-violet-deep underline" href={addrUrl(deployment.address)} target="_blank" rel="noreferrer">{deployment.address}</a> (chain {deployment.chainId}, block {deployment.deployBlock})</div>
            <div>Deploy tx <a className="text-violet-deep underline" href={txUrl(deployment.deployTx)} target="_blank" rel="noreferrer">{deployment.deployTx}</a></div>
            <div>Live app contract: {TOUCHPLATE ? <a className="text-violet-deep underline" href={`${EXPLORER}/address/${TOUCHPLATE}`} target="_blank" rel="noreferrer">{short(TOUCHPLATE, 8)}</a> : "not configured"}</div>
          </dl>
        ) : <p className="text-ink-2">No deployment record found.</p>}
        {seal?.log && (
          <ul className="mono text-[12px] mt-3 space-y-1 break-all">{seal.log.map((l, i) => <li key={i}>{l.step}: <a className="text-violet-deep underline" href={txUrl(l.hash)} target="_blank" rel="noreferrer">{short(l.hash, 10)}</a></li>)}</ul>
        )}
      </section>

      <section aria-labelledby="h-inv">
        <h2 id="h-inv" className="font-semibold text-xl mb-3">Invariants</h2>
        <div className="overflow-x-auto rounded-2xl border border-line"><table className="t"><thead><tr><th>ID</th><th>Invariant</th><th>Checked by</th></tr></thead><tbody>
          {INV.map(([id, text, by]) => <tr key={id}><td>{id}</td><td>{text}</td><td>{by}</td></tr>)}
        </tbody></table></div>
      </section>

      <section aria-labelledby="h-drill">
        <h2 id="h-drill" className="font-semibold text-xl mb-3">Break campaign</h2>
        {drills.length === 0 ? <p className="text-ink-2">Drill results are generated by the drill scripts and listed here when present.</p> : (
          <div className="space-y-3">{drills.map((d) => (
            <article key={d.id} className="rounded-xl border border-line p-4">
              <h3 className="font-semibold">{d.id} · {d.title} <span className={d.passed ? "text-violet-deep" : "text-ember"}>{d.passed ? "as expected" : "unexpected"}</span></h3>
              <p className="text-sm text-ink-2 mt-1">{d.outcome}</p>
              <p className="mono text-[11px] mt-2 flex flex-wrap gap-x-3 gap-y-1">{d.txs.map((t) => <a key={t.hash} className="text-violet-deep underline" href={txUrl(t.hash)} target="_blank" rel="noreferrer">{t.label}</a>)}</p>
            </article>))}</div>
        )}
      </section>

      <section aria-labelledby="h-ver">
        <h2 id="h-ver" className="font-semibold text-xl mb-3">Verify without trusting us</h2>
        <pre className="mono text-[12px] rounded-xl border border-line bg-paper-2 p-4 overflow-x-auto max-w-full whitespace-pre-wrap break-all">{`pnpm --filter touchplate-verify start -- --image ./suspect.jpg --rpc https://testnet-rpc.monad.xyz --contract ${TOUCHPLATE || "<address>"} --from-block ${deployment?.deployBlock ?? "<deploy block>"}\npnpm --filter touchplate-verify start -- --certificate ./cert.json --rpc https://testnet-rpc.monad.xyz --contract ${TOUCHPLATE || "<address>"}`}</pre>
      </section>
    </div>
  );
}

const INV: [string, string, string][] = [
  ["I1", "A Finalized entry's priority never changes", "contract invariant test, verifier"],
  ["I2", "Nothing is labelled Priority locked before its touch block is Finalized", "ladder unit test, UI"],
  ["I3", "No reveal is broadcast before the touch block is Finalized", "Studio gate, drill D5"],
  ["I4", "A reveal proves membership in a touched root by the same author inside the window", "contract tests"],
  ["I5", "Every touch is a fresh passkey assertion bound to root, count, chain and nonce", "contract tests, drill D7"],
  ["I6", "Attribution goes to the earliest finalized matching entry", "verdict tests, drill D4"],
  ["I7", "Server verdict equals the offline verifier verdict", "drill D8"],
  ["I8", "Investigator narrative may not name anything the engine did not output", "validator, drill D9"],
  ["I9", "Images never leave the browser; the server receives fingerprints only", "network test"],
  ["I10", "Every transaction declares an explicit gas limit", "gas profile, transaction hook"],
  ["I11", "Licenses never pay a derivative entry", "contract invariant test"],
  ["I12", "An entry in an abandoned proposal is never shown as recorded", "ladder test"],
];

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper-2/70 p-5">
      <div className="display text-4xl">{big}</div>
      <div className="mono text-[11px] text-ink-2 mt-2">{label}</div>
    </div>
  );
}
