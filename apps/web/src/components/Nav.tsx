"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { WalletSlot } from "./WalletSlot";

const links = [
  { href: "/lookup", label: "Look up" },
  { href: "/studio", label: "Studio" },
  { href: "/ledger", label: "Ledger" },
  { href: "/investigate", label: "Investigate" },
  { href: "/proof", label: "Proof" },
];

function Logo() {
  return (
    <Link prefetch={false} href="/" className="flex items-center gap-2 px-2 mr-2" aria-label="Touchplate home">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="1" width="20" height="20" rx="5" fill="#121212" />
        <circle cx="11" cy="11" r="4.2" fill="none" stroke="#836EF9" strokeWidth="1.6" />
        <circle cx="11" cy="11" r="1.4" fill="#E3572B" />
      </svg>
      <span className="font-bold tracking-tight">Touchplate</span>
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = links.find((l) => path === l.href || path.startsWith(l.href + "/"))?.href;
  return (
    <>
      <nav className="fixed top-4 inset-x-0 mx-auto w-[min(1120px,calc(100%-32px))] z-50 rounded-[14px] border border-line bg-paper/70 backdrop-blur-xl px-2 py-2 flex items-center gap-1">
        <Logo />
        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link prefetch={false} key={l.href} href={l.href} className="relative px-3.5 py-2 rounded-[10px] mono text-[13px] text-ink-2">
              {active === l.href && (
                <motion.span
                  layoutId="nav-capsule"
                  className="absolute inset-0 rounded-[10px] bg-ink"
                  style={{ boxShadow: "var(--shadow-glow)" }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className={`relative ${active === l.href ? "text-paper" : ""}`}>{l.label}</span>
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <WalletSlot />
          <button
            className="md:hidden px-3 py-2 rounded-[10px] border border-line mono text-[13px]"
            aria-expanded={open}
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            Menu
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[70] bg-paper p-6 flex flex-col gap-2"
          >
            <button className="self-end px-3 py-2 rounded-[10px] border border-line mono text-[13px]" onClick={() => setOpen(false)}>
              Close
            </button>
            {links.map((l) => (
              <Link prefetch={false} key={l.href} href={l.href} onClick={() => setOpen(false)} className="display text-4xl py-3 border-b border-line">
                {l.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
