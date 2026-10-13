"use client";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { CHAIN_ID, EXPLORER, REOWN_PROJECT_ID, RPC_URL } from "./env";

export const monadNetwork = defineChain({
  id: CHAIN_ID,
  caipNetworkId: `eip155:${CHAIN_ID}`,
  chainNamespace: "eip155",
  name: CHAIN_ID === 143 ? "Monad" : "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Monad Explorer", url: EXPLORER } },
  testnet: CHAIN_ID !== 143,
});

export const wagmiAdapter = new WagmiAdapter({
  projectId: REOWN_PROJECT_ID,
  networks: [monadNetwork],
  ssr: true,
});

createAppKit({
  adapters: [wagmiAdapter],
  projectId: REOWN_PROJECT_ID,
  networks: [monadNetwork],
  defaultNetwork: monadNetwork,
  metadata: {
    name: "Touchplate",
    description: "Proof of who made it first, even after the internet strips the credit.",
    url: typeof window !== "undefined" ? window.location.origin : "https://touchplate.app",
    icons: [],
  },
  themeMode: "light",
  themeVariables: { "--w3m-accent": "#836EF9", "--w3m-border-radius-master": "2px" },
  features: { analytics: false, email: false, socials: false },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
