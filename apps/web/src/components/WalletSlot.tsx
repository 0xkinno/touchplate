"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";

type Island = ComponentType<{ openOnMount: boolean }>;

const WALLET_PAGES = ["/studio", "/c/"];

/**
 * Renders a plain button until the wallet is needed, then imports the wallet stack on demand
 * (no preload hint, so pages that never transact do not pay for it).
 */
export function WalletSlot() {
  const path = usePathname();
  const [Comp, setComp] = useState<Island | null>(null);
  const [openOnMount, setOpenOnMount] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = (open: boolean): void => {
    if (loading || Comp) return;
    setLoading(true);
    setOpenOnMount(open);
    void import("./WalletIsland").then((m) => setComp(() => m.default as Island));
  };

  useEffect(() => {
    let remembered = false;
    try {
      remembered = !!localStorage.getItem("wagmi.recentConnectorId");
    } catch {
      /* storage unavailable */
    }
    if (remembered || WALLET_PAGES.some((p) => path.startsWith(p))) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (Comp) return <Comp openOnMount={openOnMount} />;
  return (
    <button onClick={() => load(true)} disabled={loading} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]">
      Connect wallet
    </button>
  );
}
