import WebSocket from "ws";
import { writeFileSync } from "node:fs";
const URL = "wss://testnet-rpc.monad.xyz";
const ws = new WebSocket(URL);
const heads = [], logs = [];
let id = 0;
const send = (method, params) => ws.send(JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }));
ws.on("open", () => { send("eth_subscribe", ["monadNewHeads"]); send("eth_subscribe", ["monadLogs", {}]); });
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.method === "eth_subscription") {
    const r = m.params.result;
    if (r && r.number !== undefined && r.parentHash) heads.push({ t: Date.now(), r }); else logs.push({ t: Date.now(), r });
  } else console.log("ack", JSON.stringify(m).slice(0, 200));
});
ws.on("error", (e) => console.log("ws error", e.message));
setTimeout(() => {
  ws.close();
  writeFileSync("out/s1-ws-heads-sample.json", JSON.stringify(heads.slice(0, 60), null, 1));
  writeFileSync("out/s1-ws-logs-sample.json", JSON.stringify(logs.slice(0, 20), null, 1));
  const byState = {};
  for (const h of heads) byState[h.r.commitState] = (byState[h.r.commitState] ?? 0) + 1;
  console.log("heads", heads.length, "logs", logs.length, "byState", byState);
  console.log("head keys:", heads[0] && Object.keys(heads[0].r).join(","));
  console.log("log keys:", logs[0] && Object.keys(logs[0].r).join(","));
}, 25000);
