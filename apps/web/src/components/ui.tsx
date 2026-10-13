"use client";
import { motion } from "framer-motion";
import { useRef, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function GlowCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent): void => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
  };
  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={`group relative rounded-2xl border border-line bg-paper-2/80 p-6 overflow-hidden transition-shadow hover:shadow-[var(--shadow-glow)] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "radial-gradient(320px circle at var(--x) var(--y), rgba(131,110,249,.18), transparent 60%)" }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-ember/40 bg-ember/5 p-4 text-sm flex items-start justify-between gap-4">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline rounded-lg px-3 py-1 mono text-[12px] shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}

export type RungKey = "proposed" | "voted" | "finalized" | "verified";
const RUNGS: { key: RungKey; label: string; color: string }[] = [
  { key: "proposed", label: "PROPOSED", color: "#8C867B" },
  { key: "voted", label: "VOTED", color: "rgba(131,110,249,.55)" },
  { key: "finalized", label: "FINALIZED", color: "#836EF9" },
  { key: "verified", label: "VERIFIED", color: "#121212" },
];

/** The four commit-state rungs. A rung lights only once reached; `abandoned` outlines in ember. */
export function Ladder({ reached, abandoned }: { reached: Partial<Record<RungKey, number>>; abandoned?: boolean }) {
  return (
    <ol className="flex items-center gap-2 flex-wrap" aria-label="Commit state ladder">
      {RUNGS.map((r, i) => {
        const at = reached[r.key];
        const on = at !== undefined;
        return (
          <li key={r.key} className="flex items-center gap-2">
            <span
              className="mono text-[11px] px-2.5 py-1.5 rounded-lg border"
              style={{
                borderColor: abandoned ? "#E3572B" : on ? r.color : "#E2DACB",
                color: on ? (r.key === "verified" ? "#F6F2E9" : "#121212") : "#8C867B",
                background: on ? (r.key === "verified" ? "#121212" : `${r.color}22`) : "transparent",
                boxShadow: on && r.key === "verified" ? "var(--shadow-glow)" : undefined,
              }}
            >
              {r.label}
            </span>
            {i < RUNGS.length - 1 && <span className="text-mute">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
