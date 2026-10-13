import { scanRegistry, toEntryRefs } from "@touchplate/core";
import { pub, TP } from "./lib.ts";
const t0 = Date.now();
const snap = await scanRegistry(pub, TP, BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? 0));
const fin = await pub.getBlock({ blockTag: "finalized" });
const refs = toEntryRefs(snap, fin.number);
console.log({ ms: Date.now() - t0, from: snap.scannedFrom, to: snap.scannedTo, studios: snap.studios.length, touched: snap.touched.length, revealed: snap.revealed.length, finalizedRefs: refs.filter((r) => r.finalized).length });
