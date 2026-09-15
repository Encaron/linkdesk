# README Description-Area Media Contract

> 2026-09-09 · Documented (the author contract was added after all four forms shipped). **Written for third-party plugin authors.**
> This document answers one question: **your README gets displayed by the plugin details page inside the LinkDesk app — if you want images / animated images / demo videos in it, how should you write them, and what are the rules?** Benchmarked against the open display canvas of VS Code's update page / extension READMEs.
> Nature = **interface contract** — it only defines "how an author writes it correctly + how it will be displayed"; it contains no implementation code (the implementation surface = the shell's shared MarkdownView + the marketplace DetailView). Authors don't need to know how the app renders — just get the points below right.

---

## 1. Where your README is displayed, and the two sources with two sets of rules

The `README.md` in the plugin root directory is displayed in the **"Details" tab of the plugin details page** (that tab = the screenshot gallery + this README area; the README area is what the project commonly calls the "description area"). The details page has three horizontal tabs — **Details / Features / Changelog** — and the README belongs in the "Details" cell. **But there are two routes to reading that same README, and their media display capabilities differ — this is the single easiest thing to get wrong:**

| State | Where the README comes from | Relative-path media (assets shipped in the package) | https absolute-URL media |
|:--|:--|:--:|:--:|
| **Installed state** (the user downloaded and installed it, or it shipped with the shell, and then views the details) | Reads **the copy you packaged into the zip** | ✅ Shown | ✅ Shown |
| **Marketplace preview state** (not installed; the list/details read the remote README of the catalog entry) | Reads the **remote readmeUrl** | ❌ Not shown (honestly hidden — at that moment there is no in-package copy of yours to resolve) | ✅ Shown |

> **What this means:** if you want the image/video to be guaranteed visible after the user has **installed** the plugin → use a **relative path pointing inside the package** (§3 below); if you want the image/video to be visible even to **visitors who haven't installed it yet** → use an **https absolute URL**. Shipping only relative-path media = visible only once installed.

---

## 2. Supported media forms (four of them — copy them as-is and they work)

| Form | How the author writes it (README markdown / inline HTML both work) | Description-area behavior |
|:--|:--|:--|
| **Static image** | `![Serial cover](resources/cover.svg)` or `<img src="resources/cover.svg" alt="Serial cover">` | Shown. png / svg / webp / jpg / gif all work. **Writing alt is recommended** (screen-reader friendly; use an empty string for a purely decorative image) |
| **Animated image** | Same one-line form, with a genuinely animated gif | Shown and **it really animates** (same pipeline as static images) |
| **Cover link-out video** (GitLens style) | `<a href="https://youtube.com/…"><img src="resources/cover.svg" alt="Click the cover to see the demo"></a>` | The description area shows a **clickable cover**; clicking opens the external page in the **system default browser** (the app never loads external pages in-app) |
| **In-page video** (VS Code update-page style) | `<video src="resources/demo.mp4" controls poster="resources/cover.svg"></video>`<br>or `<video controls><source src="resources/demo.mp4" type="video/mp4"></video>` | The description area **plays it in place**: native control bar, draggable progress bar, click to go fullscreen (one click fills the screen, one exit restores it). mp4 / webm / m4v |

> Any **https external text link** (`[See the demo](https://…)`) behaves the same way: clicking it goes to the system default browser. mailto: goes to the mail client. **The app never pops up an external web page.**

---

## 3. Where image / video files go and how to write src (source rules)

1. **Write "relative path + shipped in the package"**: put media files in the plugin root's **`resources/`** and write the relative path `resources/cover.svg` in the README. **The SDK build automatically packs these README-referenced assets into the zip** (zero declarations; see [04-distribution-format.md](04-distribution-format.md)) → guaranteed to show in the installed state.
   🔴 **Media always lives in `resources/`** — the same goes for icons (`plugin.json`'s `icon` / `marketIcon` also point at `resources/…`). **No loose images in the plugin root.**
2. **Remote URLs**: an absolute `https://…` address works directly (good when you also want it visible in marketplace preview).
3. **Things to avoid**: image sources using `http:` / `data:` / `javascript:` / `file:` **are never displayed** (the security allowlist rejects them); protocol-relative URLs starting with `//` are not displayed either; **don't reference anything outside the package** (`../` parent directories, absolute disk paths) — it neither ships with the package nor displays.

> ℹ️ **Technically, putting them in the plugin root also works** (the SDK only looks at what path the README writes, not at the directory). **Narrowing everything into `resources/` is a tidiness requirement, not a correctness requirement** — new plugins just need to match the official exemplars' `resources/` style.

---

## 4. Rendering contract — what can't be done, so don't count on it (hard security guarantees)

- **No scripts run.** The README is a pure display canvas: `<script>`, event attributes (`onclick`, etc.) and the `javascript:` protocol are **removed whole, branch and all**, by the sanitizing layer — it's not that you wrote it wrong, it simply can't get in by design. Don't think in terms of "stuff JS into the README so the details page executes it".
- **Video never autoplays.** Writing `autoplay` has no effect (opening the description area must never suddenly make sound). Load strategy = `preload: metadata` (no full pre-download; saves bandwidth).
- **Controls are forced on.** An in-page `<video>` gets `controls` added even if you didn't write it (otherwise the reader has no way to start playback).
- Links with a dangerous / unknown protocol are removed whole and never reach the DOM.

---

## 5. Packaging and release discipline (change the content and you must re-release, or users won't see it)

1. **Any content change must bump `plugin.json.version`** ([§4 of 04](04-distribution-format.md), a core discipline): an installed user's copy is **frozen per version** — the app only fills in what's missing and never refreshes what's installed. You added an image / swapped a video in the README but didn't bump → installed users see the old content forever. README touched = content change = must bump + rebuild the zip.
2. **The zip is a one-off build artifact; it does not regenerate itself.** The SDK build (or `pack` for theme-type plugins) automatically collects the README-referenced assets into the package — but after you **change the README / the media / or touch the SDK packaging config** (the externalization list, etc.), the old zip on disk won't turn itself into a new one; **you must rebuild + re-release**. Rule of thumb: you installed a new package and it's still wrong → most likely the zip itself is stale → rebuild.
3. **Bundled zips shipped with the shell are the same**: re-zipping always requires a bump; `npm run check`'s packaging gate will red-flag a "same-version content diff" — don't work around it.

---

## 6. Live exemplars (copy them and you can't go wrong)

- The READMEs of the 8 official plugins that already embed scene covers are ready-made models: `editor` / `file-tree` / `serial-monitor` / `settings` / `python` / `theme-terminal` / `theme-aurora-glass` / `lang-defaults` (plus the first real third-party plugin, `hello-linkdesk`). The `![…](resources/cover.svg)` at the top of their READMEs is the standard way to write a cover.
- In-page `<video>` / cover link-out examples: the serial-monitor README's git history commits `2f9a52c6b` (real in-page playback) and `8c9d71551` (fullscreen fix) each carry a complete `<video>` / `<a><img></a>` example from the manual testing of that moment, reverted once verified — look at those two commits if you want to copy a complete example.

---

## Related

- [04-distribution-format.md](04-distribution-format.md) — zip packaging, content-change bumps, the `linkdesk://` resource protocol
- [09-plugin-directory-layout.md](09-plugin-directory-layout.md) — where files go
- The paired marketplace icon fields `marketIcon` / cover → [06-plugin-json-spec](06-plugin-json-spec.md)
