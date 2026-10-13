const ADDR = /0x[0-9a-fA-F]{40}\b/g;
const HASH = /0x[0-9a-fA-F]{64}\b/g;
const BLOCK = /\bblock\s+#?([0-9][0-9,]{5,})/gi;

/** Every address, hash and block number in the narrative must appear in tool output (invariant I8). */
export function narrativeIsGrounded(narrative: string, toolOutputs: string): boolean {
  const hay = toolOutputs.toLowerCase();
  for (const m of narrative.match(ADDR) ?? []) if (!hay.includes(m.toLowerCase())) return false;
  for (const m of narrative.match(HASH) ?? []) if (!hay.includes(m.toLowerCase())) return false;
  for (const m of narrative.matchAll(BLOCK)) if (!hay.includes(m[1].replace(/,/g, ""))) return false;
  return true;
}
