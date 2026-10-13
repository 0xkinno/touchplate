"use client";
import { useAppKit } from "@reown/appkit/react";
import { formatEther, formatUnits, parseAbi } from "viem";
import { useAccount, useBalance, useDisconnect, useReadContract } from "wagmi";
import { endSession } from "@/lib/session";
import { AUSD, CHAIN_ID, short } from "@/lib/env";

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

/** Opens the wallet connect modal; once connected shows address, MON, AUSD and a power icon that disconnects. */
export function WalletButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: mon } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: 8000 } });
  const { data: ausd } = useReadContract({
    address: AUSD, abi: erc20, functionName: "balanceOf", args: address ? [address] : undefined, chainId: CHAIN_ID,
    query: { enabled: !!address && !!AUSD, refetchInterval: 8000 },
  });

  if (!isConnected || !address) {
    return (
      <button onClick={() => open({ view: "Connect" })} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px]">
        Connect wallet
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => open({ view: "Account" })}
        className="rounded-[10px] border border-line px-3 py-2 mono text-[12px] flex items-center gap-2"
        aria-label="Open wallet details"
      >
        <span>{short(address, 4)}</span>
        <span className="hidden sm:inline text-mute">
          {mon ? Number(formatEther(mon.value)).toFixed(2) : "…"} MON
          {ausd !== undefined ? ` · ${Number(formatUnits(ausd, 6)).toFixed(2)} AUSD` : ""}
        </span>
      </button>
      <button
        onClick={() => {
          endSession();
          disconnect();
        }}
        className="rounded-[10px] border border-line p-2"
        aria-label="Disconnect wallet"
        title="Disconnect"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 3v9" />
          <path d="M6.4 6.6a8 8 0 1 0 11.2 0" />
        </svg>
      </button>
    </div>
  );
}
