"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import snapshot from "@/data/registry-snapshot.json";
import { GlowCard } from "./ui";

const SAMPLE_BLOCK = Number(
  (snapshot as { snapshot: { revealed: { blockNumber: { $big: string } }[] } }).snapshot.revealed[0].blockNumber.$big,
).toLocaleString("en-US");

const COLS = 6;
const ROWS = 4;
const LABELS = ["PROPOSED", "VOTED", "FINALIZED", "VERIFIED"];
const RING = ["#8C867B", "rgba(131,110,249,.55)", "#836EF9", "#121212"];

/** Hand-built plate: a 6 x 4 grid of struck marks; one is struck every few seconds and walks the four rungs. */
export function TouchplateArt() {
  const [struck, setStruck] = useState<number | null>(null);
  const [rung, setRung] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStruck(8);
      setRung(3);
      return;
    }
    let alive = true;
    const run = async (): Promise<void> => {
      let i = 3;
      while (alive) {
        setStruck(i % (COLS * ROWS));
        for (let r = 0; r < 4 && alive; r++) {
          setRung(r);
          await new Promise((res) => setTimeout(res, 900));
        }
        await new Promise((res) => setTimeout(res, 1200));
        i += 7;
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="relative w-full" style={{ perspective: "1200px" }} data-no-overlap="art">
      <div style={{ transform: "rotateX(14deg) rotateY(-18deg)", transformStyle: "preserve-3d" }}>
        <svg viewBox="0 0 600 420" className="w-full h-auto drop-shadow-xl" role="img" aria-label="A pewter plate of struck maker marks">
          <defs>
            <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d9d5cc" />
              <stop offset="0.5" stopColor="#bdb8ad" />
              <stop offset="1" stopColor="#9f9a90" />
            </linearGradient>
            <filter id="inner"><feGaussianBlur stdDeviation="1.2" /></filter>
          </defs>
          <rect x="10" y="10" width="580" height="400" rx="18" fill="url(#plate)" stroke="#8a857b" />
          {Array.from({ length: COLS * ROWS }, (_, n) => {
            const cx = 70 + (n % COLS) * 92;
            const cy = 70 + Math.floor(n / COLS) * 92;
            const on = struck === n;
            return (
              <g key={n}>
                <circle cx={cx} cy={cy} r="30" fill="#aaa59a" stroke="#85807a" />
                <circle cx={cx} cy={cy} r="22" fill="none" stroke="#7d786f" strokeWidth="1.5" filter="url(#inner)" />
                <path d={`M${cx - 9} ${cy + 8} L${cx} ${cy - 10} L${cx + 9} ${cy + 8} M${cx - 5} ${cy + 2} H${cx + 5}`} stroke="#6b665e" strokeWidth="2" fill="none" strokeLinecap="round" />
                {on && (
                  <>
                    <motion.circle
                      key={`flash-${struck}`}
                      cx={cx} cy={cy} r="30" fill="#E3572B"
                      initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }}
                    />
                    <circle cx={cx} cy={cy} r="36" fill="none" stroke={RING[rung]} strokeWidth={rung === 3 ? 4 : 3} />
                    {rung === 3 && <circle cx={cx} cy={cy} r="42" fill="none" stroke="#836EF9" strokeOpacity=".35" strokeWidth="6" />}
                    <text x={cx} y={cy + 56} textAnchor="middle" fontSize="10" fill="#121212" style={{ fontFamily: "var(--font-tp-mono)" }}>
                      {LABELS[rung]}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="hidden lg:block absolute -left-8 -top-6 w-[17rem] -rotate-3" data-no-overlap="art-card-original">
        <GlowCard className="!p-3 text-[12px] mono whitespace-nowrap">Original · Ada O. · block {SAMPLE_BLOCK}</GlowCard>
      </div>
      <div className="hidden lg:block absolute -right-4 -bottom-10 w-[15rem] rotate-2" data-no-overlap="art-card-repost">
        <GlowCard className="!p-3 text-[12px] mono whitespace-nowrap">Repost · distance 9 · stripped</GlowCard>
      </div>
      <div className="hidden lg:block absolute left-2 -bottom-10 w-[13rem] -rotate-1" data-no-overlap="art-card-licensed">
        <GlowCard className="!p-3 text-[12px] mono whitespace-nowrap">Licensed · 12 AUSD</GlowCard>
      </div>
    </div>
  );
}
