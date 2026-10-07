/**
 * Cross-module shared window types—E5.8#45. core/types = cross-module shared types (shell directory convention: types only).
 *
 * WindowMode is referenced by both the shell policy layer (src/App/windows.ts WINDOW_MODE_STRATEGIES keys + WindowShellState.mode)
 * and the core callback contract (CoreCallbacks.findTabWindow)—core does not import App, so the type sinks here,
 * and App imports + re-exports it (consumers still import from `./windows`; zero changes).
 *
 * Semantics (#43/#45):
 *   main     main window—all zones; panels resident; closing the window = the app quits
 *   detached detached window—tabs follow the window; closing the window = the shell removes the window state (tabs close with the window; they do not return)
 *   drift    drift panel window (#45)—a panel-only window (always empty groups, empty main-area placeholder I9-13);
 *            closing the window = closing the panel (I9-13 decision A)
 */
export type WindowMode = "main" | "detached" | "drift";
