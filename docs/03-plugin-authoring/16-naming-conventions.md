# Naming Conventions — Seven Names, One Identity

> 2026-09-14 · **Reader = plugin author.** After reading, you can answer four questions: **how do I choose an id? can it be changed? how do I change the display name? what should the repo be called?**
> The decision rationale and the VS Code empirical evidence live in [plugin-source-externalization/09-naming-conventions.md](../02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md) — this document is the author-facing landing point, and of the two there is **only one place to maintain**: change the rule here first and point back; don't create a second copy.

---

## 1. Seven names in one table

| Name | Where the source of truth is | Who uses it | Can it change |
|:--|:--|:--|:--|
| **Plugin identity id** | `plugin.json` (declare `pluginId` explicitly; when undeclared, the **temporary** fallback = the project directory name — the fallback is not recommended; explicit declaration is the right way) | Install directory, uninstall records, update reconciliation, catalog deduplication | 🔴 **Immutable once published** |
| **Display name** `name` | `plugin.json` | UI, marketplace cards | ✅ Change freely (bump and republish when done) |
| **Version** | `plugin.json`'s `version` | Update comparison, Release tag, catalog | Must change on every release |
| **Distribution artifact name** | `<id>.linkdesk-plugin` (generated automatically by the SDK) | Zip install adjudication, Release assets | Follows the id; **must not be hand-edited** |
| **Release tag** | `v<version>` (tagged automatically by publish) | Update check | Follows the version; **must not be hand-tagged** |
| **GitHub repository name** | No rule | `downloadUrl` / `readmeUrl` / the details page's "Repository" | ✅ Free (rename cost in §4) |
| **Local directory name** | No rule | Only the build tooling | ✅ Free (⚠️ current red line in §5) |

**Conflating them is the single root cause of naming problems**: identity is the account machines reconcile against, the display name is what humans read, and the repo name and directory name are merely the project's address — the three are unrelated, and changing one should not drag the others along.

---

## 2. Four character-set/format constraints (enforced mechanically; a mistake is rejected on the spot)

