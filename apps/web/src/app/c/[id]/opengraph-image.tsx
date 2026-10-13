import { ImageResponse } from "next/og";
import { getRegistry, isHex32 } from "@/lib/registry";

export const alt = "Touchplate entry";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let line = "Sealed on Monad";
  let sub = "Proof of who made it first";
  if (isHex32(id)) {
    const c = await getRegistry().catch(() => null);
    const r = c?.snap.revealed.find((x) => x.commitment.toLowerCase() === id.toLowerCase());
    if (r) {
      line = `Sealed by ${r.author.slice(0, 8)}…${r.author.slice(-6)}`;
      sub = `Priority block ${String(r.touchBlock)} · ${r.pdq.slice(0, 18)}…`;
    }
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#F6F2E9", color: "#121212" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 700 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#121212", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 20, height: 20, borderRadius: 20, border: "4px solid #836EF9" }} />
          </div>
          Touchplate
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>{line}</div>
          <div style={{ fontSize: 32, color: "#5A46E0" }}>{sub}</div>
        </div>
        <div style={{ fontSize: 24, color: "#8C867B" }}>Pixels decide the match. Monad&apos;s finalized order decides the priority.</div>
      </div>
    ),
    size,
  );
}
