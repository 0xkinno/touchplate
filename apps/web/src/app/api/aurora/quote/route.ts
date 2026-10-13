import { jsonResponse } from "@/lib/registry";

export const dynamic = "force-dynamic";

const KEY = (): string => (process.env.AURORA_APP_KEY ?? "").trim();
/** Aurora Intents API (key in the URL path, per its docs); the public 1Click API is used when no key is set. */
const quoteUrl = (): string => (KEY() ? `https://intents-api.aurora.dev/api/quote/${KEY()}` : "https://1click.chaindefuser.com/v0/quote");
const tokensUrl = (): string => (KEY() ? `https://intents-api.aurora.dev/api/tokens/${KEY()}` : "https://1click.chaindefuser.com/v0/tokens");
/** Monad USDC as listed by the 1Click token endpoint (chain 143, 0x754704bc...). */
const MONAD_USDC_ASSET = "nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx";
const BASE_USDC_ASSET = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";

interface QuoteBody {
  /** Exact amount of Monad USDC the license costs, in base units (6 decimals). */
  amountOut?: string;
  /** Buyer's Touchplate (Monad) address: receives the USDC and then signs license(). */
  recipient?: string;
  /** Address on the origin chain that gets refunded if the deposit fails. */
  refundTo?: string;
  originAsset?: string;
  dry?: boolean;
}

/**
 * Quote: any-chain asset to USDC on Monad, delivered to the buyer's Touchplate address. With `dry: true` nothing is
 * reserved and no deposit address is issued, so the amount can be shown before the buyer commits.
 */
export async function POST(req: Request): Promise<Response> {
  let b: QuoteBody;
  try {
    b = (await req.json()) as QuoteBody;
  } catch {
    return jsonResponse({ error: "Send JSON." }, { status: 400 });
  }
  if (!b.amountOut || !/^\d+$/.test(b.amountOut) || BigInt(b.amountOut) <= 0n) return jsonResponse({ error: "amountOut must be a positive integer in base units." }, { status: 400 });
  if (!b.recipient || !/^0x[0-9a-fA-F]{40}$/.test(b.recipient)) return jsonResponse({ error: "recipient must be a Monad address." }, { status: 400 });
  const dry = b.dry !== false;
  if (!dry && !b.refundTo) return jsonResponse({ error: "refundTo is required for a live quote." }, { status: 400 });

  const payload = {
    dry,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: 100,
    originAsset: b.originAsset ?? BASE_USDC_ASSET,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: MONAD_USDC_ASSET,
    amount: b.amountOut,
    refundTo: b.refundTo ?? b.recipient,
    refundType: "ORIGIN_CHAIN",
    recipient: b.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  try {
    const r = await fetch(quoteUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!r.ok) return jsonResponse({ error: "The route could not be quoted.", detail: data }, { status: r.status });
    return jsonResponse({ quote: data, authenticated: KEY() !== "", destinationAsset: MONAD_USDC_ASSET, originAsset: payload.originAsset });
  } catch (e) {
    return jsonResponse({ error: "The quote service is not reachable right now.", detail: String(e) }, { status: 503 });
  }
}

/** Origin assets that can fund a license, from the live token list (stablecoins first). */
export async function GET(): Promise<Response> {
  try {
    const r = await fetch(tokensUrl(), { next: { revalidate: 300 } });
    const body = (await r.json()) as { tokens?: unknown[] } | unknown[];
    const all = (Array.isArray(body) ? body : (body.tokens ?? [])) as { assetId: string; symbol: string; blockchain: string; decimals: number; price?: number }[];
    const keep = all.filter((t) => ["USDC", "USDT", "ETH", "SOL", "BTC", "NEAR"].includes(t.symbol) && t.blockchain !== "monad");
    return jsonResponse({ tokens: keep, destination: MONAD_USDC_ASSET });
  } catch (e) {
    return jsonResponse({ error: "The token list is not reachable right now.", detail: String(e) }, { status: 503 });
  }
}
