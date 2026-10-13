/**
 * Monad charges the declared gas limit (measured in spike S2), so every transaction carries a tight,
 * explicit limit taken from this profile. Values are measured `estimateGas` results on testnet plus a
 * small margin, refreshed by `scripts/gas-profile` after contract changes.
 */
export type TxKind =
  | "registerStudio"
  | "touch"
  | "reveal"
  | "recordPriority"
  | "proveMark"
  | "license"
  | "approve"
  | "faucet";

export const GAS_PROFILE: Record<TxKind, bigint> = {
  registerStudio: 260_000n,
  touch: 200_000n,
  reveal: 260_000n,
  recordPriority: 120_000n,
  proveMark: 60_000n,
  license: 150_000n,
  approve: 70_000n,
  faucet: 160_000n,
};

/** Margin on top of a measured estimate. */
export const GAS_MARGIN_BPS = 1_000n;

export function gasFor(kind: TxKind, measured?: bigint): bigint {
  if (measured !== undefined) return measured + (measured * GAS_MARGIN_BPS) / 10_000n;
  return GAS_PROFILE[kind];
}
