"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const Island = dynamic(() => import("./WalletIsland"), {
  ssr: false,
  loading: () => (
    <span className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px] opacity-70" role="status">
      Connect wallet
    </span>
  ),
});

const WALLET_PAGES = ["/studio", "/c/"];

/** Renders a plain button until the wallet is needed, then loads the wallet stack on demand. */
export function WalletSlot() {
  const path = usePathname();
  const [on, setOn] = useState(false);
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    if (WALLET_PAGES.some((p) => path.startsWith(p))) setOn(true);
    try {
      if (localStorage.getItem("wagmi.recentConnectorId")) setOn(true);
    } catch {
      /* storage unavailable */
    }
  }, [path]);

  if (!on) {
    return (
      <button
        onClick={() => {
          setClicked(true);
          setOn(true);
        }}
        className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]"
      >
        Connect wallet
      </button>
    );
  }
  return <Island openOnMount={clicked} />;
}
