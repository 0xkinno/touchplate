"use client";
import { useAppKit } from "@reown/appkit/react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseAbi, type Hex } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { AUSD, CHAIN_ID, short, TOUCHPLATE, txUrl, USDC } from "@/lib/env";
import { humanError, useTx } from "@/lib/tx";
import { ErrorNote } from "./ui";

const erc20 = parseAbi([
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

interface Entry {
  licensePrice: string;
  derivative: boolean;
  author: string;
}
interface AuroraQuote {
  amountIn?: string;
  amountInFormatted?: string;
  amountOutFormatted?: string;
  depositAddress?: string;
  timeEstimate?: number;
}
type OriginToken = { assetId: string; symbol: string; blockchain: string };

const SUCCESS = new Set(["SUCCESS"]);
const TERMINAL_BAD = new Set(["REFUNDED", "FAILED"]);

/** License in AUSD or USDC on Monad (approve, then license: two real wallet transactions), or fund from any chain. */
export function LicensePanel({ commitment }: { commitment: Hex }) {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const tx = useTx();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [token, setToken] = useState<"AUSD" | "USDC">("AUSD");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ approve?: string; license?: string } | null>(null);

  useEffect(() => {
    fetch(`/api/entry/${commitment}`).then((r) => r.json()).then((j: Entry & { error?: string }) => {
      if (j.error) setErr(j.error);
      else setEntry(j);
    }).catch(() => setErr("The license price could not be read."));
  }, [commitment]);

  const tokenAddr = token === "AUSD" ? AUSD : USDC;
  const price = entry ? BigInt(entry.licensePrice) : 0n;
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr, abi: erc20, functionName: "allowance", args: address ? [address, TOUCHPLATE] : undefined, chainId: CHAIN_ID,
    query: { enabled: !!address },
  });
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: tokenAddr, abi: erc20, functionName: "balanceOf", args: address ? [address] : undefined, chainId: CHAIN_ID,
    query: { enabled: !!address },
  });

  const needsApprove = (allowance ?? 0n) < price;
  const hasFunds = (balance ?? 0n) >= price;

  const approve = async (): Promise<void> => {
    setBusy("approve"); setErr(null);
    try {
      const r = await tx({ kind: "approve", functionName: "approve", args: [TOUCHPLATE, price], address: tokenAddr, abi: erc20 });
      setDone((d) => ({ ...d, approve: r.hash }));
      await refetchAllowance();
    } catch (e) { setErr(humanError(e)); } finally { setBusy(null); }
  };
  const license = async (): Promise<void> => {
    setBusy("license"); setErr(null);
    try {
      const r = await tx({ kind: "license", functionName: "license", args: [commitment, tokenAddr, price] });
      setDone((d) => ({ ...d, license: r.hash }));
      await refetchBalance();
    } catch (e) { setErr(humanError(e)); } finally { setBusy(null); }
  };

  if (!entry) return err ? <ErrorNote message={err} /> : <p className="mono text-[12px] text-mute">Reading license terms…</p>;
  if (price === 0n) return <p className="text-sm text-ink-2">The author has not set a license price.</p>;

  return (
    <section className="rounded-xl border border-line bg-paper p-4 space-y-4" aria-label="License this image">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h4 className="font-semibold">License · {formatUnits(price, 6)} {token}</h4>
        <div className="flex gap-1" role="radiogroup" aria-label="Payment token">
          {(["AUSD", "USDC"] as const).map((t) => (
            <button key={t} role="radio" aria-checked={token === t} onClick={() => setToken(t)} className={`mono text-[12px] px-3 py-1 rounded-lg border ${token === t ? "bg-ink text-paper border-ink" : "border-line"}`}>{t}</button>
          ))}
        </div>
      </div>

      {!isConnected ? (
        <button onClick={() => open()} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]">Connect wallet to license</button>
      ) : (
        <div className="flex gap-2 flex-wrap items-center">
          <button disabled={!needsApprove || busy !== null} onClick={approve} className="btn-outline rounded-[10px] px-4 py-2 mono text-[13px]">
            {busy === "approve" ? "Confirm in wallet…" : needsApprove ? `1. Approve ${token}` : "1. Approved"}
          </button>
          <button disabled={needsApprove || !hasFunds || busy !== null} onClick={license} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]">
            {busy === "license" ? "Confirm in wallet…" : "2. License"}
          </button>
          {!hasFunds && <span className="mono text-[12px] text-mute">Balance {balance !== undefined ? formatUnits(balance, 6) : "…"} {token}. Use the any-chain option below.</span>}
        </div>
      )}
      {done?.approve && <p className="mono text-[12px]">Approved: <a className="text-violet-deep underline" href={txUrl(done.approve)} target="_blank" rel="noreferrer">{short(done.approve, 8)}</a></p>}
      {done?.license && <p className="mono text-[12px]">Licensed: <a className="text-violet-deep underline" href={txUrl(done.license)} target="_blank" rel="noreferrer">{short(done.license, 8)}</a>. Paid to the author.</p>}
      {err && <ErrorNote message={err} />}
      <AnyChain amountOut={price} recipient={address} onFunded={() => { setToken("USDC"); void refetchBalance(); }} />
    </section>
  );
}

