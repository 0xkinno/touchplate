import type { Address } from "viem";

const clean = (v: string | undefined, fallback = ""): string => (v ?? fallback).trim();

export const CHAIN_ID = Number(clean(process.env.NEXT_PUBLIC_CHAIN_ID, "10143"));
export const RPC_URL = clean(process.env.NEXT_PUBLIC_RPC_URL, "https://rpc.monad.xyz");
export const WS_URL = clean(process.env.NEXT_PUBLIC_WS_URL, "wss://rpc.monad.xyz");
export const EXPLORER = clean(process.env.NEXT_PUBLIC_EXPLORER, "https://monadscan.com");
export const TOUCHPLATE = clean(process.env.NEXT_PUBLIC_TOUCHPLATE_ADDRESS) as Address;
export const AUSD = clean(process.env.NEXT_PUBLIC_AUSD_ADDRESS) as Address;
export const USDC = clean(process.env.NEXT_PUBLIC_USDC_ADDRESS) as Address;
export const AUSD_FAUCET = clean(process.env.NEXT_PUBLIC_AUSD_FAUCET) as Address;
export const DEPLOY_BLOCK = BigInt(clean(process.env.NEXT_PUBLIC_DEPLOY_BLOCK, "0"));
export const REOWN_PROJECT_ID = clean(process.env.NEXT_PUBLIC_REOWN_PROJECT_ID);

export const txUrl = (h: string): string => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string): string => `${EXPLORER}/address/${a}`;
export const short = (s: string, n = 6): string => (s.length > 2 * n + 2 ? `${s.slice(0, n + 2)}…${s.slice(-n)}` : s);
