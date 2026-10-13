// Generates the SWAR popcount masks used by contracts/src/Hamming.sol.
const widths = [1, 2, 4, 8, 16, 32, 64, 128];
const full = (1n << 256n) - 1n;
const mask = (w: number): bigint => {
  const block = (1n << BigInt(w)) - 1n;
  let m = 0n;
  for (let i = 0; i < 256; i += w * 2) m |= block << BigInt(i);
  return m & full;
};
for (const w of widths) console.log(`uint256 private constant M${w} = 0x${mask(w).toString(16).padStart(64, "0")};`);
