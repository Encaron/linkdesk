# @linkdesk/contracts

The LinkDesk plugin contract types — the complete type definitions for `window.linkdesk.*`.

> This package is generated automatically by the LinkDesk shell's **contract generator** (`scripts/generate-contract.mjs`) from `src/core/api/linkdesk-api.ts`, and is the **single** source of truth for types. Third-party plugin authors use it to get API types that are perfectly in sync with the shell — drift means a compile error.

## Installation

```bash
npm install -D @linkdesk/contracts
```

## Usage

The package contains types only (`linkdesk.d.ts`, with the `types` entry pointing straight at it) and has zero runtime. Once installed:

```ts
import type { LinkDeskAPI } from "@linkdesk/contracts";

// window.linkdesk is typed automatically (the built-in global Window interface is declared); no extra global.d.ts needed
window.linkdesk.configuration.get("editor.fontSize"); // IntelliSense + type checking
```

- **Types only**: no `getLinkDesk`/`linkdesk` value exports — at runtime you go through `window.linkdesk` (injected by the preload).
- **Self-contained**: no `@src/core` dependency whatsoever; drop a single d.ts into your project for the complete types.
- **Independent version axis (decoupled on 2026-09-06)**: the package version no longer follows the shell — a shell upgrade is not a contract upgrade (app upgrades are a user-facing axis and unrelated to this package). A new version is published only when the `window.linkdesk.*` API surface changes and authors need the new types. **The content is still byte-for-byte in sync with the shell source** (compared by the generator; drift turns `contracts:check` red) — the types always describe the current shell, only the version number is not tied to it. Run `npm update @linkdesk/contracts` after a version bump to pick up the new types.

## Two tracks alongside the repository artifact

- **Recommended**: `npm i -D @linkdesk/contracts` (the real publication chain; types follow the version)
- **Alternative**: copy `contracts/linkdesk.d.ts` from the LinkDesk repository (a fallback when there is no npm environment)

## License

MIT
