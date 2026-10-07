/**
 * Product identity wire contract—the return body of `app:getProductInfo` (data-flow dossier 07 in the Chinese docs tree, §4.1).
 *
 * ## Why the types live here and not in `electron/product.ts`
 *
 * Same rationale as `src/core/types/ipc/update.ts` (that file's header comment says the same thing):
 * **cross-stack protocol types are consolidated into this directory, and `electron/` and `src/` both import the same copy**—renaming a field makes tsc fail on both ends,
 * instead of each side writing its own copy.
 *
 * 🔴 This file was **moved over from `electron/product.ts`** (when E6#57.13 landed): those three interfaces were originally
 * declared only in the main process, while the renderer-side `window.linkdesk.app.getProductInfo` is a **shell-private extension**
 * (not in the contract; see the `ShellExposed.app` section of `src/core/api/linkdesk-api/surfaces.ts`)—
 * the shell side needs types to consume it, and "copying one more copy into `src/`" would mean **two sources of truth for the same shape**;
 * changing one and missing the other was only a matter of time. Another reason for the move: the About tab in `#57.14` needs the same data,
 * so it would not have to be moved a second time.
 *
 * ⚠️ The values do not move: `loadProduct()` / `productInfo()` stay in `electron/product.ts` (reads `product.json` +
 * enriches from `process.versions`)—this file has **zero logic, only shape**.
 */

/** Identity fields of `electron/product.json` (02 §2.2: the single source of truth for identity, packed into the asar) */
export interface Product {
  nameLong: string;
  nameShort: string;
  /** SemVer. ⚠️ At runtime always taken from `app.getVersion()` (02 §2.3 single source of truth for the version), not the copy read from product.json */
  version: string;
  /** git HEAD short hash (written by the release script); empty in dev → `'—'` */
  commit: string;
  /** ISO 8601 (written by the release script); empty in dev → `'—'` */
  date: string;
  quality: "stable" | "preview";
  /**
   * Update source URL (the `/latest` endpoint hit by the check leg).
   * ⚠️ Also the **single base URL for the release notes "all versions" link**—the shell-side `useReleaseNotes.listPageUrl()`
   * derives the `github.com/O/R/releases` page endpoint from this value instead of hardcoding the repo address (the repo was renamed once:
   * `serial-v3` → `linkdesk`). Changing the repo = changing one place in `product.json`.
   */
  updateUrl: string;
  /**
   * Author identity (04 "About LinkDesk tab redesign" decision ②, 2026-09-26: the single source of truth for identity = product.json).
   * ⚠️ **Optional**: product.json in the old shape lacks this block ⇒ `undefined` ⇒ the About page **skips the author card entirely**
   * ("no author info" and "failed to read" are two different things; only the latter draws `—`). The GitHub account is **not in this block**—
   * it is derived from the owner segment of `updateUrl` (not hardcoded, same as the footer repo link).
   */
  author?: ProductAuthor;
}

/** Identity data for the About-page author card / footer copyright line (About-tab design doc 04, §4.1 ③c④; hand-written constants, not overwritten by the release script, same as `nameLong`) */
export interface ProductAuthor {
  /** Chinese name (value, not translated) */
  nameZh: string;
  /** English name (value, not translated) */
  nameEn: string;
  /** Primary email (work matters; `mailto:` link) */
  emailPrimary: string;
  /** Secondary email (personal matters; `mailto:` link) */
  emailSecondary: string;
  /** Copyright holder attribution (a Chinese name plus GitHub handle in parentheses, e.g. `…(Encaron)`—consistent across LICENSE, the About page, and the footer) */
  copyrightHolder: string;
}

/** Runtime enrichment (`process.versions` + `os`, not persisted) */
export interface ProductRuntime {
  electron: string;
  chromium: string;
  node: string;
  v8: string;
  /** `${platform} ${release}` (02 §2.2) */
  os: string;
}

/** Full return body of `app:getProductInfo` (the sole source of the About tab's 8 fields, data-flow dossier 07 §3) */
export interface ProductInfo {
  product: Product;
  runtime: ProductRuntime;
}
