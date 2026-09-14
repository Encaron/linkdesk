# Multi-Repo Development and the Local Workspace

> 2026-09-14 · **Answers three questions: where should my plugin project live? What should the repo be called? How do I change the display name?**
> Every item comes with its "why" — this document's readers include future AIs, and if it only says "how", they will rewrite it in the next session according to their own understanding. The authoritative text for naming rules (character sets and mutability of the id / version / distribution artifact name) → [16-naming-conventions](16-naming-conventions.md); this document does not duplicate it.

---

## 1. Local directory convention — collect projects into a container, grouped by ownership

**Recommended layout**: collect all plugin projects into **one container directory** (suggested: `E:\linkdesk-plugins\`), split internally into two folders by **ownership**:

```
E:\linkdesk-plugins\
├─ official\          ← your own plugins (the 18 official ones + later new plugins)
│   ├─ file-tree\
│   └─ settings\
└─ third-party\       ← other people's plugins (cloned to study / fork)
```

**Why by ownership and not by function**: ownership is stable (a plugin never goes from official to third-party), whereas functional categories get redrawn again and again as plugins are added; and the marketplace catalog's `category` is already doing functional classification, so classifying a second time locally is duplicated work.

**Why collect them into a container**: without it they sprawl flat (`E:\linkdesk-build+scratch\` currently holds two of them), you can't find them, backups miss them, and an inbound AI doesn't know where to look.

---

## 2. 🔴 The container directory itself must never be a repo

`E:\linkdesk-plugins\` should **never be `git init`-ed**. This isn't fastidiousness — once the container is made into a repository, three bad things happen automatically:

1. **Each plugin's `.git` becomes a nested repo**, and the parent repo records them as gitlinks — **it breaks silently and is extremely hard to spot** (whoever clones the container gets empty directories).
2. **The scaffold's rule is inverted into a disaster**: `create-linkdesk-plugin` checks "already inside a git repo → don't init", so once the container is a repo, **no new plugin creates its own repo** — they all become subdirectories of the container, producing exactly the monorepo you wanted to avoid.
3. The triggers are impossible to defend against completely: the IDE's "initialize repository" prompt, running `git init` at the wrong level, or `git add .` from a parent directory can all trip it.

**Guardrail**: put a note in the container (`README.md` or `DO-NOT-INIT-A-REPO-HERE.txt`) — it's not only for the author himself, but also for AIs that come in later and read the directory.

---

## 3. Repository names are completely free (D5/N2)

**Repository names are not forced to carry any prefix; third parties have zero constraints.** This has been settled by the maintainer: naming your own plugin (repo) is a legitimate right of the author and can't be dictated.

- **A recommended but non-mandatory convention**: official plugin repos uniformly use `linkdesk-plugin-<id>` (N3 pending the user's sign-off; once signed off, the text lives in [plugin-source-externalization/09-naming-conventions.md §5](https://github.com/Encaron/linkdesk/blob/electron/docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md) — maintained in that one place only); third parties may do as they please.
- **The cost of renaming a repo**: published catalog entries have `owner/repo` embedded in `downloadUrl` / `readmeUrl`, so **renaming breaks the download and README links of already-published plugins** (the source itself is unaffected). Republishing one new entry after the rename heals it, but old version entries still point at the old links — **if you can avoid changing it, don't; if you must, do it early.**

---

## 4. Identity vs. display name vs. repository name (D5)

Three "names" that have nothing to do with one another; conflating them is the root of every naming problem:

| | What it is | Can it change |
|:--|:--|:--|
| **Plugin identity** (`plugin.json`'s id) | Install directory name, uninstall tombstone, the **unique key** for update reconciliation | 🔴 **Immutable once published** |
| **Display name** (`plugin.json`'s `name`) | What people see in the UI and on marketplace cards | ✅ **Change freely** (bump and republish when done) |
| **Repository name** | The project repo on GitHub | ✅ Free (costs as per the previous section) |

Benchmarked against the empirically verified VS Code position (`ms-vscode.cpptools`: identity = `publisher.name`, immutable; `displayName` = freely changeable; repository name unrelated to identity) → full measurement and reasoning → [plugin-source-externalization/09-naming-conventions.md](https://github.com/Encaron/linkdesk/blob/electron/docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md); the author-facing rule text → [16-naming-conventions](16-naming-conventions.md).

---

## 5. The local directory location is unrelated to plugin identity (the single most important item in this document)

**Where you clone a plugin project and what the directory is called have no effect on plugin identity** — a plugin repo is self-contained, and the shell only recognizes the Release URL and the catalog; it **does not recognize local paths at all**. ⇒ The local directory structure can be rearranged at any time, with zero risk.

Live evidence: the source repos of the two plugins `hello-linkdesk` and `first-run-setup` sit flat outside the container and still build, publish, get listed, and install/uninstall normally in the installed app. All 18 official plugins are the same way today (each in its own independent repo).

✅ **So "renaming a directory" is already safe today**: plugin identity = the top-level `pluginId` field (which must be declared explicitly and cannot be changed after publication), **and it has nothing to do with the directory name**.

> ⚠️ **Don't read that backwards**: the dangerous act is **changing `pluginId`** (= swapping in a different plugin; users who had it installed see no updates and their data appears lost, and most of the consequences raise no error), not renaming the directory. See [16-naming-conventions](16-naming-conventions.md).

---

## 6. Four names on the release path must not be hand-edited

They participate in install adjudication and update reconciliation; **hand-editing them means identity drift or a broken update chain**:

| Name | Why hand-editing is forbidden |
|:--|:--|
| `<id>.linkdesk-plugin` (distribution artifact name) | Zip install adjudication looks the plugin id back up from the base name |
| `v<version>` (Release tag) | The update check finds the version by tag |
| The version format `^\d+\.\d+\.\d+$` | The schema outright rejects pre-release suffixes and other irregular shapes |
| Plugin id | Identity is immutable (§4) |

---

> **← Index:** [00-readme](00-readme.md) · **Related:** [16-naming-conventions](16-naming-conventions.md) · [09-plugin-directory-layout §The relationship between source location and distribution artifacts](09-plugin-directory-layout.md)