| Constraint | Rule | Source |
|:--|:--|:--|
| Plugin id | `^[A-Za-z0-9][A-Za-z0-9._-]*$` (first character must be a letter or digit) | `@linkdesk/plugin-sdk`'s `SAFE_PLUGIN_ID` (validate) |
| Version | `^\d+\.\d+\.\d+$` — **no `-beta` pre-release suffix or the like** (the schema rejects it outright; there is currently no syntax for expressing a pre-release, and that's the status quo, not an oversight) | `plugin.schema.json` |
| View container ID | `^[a-z][a-z0-9-]*$` | schema / [03-contributes-spec](03-contributes-spec.md) |
| Distribution artifact base name | = plugin id | SDK `assetNameForId` |

**Ids are best lowercase-with-hyphens** (e.g. `file-tree`) — the rule allows uppercase and dots, but lowercase-with-hyphens is the least trouble, and every official plugin does it.

---

## 3. Three questions answered directly

- **How do I choose an id?** Character set per the table above; **immutable once published** — it = install directory name + uninstall record key + update reconciliation key, so swapping the id is swapping in a different plugin (old data appears lost, the update chain breaks silently). **Write `"pluginId"` explicitly in `plugin.json`**; don't rely on the directory-name fallback.
- **Can I change the id?** No. If you want a different name, change the display name.
- **How do I change the display name?** `plugin.json`'s `name` can be changed freely; when done, **bump the version and republish** (an installed user's copy is frozen per version, so others won't see the new name otherwise).
- **What should the repo be called?** Completely free; no prefix is enforced. Official plugins are recommended to uniformly use `linkdesk-plugin-<id>` (the convention text lives in [plugin-source-externalization/09-naming-conventions.md §5](../02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md), maintained only there once settled); third parties may do as they please.

---

## 4. The cost of renaming a repo

Published catalog entries have `owner/repo` embedded in `downloadUrl` / `readmeUrl` — **renaming breaks the download and README links of old versions** (the source is unaffected). Republishing one new entry heals it, but old version entries still point at the old links. **If you can avoid changing it, don't; if you must, do it early.**

---

## 5. The local directory name is unrelated to plugin identity

**Plugin id = the top-level `pluginId` field** (must be declared explicitly; immutable after publication), **not the directory name**. ⇒ The local project directory name can be **changed freely**; identity is unaffected.

Conversely, **changing `pluginId` is the dangerous act — it is equivalent to swapping in a different plugin**: two install directories coexist, uninstall records don't match, two catalog entries appear, the update chain breaks silently, plugin data appears lost — **all five consequences raise no error**. If you really want to change the id, that amounts to publishing a new plugin (see [15-multi-repo-and-local-workspace §5](15-multi-repo-and-local-workspace.md)).

---

## 6. The version number — four places, one source

The version number has **four landing points that must share one source**; changing one means changing all four:

```
① Version number in the CHANGELOG.md section heading   ## v<version>
② plugin.json.version           ← the only source of truth (required at the schema level)
③ The catalog entry's versions[].version    ← written automatically by publish
④ package.json.version          ← must equal ②
```

- The existing rules for ①②③ (section-heading parsing, honest blanks, reverse order) → [09-plugin-directory-layout §CHANGELOG.md format conventions](09-plugin-directory-layout.md).
- ④ is the fourth anchor: in an independent repo, `package.json` is **the first thing a newcomer (and an AI) sees when opening the repo** — with two version numbers coexisting and disagreeing, someone is bound to bump the wrong one; and both `publish` and the content-fingerprint gate read ② ⇒ **editing the wrong one = silently ineffective**.
- When to bump (MAJOR/MINOR/PATCH criteria) → `.claude/skills/version-bump/SKILL.md` — that is the sole authority; this document doesn't establish a second set.

---

## 7. Names the host reserves—don't take them, and don't count on "borrowing"

**The one-sentence rule (memorise this instead of the table): names the host reserves are off limits; every name you invent must carry your `<pluginId>` prefix.**

Both halves guard the same failure: a **public roster** — one global name table that **anyone can write into, where nobody checks ownership, and where a collision reports nothing**, so one side ends up **silently ineffective**. Per family, the damage looks like this:

- **Command ids**: one command declared by two parties — which one wins depends on registration order.
- **Config keys**: your value overwrites a host setting (the user reads that as "my settings changed on their own / got lost").
- **Appearance ids** (recipes / colorways / icon themes): the theme dropdown shows two entries with the same id and the selection state looks wrong.
- **Context keys**: someone else's `when` expression evaluates against your state (menus and shortcuts flicker in and out).

### 7.1 Where the list lives, and who owns it

The list is **generated**: the shell scans its own source and emits `scripts/host-reserved.json`, then ships a **byte-identical** copy inside `@linkdesk/plugin-sdk`. So **you already have it locally**:

```
node_modules/@linkdesk/plugin-sdk/schemas/host-reserved.json
```

The table below is **reconciled name by name** against it (gate `scripts/check-reserved-names-doc-sync.mjs`, wired into `npm run check`):

| Family | Reserved name | What happens if you take it |
|:--|:--|:--|
| Host command prefix | `app.`、`core.`、`theme.`、`update.`、`view.`、`workbench.` | Your command id lands in the host's own segment — in the command palette and the keybindings page it looks like a host feature |
| Host protocol id | `bracket` | Same name as the host's bracket-matching protocol handler ⇒ one of the two never runs, with no error |
| Host pseudo plugin id | `app`、`appearance`、`update` | The host registers as a "plugin" too (shell core / appearance / updater) ⇒ these ids read as the host itself |
| Host config key | `app.schemaVersion` | The config **internal version marker** (invisible in the settings UI, never registered) — taking it derails migration bookkeeping and the user's data looks lost |
| Host config key | `app.theme`、`app.themeColor`、`app.themeColorMode`、`app.iconTheme` | Theme and colours — taking it overwrites the theme the user is currently using |
| Host config key | `app.appearanceMode`、`app.accentColor`、`app.accentMode`、`app.accentSource`、`app.menuStyle` | Light/dark mode, accent colour, menu style |
| Host config key | `app.backgroundImage`、`app.backgroundMask`、`app.backgroundOpacity`、`app.zoneBackgroundImage` | Background and per-zone backgrounds |
| Host config key | `app.glassBlur`、`app.glassOpacity`、`app.glassSaturate`、`app.glassTint` | The four glass parameters |
| Host config key | `app.surfaceRadius`、`app.zoneRadius`、`app.zoneRadiusScale` | Corner radii |
| Host config key | `app.fontFamily`、`app.fontFamilyMono`、`app.fontTone`、`app.uiFontScale` | Fonts and text scaling |
| Host config key | `app.mixMode`、`app.mixFont`、`app.mixBackground`、`app.mixReset` | Mix-and-match sources |
| Host config key | `app.language` | UI language |
| Host config key | `app.osIntegration.dirMenu`、`app.osIntegration.fileAssoc`、`app.osIntegration.fileMenu` | OS integration (context menu, file associations) |
| Host config key | `app.update.mode`、`app.update.showReleaseNotes` | Update channel |
| Host recipe id | `dark`、`light` | The **fallback values** of `app.theme`. ⚠️ `light` also carries a **grant**: the official `theme-defaults` plugin is the official implementer of the host's light fallback, so only it may declare that id |
| Host colorway id | `dark-fallback`、`light` | Fallback values of `app.themeColor` and of the colorway source space |
| Host icon theme id | `default` | The fallback value of `app.iconTheme` |
| Host appearance sentinel | `followTheme` | The "follow the theme" sentinel of a mix source — **it is not an id**, so don't try to shadow it with a plugin id |
| Host-only context key (plugins **must not** set) | `activeEditor`、`editorCount`、`editorHasSelection`、`inputFocus`、`sidebarPosition`、`updateActionable`、`updateButtonLabel` | Set one of these at runtime over IPC and the host logs a `console.error` **naming you** (the value is still written: these are state, not registrations, so the runtime cannot tell who came first) |
| Shared-contract context key (plugins **may** set) | `settingKey`、`settingFollowTheme`、`settingModified`、`settingResetsToDefault` | These four are a **public contract**: the official `settings` plugin writes them, host commands read them in `when` clauses — use them as specified, don't change their meaning |

**How to check yourself** (from your own repo): once `@linkdesk/plugin-sdk` is installed, your repo's `verify` runs four ownership legs (command ids / config keys / appearance ids / context keys); whichever one you violate is reported with its location plus the suggested fix, **"should start with `<pluginId>.`"**.

### 7.2 Why three kinds of global concept names need no prefix

Three kinds of names look ownerless but **should never have an owner** — prefixing them is a **semantic error**, not normalisation:

| Name | Examples | Why a prefix would be wrong |
|:--|:--|:--|
| **File-association extensions** | `.md`, `.json`, `.ts` | They refer to a **filesystem/OS** concept — a prefix means the system no longer recognises the file type |
| **Language-definition extensions** | `langDefs[].extensions` | Same: the field has to line up with external tools and editors for the same language |
| **Language-pack language codes** | `zh` / `en` / `ja` (`langDefs[].id`, the keys of `contributes.i18n`) | They are **BCP 47 language tags** — the world writes them exactly like this; `my-plugin.zh` is not a language |

⇒ By design these are **permanently out of scope** for the criteria (neither flagged nor registered): not an oversight, but a deliberate carve-out.

### 7.3 i18n dictionary keys—**recommended** to carry ownership, not required

Translation files are **one flat key layer**: every plugin's keys and the host's keys live in the same dictionary. We **recommend** writing your keys as `<pluginId>.<原文>` (e.g. `serial-monitor.打开端口`), but this is a **recommendation, not a rule** — the reasoning and today's real overlap numbers live in [03-contributes-spec §3.9 桶键命名建议](03-contributes-spec.md) (**that is the single source**; this document doesn't repeat it).

