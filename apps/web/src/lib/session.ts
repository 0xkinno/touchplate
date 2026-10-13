import type { KeyFamilies } from "@touchplate/core";

/**
 * In-memory key session. Material is zeroed on idle (10 min), when the tab is hidden for 2 min, or on
 * disconnect. Nothing here is persisted.
 */
let families: KeyFamilies | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const IDLE_MS = 10 * 60_000;
const HIDDEN_MS = 2 * 60_000;

function zero(): void {
  if (families) {
    families.evmPrivateKey.fill(0);
    families.studioSeed.fill(0);
    families.markRoot.fill(0);
  }
  families = null;
  listeners.forEach((l) => l());
}

export function endSession(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (hiddenTimer) clearTimeout(hiddenTimer);
  zero();
}

export function touchSession(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(zero, IDLE_MS);
}

export function startSession(f: KeyFamilies): void {
  endSession();
  families = f;
  touchSession();
  listeners.forEach((l) => l());
}

export function getSession(): KeyFamilies | null {
  if (families) touchSession();
  return families;
}

export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenTimer = setTimeout(zero, HIDDEN_MS);
    else if (hiddenTimer) clearTimeout(hiddenTimer);
  });
}
