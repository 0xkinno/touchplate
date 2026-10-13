/** Build-time registry snapshot so the web app resumes from a checkpoint instead of rescanning from genesis. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanRegistry, snapshotToJson } from "@touchplate/core";
import { MAINNET, pub, ROOT, TP } from "./lib.ts";

const from = BigInt((MAINNET ? process.env.MAINNET_DEPLOY_BLOCK : process.env.NEXT_PUBLIC_DEPLOY_BLOCK) ?? "0");
const t0 = Date.now();
const snap = await scanRegistry(pub, TP, from, undefined, undefined, { concurrency: 16 });
const chainId = await pub.getChainId();
writeFileSync(resolve(ROOT, "apps/web/src/data/registry-snapshot.json"), snapshotToJson(snap, { contract: TP, chainId }));
console.log(`snapshot ${snap.scannedFrom}-${snap.scannedTo}: ${snap.revealed.length} reveals, ${snap.touched.length} touches in ${Date.now() - t0} ms`);