### 7.4 Migration notes—renamed names never lose your values

Renames on the host side **all come with migrations**, so users don't reconfigure anything and you don't have to compensate for them:

- **Appearance ids** (recipes / colorways / icon themes): today they all have the `<pluginId>.<stem>` shape (e.g. `theme-aurora-glass.aurora-glass`). Older values in the user's `settings.json` are carried over by the **shell-side migration v12** (five keys: `app.theme` / `app.themeColor` / `app.mixFont` / `app.mixBackground` / `app.iconTheme`).
- **Command ids / config keys / user keybindings**: the rename rounds carry migrations too (keys move, keybinding ids move with them).
- ⚠️ **A migration can only carry a value once the new name exists**: for appearance ids, the plugin must **register the new name first** before the shell can tell where the old name should map. That is exactly why updating the app before the plugins leaves a window — hence the shell runs an extra **reconciliation pass on every startup** (it writes no version marker, so unlike ordinary migrations it doesn't stop after the first run).

Your only takeaway as a plugin author: **don't invent compatibility aliases for old host names** — old-name mapping is the shell's job. Just declare names in the **new shape**.

### 7.5 Host names do get retired—you are never forced to upgrade

The host also **retires its own names**: a **rename** (the name changed), a **changed meaning** (same name, different
meaning) and a **changed value domain** (same name and meaning, different accepted values) all count as retirement-level
actions. Only three things matter to you:

1. **You are never auto-uninstalled, and never refused**: retirement is the host's own business—the shell does not
   uninstall or refuse to load you because you reference a retired name, and it is never used to gate `minAppVersion`.
   Your plugin keeps running, on the semantics of the **new** name.
2. **If you reference a retired name, you get a hint in your own repo** (`@linkdesk/plugin-sdk` **0.1.40** onward,
   usage in 7.6): `linkdesk-plugin-sdk lint` and your repo's CI scan your sources and `plugin.json` for references
   to retired names and report each one with since-when and what replaced it (`file:line`). 🔴 It is **only a
   hint**—it never enters any failing leg and will never block your build or release (retired ≠ deleted; the host
   does not refuse to load you over it).
3. **Two steps to fix**: ① bump your `@linkdesk/plugin-sdk` dependency; ② ship a new release (`npm run publish`).
   ⛔ Don't shim the old name yourself—retired names **do not free up their slot**: taking one over only overwrites the
   host's **historical data** (see the config-key rows in 7.1).

Retired names are **on the record**: the host ledger (`retired[]` in `scripts/host-reserved.json`) plus the
**byte-identical** copy inside the SDK package, each entry stating since when, why, what replaced it and where a live
reference still remains. That ledger is **co-read** by host maintainers and authors, and 🔴 **it is not a blacklist**—it
only states facts, and no gate will ever use it to block you.

> 🔧 **Maintainer note (authors can skip)**: the ledger's source of truth and shape live in
> `scripts/lib/retired-ledger.mjs` (7 fields + the kind vocabulary + `approvedBy` which must be a date signed by the
> **user**); its internal consistency is guarded by `scripts/check-retired-ledger.mjs` (wired into `npm run check`), and
> the single outlet for "surface taken away but registered ⇒ pass" is `scripts/check-api-surface-additive.mjs`.

### 7.6 Run the "dangling name" self-check in your own repo (`@linkdesk/plugin-sdk` 0.1.40 onward)

Your repo's CI (the strict lint leg of `ci-verify`) and `linkdesk-plugin-sdk lint` ship with a **dangling name**
check: it takes every `ldk-*` name your sources shout plus every keyframe name your CSS references via `animation:`,
and matches them against **two definition sets**—① the definitions in your own CSS; ② the host definition set
shipped with the package (`schemas/host-css-names.json` inside the SDK). A name in neither set is reported as
dangling (name + `file:line`), because that style **silently disappears after publishing** (zero errors—this is the
mechanical reminder for "the host renamed it and you didn't follow"; the thing §12.4 describes now has someone
watching it for you).

- **How to fix a red (two steps)**: ① switch to a name that really exists in the host, or define it in your repo
  (your own class names start with `<pluginId>-`; `ldk-*` belongs to the host); ② re-pack and ship.
- **No false alarms**: dynamically composed names (`` className={`x-${v}`} ``) are **skipped and counted**, never
  judged; third-party built-ins (Monaco / codicon—the name and its rules live in their own bundled styles) and DOM
  hook names are **not judged**; test and mock files are not scanned.
- **Informed bypass**: `// eslint-disable-next-line linkdesk/no-reserved-class-name -- reason` (same id as the
  namespace leg).
- **Host definition set unreadable** ⇒ the leg reports "**unverified**" instead of "0 issues"—that means a broken
  install; reinstall `@linkdesk/plugin-sdk`.

---

> **← Index:** [00-readme](00-readme.md) · **Related:** [15-multi-repo-and-local-workspace](15-multi-repo-and-local-workspace.md) · [06-plugin-json-spec](06-plugin-json-spec.md) · [plugin-source-externalization/09-naming-conventions.md](../02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md) (decision rationale)
