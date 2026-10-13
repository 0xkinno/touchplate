import WebSocket from "ws";
import { writeFileSync } from "node:fs";
const WS = "wss://testnet-rpc.monad.xyz";
const RPC = "https://testnet-rpc.monad.xyz";
const DURATION_MS = Number(process.env.DURATION_MS ?? 90000);
const blocks = new Map(); // blockId -> {number, states:{State:t}}
const tags = [];
const rpc = async (method, params) =>
  (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;
const ws = new WebSocket(WS);
ws.on("open", () => ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["monadNewHeads"] })));
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  const r = m.params?.result;
  if (!r?.blockId) return;
  const e = blocks.get(r.blockId) ?? { number: Number(r.number), blockTimestamp: Number(r.timestamp), states: {} };
  if (!(r.commitState in e.states)) e.states[r.commitState] = Date.now();
  blocks.set(r.blockId, e);
});
const poll = setInterval(async () => {
  const [l, s, f] = await Promise.all(["latest", "safe", "finalized"].map((t) => rpc("eth_getBlockByNumber", [t, false])));
  tags.push({ t: Date.now(), latest: Number(l.number), safe: Number(s.number), finalized: Number(f.number) });
}, 500);
setTimeout(() => {
  clearInterval(poll); ws.close();
  const rows = [...blocks.entries()].map(([id, b]) => ({ blockId: id, number: b.number, ...b.states }))
    .filter((b) => b.Proposed && b.Voted && b.Finalized && b.Verified).sort((a, b) => a.number - b.number);
  const d = (a, b) => rows.map((r) => r[b] - r[a]).sort((x, y) => x - y);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const summ = (arr) => ({ n: arr.length, p50: q(arr, 0.5), p90: q(arr, 0.9), p99: q(arr, 0.99), min: arr[0], max: arr[arr.length - 1] });
  const dist = {
    proposed_to_voted_ms: summ(d("Proposed", "Voted")),
    voted_to_finalized_ms: summ(d("Voted", "Finalized")),
    proposed_to_finalized_ms: summ(d("Proposed", "Finalized")),
    finalized_to_verified_ms: summ(d("Finalized", "Verified")),
    proposed_to_verified_ms: summ(d("Proposed", "Verified")),
  };
  const dup = {};
  for (const b of blocks.values()) dup[b.number] = (dup[b.number] ?? 0) + 1;
  const competing = Object.values(dup).filter((n) => n > 1).length;
  // tag lag: at each poll, latest - safe and latest - finalized
  const lagSafe = tags.map((x) => x.latest - x.safe).sort((a, b) => a - b);
  const lagFin = tags.map((x) => x.latest - x.finalized).sort((a, b) => a - b);
  const out = { source: "monadNewHeads, public testnet WS", rpc: RPC, durationMs: DURATION_MS, blocksObserved: blocks.size, completeLadders: rows.length, competingProposalsSeen: competing, distribution: dist, tagLagBlocks: { latestMinusSafe: summ(lagSafe), latestMinusFinalized: summ(lagFin) }, firstBlock: rows[0]?.number, lastBlock: rows.at(-1)?.number, sample: rows.slice(0, 5) };
  writeFileSync("s1-ladder-blocks.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}, DURATION_MS);
