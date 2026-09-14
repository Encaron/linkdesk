# Naming Conventions — Seven Names, One Identity

> 2026-09-14 · **Reader = plugin author.** After reading, you can answer four questions: **how do I choose an id? can it be changed? how do I change the display name? what should the repo be called?**
> The decision rationale (N1-N6) and the VS Code empirical evidence live in [plugin-source-externalization/09-naming-conventions.md](../02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md) — this document is the author-facing landing point, and of the two there is **only one place to maintain**: change the rule here first and point back; don't create a second copy.

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

> **← Index:** [00-readme](00-readme.md) · **Related:** [15-multi-repo-and-local-workspace](15-multi-repo-and-local-workspace.md) · [06-plugin-json-spec](06-plugin-json-spec.md) · [plugin-source-externalization/09-naming-conventions.md](../02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md) (decision rationale)
