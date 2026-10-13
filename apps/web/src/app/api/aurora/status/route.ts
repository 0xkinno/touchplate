import { jsonResponse } from "@/lib/registry";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const addr = new URL(req.url).searchParams.get("depositAddress");
  if (!addr || addr.length < 10 || addr.length > 128) return jsonResponse({ error: "depositAddress is required." }, { status: 400 });
  const key = process.env.AURORA_APP_KEY;
  try {
    const r = await fetch(`https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(addr)}`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
    });
    return jsonResponse(await r.json(), { status: r.status });
  } catch (e) {
    return jsonResponse({ error: "Status is not reachable right now.", detail: String(e) }, { status: 503 });
  }
}
