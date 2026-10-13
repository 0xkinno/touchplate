"use client";
import { gasFor, touchplateAbi, type TxKind } from "@touchplate/core";
import { encodeFunctionData, type Abi, type Address, type Hash, type TransactionReceipt } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { CHAIN_ID, TOUCHPLATE } from "./env";

export interface TxRequest {
  kind: TxKind;
  functionName: string;
  args: readonly unknown[];
  address?: Address;
  abi?: Abi;
}

export interface TxResult {
  hash: Hash;
  receipt: TransactionReceipt;
  gasLimit: bigint;
}

/**
 * Every on-chain action goes through here: the connected wallet is asked to confirm a real transaction with a
 * tight explicit gas limit (Monad charges the limit). Nothing is simulated or sent by the server.
 */
export function useTx() {
  const { address, chainId } = useAccount();
  const pub = usePublicClient({ chainId: CHAIN_ID });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  return async (req: TxRequest, onSubmitted?: (hash: Hash) => void): Promise<TxResult> => {
    if (!address) throw new Error("Connect a wallet first.");
    if (!pub) throw new Error("The network is not reachable.");
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID });
    const abi = (req.abi ?? touchplateAbi) as Abi;
    const to = req.address ?? TOUCHPLATE;
    const data = encodeFunctionData({ abi, functionName: req.functionName, args: req.args } as never);
    const estimate = await pub.estimateGas({ account: address, to, data });
    const gasLimit = gasFor(req.kind, estimate);
    const hash = await writeContractAsync({
      address: to, abi, functionName: req.functionName, args: req.args, chainId: CHAIN_ID, gas: gasLimit,
    } as never);
    onSubmitted?.(hash);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction was reverted on chain.");
    return { hash, receipt, gasLimit };
  };
}

/** Maps wallet and contract failures to a sentence a person can act on. */
export function humanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied|rejected the request/i.test(m)) return "You declined the request in your wallet.";
  if (/insufficient funds/i.test(m)) return "Not enough MON for gas. Get testnet MON from faucet.monad.xyz.";
  if (/BadAssertion/.test(m)) return "The passkey assertion did not verify on chain. Try again with the same passkey.";
  if (/RevealTooEarly/.test(m)) return "Wait for the touch block to be Finalized before revealing.";
  if (/IsDerivative/.test(m)) return "This entry is recorded as a derivative of an earlier one and cannot be licensed.";
  if (/NotStudio/.test(m)) return "Register your studio first.";
  return m.length > 220 ? `${m.slice(0, 217)}...` : m;
}
