/**
 * linkdesk-api update domain — the **read-only** surface of main-software updates (E6#57.8, 06-main-software-updates).
 * Split out of linkdesk-api.ts (E6#57.8) — the 15th namespace domain interface.
 * Dependency direction: update → src/core/types/ipc/update (cross-stack wire payload types, decision point 1); cross-composed by the aggregator.
 *
 * Exposure boundary (07-data-flow format §1/§6, decided 2026-09-11) — **read-only is the only mode; write commands are not on this surface**:
 * check / download / restart-and-install are **the shell's private affair**; third-party plugins must not trigger them
 * (restart-and-install closes software the user is actively using — not a decision a plugin may make on the user's behalf);
 * release notes fetching (`getReleaseNotes`) is likewise not opened up.
 *
 * 🔴 **Why the contract surface declares only `getState` — that is design, not an omission**: the landing point of the
 * "third parties are read-only" constraint is **types**, not documentation — the pool preload injects only this surface ⇒
 * plugin code has **no entry point to write commands at all** (`satisfies PoolExposed` is the compile-time gate).
 * The shell-side half (write commands) is **over-exposed** by preload-shell with a factory function, modeled after the
 * existing precedent of `buildShellApp()` exposing `getProductInfo`, and stays out of this contract.
 */
import type { UpdateState } from "../../types/ipc/update";

export interface UpdateAPI {
  /** The update namespace — read-only update state (for "About"-type plugins to read the host version/update state). */
  update: {
    /** Read the full state-machine state (07 §4.1: never throws — the service always has a state). */
    getState(): Promise<UpdateState>;
  };
}
