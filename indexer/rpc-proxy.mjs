#!/usr/bin/env node
/**
 * Local JSON-RPC shim for the indexer. The public Monad RPC caps eth_getLogs at 100 blocks per call; this
 * proxy accepts any range and fans it out into 100-block calls (bounded concurrency, retries), so HyperIndex
 * can read through plain RPC with no HyperSync token and no cloud account.
 *
 *   UPSTREAM=https://rpc.monad.xyz PORT=8546 node rpc-proxy.mjs
 */
import { createServer } from "node:http";

const UPSTREAM = process.env.UPSTREAM ?? "https://rpc.monad.xyz";
const PORT = Number(process.env.PORT ?? 8546);
const SPAN = 100n;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

async function call(method, params, id = 1) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(UPSTREAM, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
      if (r.status === 429 || r.status >= 500) throw new Error(`upstream ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt >= 6) throw e;
      await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
    }
  }
}

async function getLogs(filter) {
  const head = BigInt((await call("eth_blockNumber", [])).result);
  const tag = (v, d) => (v === undefined || v === "latest" || v === "finalized" || v === "safe" || v === "pending" ? d : BigInt(v));
  const from = tag(filter.fromBlock, head);
  const to = tag(filter.toBlock, head);
  if (to - from + 1n <= SPAN) return call("eth_getLogs", [filter]);
  const ranges = [];
  for (let b = from; b <= to; b += SPAN) ranges.push([b, b + SPAN - 1n > to ? to : b + SPAN - 1n]);
  const out = new Array(ranges.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= ranges.length) return;
      const [f, t] = ranges[i];
      const res = await call("eth_getLogs", [{ ...filter, fromBlock: `0x${f.toString(16)}`, toBlock: `0x${t.toString(16)}` }]);
      if (res.error) throw new Error(res.error.message);
      out[i] = res.result;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ranges.length) }, worker));
  return { jsonrpc: "2.0", id: 1, result: out.flat() };
}

async function handle(req) {
  if (req.method !== "eth_getLogs") return call(req.method, req.params ?? [], req.id);
  try {
    const res = await getLogs(req.params[0]);
    return { ...res, id: req.id };
  } catch (e) {
    return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: String(e.message ?? e) } };
  }
}

createServer(async (rq, rs) => {
  let body = "";
  for await (const c of rq) body += c;
  try {
    const parsed = JSON.parse(body);
    const out = Array.isArray(parsed) ? await Promise.all(parsed.map(handle)) : await handle(parsed);
    rs.writeHead(200, { "content-type": "application/json" });
    rs.end(JSON.stringify(out));
  } catch (e) {
    rs.writeHead(500, { "content-type": "application/json" });
    rs.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(e.message ?? e) } }));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`rpc shim on :${PORT} -> ${UPSTREAM}`));
