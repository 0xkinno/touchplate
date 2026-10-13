"use client";
import { useAppKit } from "@reown/appkit/react";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { Providers } from "./Providers";
import { WalletButton } from "./WalletButton";

function AutoOpen({ openOnMount }: { openOnMount: boolean }) {
  const { open } = useAppKit();
  const { isConnected } = useAccount();
  useEffect(() => {
    if (openOnMount && !isConnected) void open();
    // only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Wallet button with its own providers, loaded lazily so pages that do not transact stay light. */
export default function WalletIsland({ openOnMount }: { openOnMount: boolean }) {
  return (
    <Providers>
      <AutoOpen openOnMount={openOnMount} />
      <WalletButton />
    </Providers>
  );
}