function AnyChain({ amountOut, recipient, onFunded }: { amountOut: bigint; recipient?: string; onFunded: () => void }) {
  const [tokens, setTokens] = useState<OriginToken[]>([]);
  const [origin, setOrigin] = useState<string>("");
  const [refundTo, setRefundTo] = useState("");
  const [dry, setDry] = useState<AuroraQuote | null>(null);
  const [live, setLive] = useState<AuroraQuote | null>(null);
  const [qr, setQr] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/aurora/quote").then((r) => r.json()).then((j: { tokens?: OriginToken[] }) => {
      const list = j.tokens ?? [];
      setTokens(list);
      const base = list.find((t) => t.blockchain === "base" && t.symbol === "USDC");
      if (base) setOrigin(base.assetId);
    }).catch(() => setErr("The route list is not reachable right now."));
  }, []);

  const quote = useCallback(async (isDry: boolean): Promise<AuroraQuote | null> => {
    if (!recipient) { setErr("Connect a wallet so the funds can be delivered to your address."); return null; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/aurora/quote", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountOut: amountOut.toString(), recipient, refundTo: refundTo || undefined, originAsset: origin || undefined, dry: isDry }),
      });
      const j = (await r.json()) as { quote?: { quote?: AuroraQuote } & AuroraQuote; error?: string };
      if (!r.ok) throw new Error(j.error ?? "The route could not be quoted.");
      return (j.quote?.quote ?? j.quote ?? null) as AuroraQuote | null;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Quote failed.");
      return null;
    } finally { setBusy(false); }
  }, [amountOut, recipient, refundTo, origin]);

  useEffect(() => {
    if (!recipient || !origin) return;
    let cancelled = false;
    quote(true).then((q) => { if (!cancelled) setDry(q); });
    return () => { cancelled = true; };
  }, [recipient, origin, quote]);

  const getDeposit = async (): Promise<void> => {
    if (!refundTo) { setErr("Enter the address on the origin chain that should receive a refund if anything fails."); return; }
    const q = await quote(false);
    if (q?.depositAddress) {
      setLive(q);
      setQr(await QRCode.toDataURL(q.depositAddress, { margin: 1, width: 192 }));
      setStatus("PENDING_DEPOSIT");
    }
  };

  useEffect(() => {
    if (!live?.depositAddress) return;
    if (SUCCESS.has(status) || TERMINAL_BAD.has(status)) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/aurora/status?depositAddress=${encodeURIComponent(live.depositAddress ?? "")}`);
        const j = (await r.json()) as { status?: string };
        if (j.status) {
          setStatus(j.status);
          if (SUCCESS.has(j.status)) onFunded();
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(t);
  }, [live, status, onFunded]);

  return (
    <details className="rounded-lg border border-line p-3">
      <summary className="cursor-pointer font-semibold text-[14px]">License from any chain</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-ink-2">Pay with an asset on another chain. It is swapped to USDC on Monad and delivered to your connected address; then you sign the license.</p>
        <label className="block mono text-[12px]">Pay with
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="block mt-1 w-full max-w-xs rounded-lg border border-line bg-paper px-2 py-2">
            {tokens.map((t) => <option key={t.assetId} value={t.assetId}>{t.symbol} on {t.blockchain}</option>)}
          </select>
        </label>
        {dry?.amountInFormatted && <p className="mono text-[13px]">You send about <strong>{dry.amountInFormatted}</strong>, the author receives {formatUnits(amountOut, 6)} USDC on Monad.</p>}
        {!recipient && <p className="mono text-[12px] text-mute">Connect a wallet to see the exact amount.</p>}
        <label className="block mono text-[12px]">Refund address on the origin chain
          <input value={refundTo} onChange={(e) => setRefundTo(e.target.value)} className="block mt-1 w-full rounded-lg border border-line bg-paper px-2 py-2" placeholder="your address on that chain" />
        </label>
        <button onClick={getDeposit} disabled={busy || !recipient} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]">{busy ? "Working…" : "Get deposit address"}</button>
        {live?.depositAddress && (
          <div className="flex gap-4 items-start flex-wrap">
            {qr && <img src={qr} width={192} height={192} alt="Deposit address QR code" className="rounded-lg border border-line" />}
            <div className="mono text-[12px] space-y-2 min-w-0">
              <p>Send exactly <strong>{live.amountInFormatted}</strong> to:</p>
              <p className="break-all select-all">{live.depositAddress}</p>
              <p>Status: <strong>{status || "waiting"}</strong></p>
              {SUCCESS.has(status) && <p className="text-violet-deep">Funds arrived on Monad. Switch to USDC above and sign the license.</p>}
              {TERMINAL_BAD.has(status) && <p className="text-ember">The swap did not complete. Funds are refunded to your refund address.</p>}
            </div>
          </div>
        )}
        {err && <ErrorNote message={err} />}
      </div>
    </details>
  );
}
