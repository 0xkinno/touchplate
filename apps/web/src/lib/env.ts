import type { Address } from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "wss://testnet-rpc.monad.xyz";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://testnet.monadexplorer.com";
export const TOUCHPLATE = (process.env.NEXT_PUBLIC_TOUCHPLATE_ADDRESS ?? "") as Address;
export const AUSD = (process.env.NEXT_PUBLIC_AUSD_ADDRESS ?? "") as Address;
export const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "") as Address;
export const AUSD_FAUCET = (process.env.NEXT_PUBLIC_AUSD_FAUCET ?? "") as Address;
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");
export const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const txUrl = (h: string): string => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string): string => `${EXPLORER}/address/${a}`;
export const short = (s: string, n = 6): string => (s.length > 2 * n + 2 ? `${s.slice(0, n + 2)}…${s.slice(-n)}` : s);
