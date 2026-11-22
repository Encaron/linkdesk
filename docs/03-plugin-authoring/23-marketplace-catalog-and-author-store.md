# 23 — Marketplace catalog & author store (marketplace.json / author blocks / collections)

> **In one sentence**: turn your repository into a "source" in the LinkDesk plugin store — the simplest form needs nothing at all (just `plugin.json`); you only need this guide when you want multiple plugins under one source, an author store front, or curated collections.
> This is the spec + recipes for **marketplace data authors**: how to write, self-check and publish the three pieces — `marketplace.json` (the catalog), `authors/<id>.json` (author block), `collections/` (collections).
> Field-level authority = the JSON Schema shipped inside `@linkdesk/marketplace-kit` (editor `$schema` completion & red squiggles); local checks = `npx marketplace-kit validate`.

---

## 1. Three author forms (pick a form first)

| Form | Repo contents | What you do | What users see |
|:--:|:--|:--|:--|
| **Single-plugin repo (zero config)** | only `plugin.json` | **nothing** | Your repo URL is added as a store source → this one plugin appears |
| **Multi-plugin repo** | `plugin.json`×N + root `marketplace.json` | `npx marketplace-kit init` to scaffold → fill entries | One source, several plugins |
| **Standalone catalog repo** | `marketplace.json` + `authors/<id>.json` (+ `collections/`) | `npx marketplace-kit init --author <yourGitHubUsername>` | One source + author card + author store front (multi-repo aggregation) |

**How to choose**:
- One plugin → **single-plugin repo, stop here** (you can skip the rest of this guide).
- Several plugins under one source → multi-plugin repo.
- Want an **author card** (avatar/intro/repo count) and an **author store front** (you arrange the home sections) → standalone catalog repo (or a multi-plugin repo plus the author block); declare the same `authorId` in every one of your repos and the store aggregates them into one author domain automatically.

⚠️ **Never hand-write a root `marketplace.json` in a single-plugin repo** — once the store sees it (even empty) it stops falling back to `plugin.json`, and your plugin disappears from the store. For an author card there, `init --author` adds only `authors/<id>.json` and touches nothing else.

---

## 2. Category declaration (primary + subcategories — pick, don't invent)

Declare categories in **your plugin's own `plugin.json`** (English slugs):

```json
{
  "pluginId": "demo-plugin",
  "category": "development",
  "categories": ["code-editing"]
}
```

- `category` (single) = primary category — decides which drawer bucket your plugin lives in;
- `categories` (multi, optional) = subcategory tags — feed the store's subcategory chips and search.

### 2.1 The available list (pick from this table; inventing slugs is not allowed)

| Primary | zh | Subcategories |
|:--|:--|:--|
| `development` | 开发 | `code-editing` · `terminal` · `vcs` · `runtime` · `i18n` · `debug` · `snippets` |
| `documents` | 文档 | `viewer` · `convert` · `markdown` · `files` · `office-doc` · `notebook` |
| `hardware` | 硬件 | `serial` · `flash` · `probe` · `smart-control` · `home-automation` · `sensor` · `iot` · `can-bus` |
| `network` | 网络 | `browser` · `chat` · `cloud` · `download` · `packet-capture` · `proxy` · `remote` |
| `productivity` | 效率 | `clipboard` · `notes` · `ai` · `color` · `todo` · `timer` · `launcher` · `calculator` |
| `themes` | 主题 | `color-scheme` · `icon-pack` · `font-pack` · `wallpaper` · `cursor-set` · `sound-pack` |
| `entertainment` | 娱乐 | `player` · `game` · `music` · `comic` · `novel` · `stream` |

### 2.2 How to choose

- Primary = **pick exactly one** of the 7 buckets above;
- Subcategories = **optional**, from the list of your primary bucket (multiple allowed); skipping them is perfectly legal — your plugin still shows, it just doesn't join the subcategory chips;
- Really can't decide the primary? Leave it out — your plugin lands in the "Other" bucket and stays visible forever (never dropped, never an error).

### 2.3 What happens if you write an off-list value

- **No crash, no disappearance**: the plugin still ships, landing in the "Other" bucket (or the "untagged" fallback chip for subcategories);
- **You get a notice**: `npx marketplace-kit validate` warns, and the store's sources page records a declaration notice;
- The warning message **prints the current available list** — fix it right from the error, no docs needed.

### 2.4 Does the list grow?

Yes — the store operator extends it as needed (pure data, nobody has to release anything). **The only thing you must do: treat the list printed by `marketplace-kit validate` as the truth** — it is always current.

---

## 3. `marketplace.json` field reference (the root file for multi-plugin / standalone catalog repos)

```json
{
  "$schema": "https://unpkg.com/@linkdesk/marketplace-kit/schemas/marketplace.schema.json",
  "plugins": [ "……entries, see below……" ],
  "collections": [ "……optional, see §5……" ],
  "categoryRail": { "order": ["development", "documents"], "icons": { "development": "lucide:code" } }
}
```

**Entry fields (`plugins[]`)** — publishing maintains entries for your built projects automatically; when hand-filling follow this table:

| Field | Required | Notes |
|:--|:--:|:--|
| `id` / `name` / `version` | ✅ | identity trio (`id` should match your pluginId) |
| `downloadUrl` | ✅ | direct link to the `.linkdesk-plugin` artifact (GitHub Release asset) |
| `versions[]` | ✅ | version history, **newest first**; each `{version, downloadUrl, publishedAt, changelog?}`. The catalog keeps the full history — the store detail page only renders the latest few, old entries are harmless |
| `description` / `license` / `repository` | opt | display & detail page |
| `author` / `authorId` | opt | `author` is the display name (`{name, url}` or a string); `authorId` is the **aggregation key** (GitHub username recommended) — same id aggregates an author domain and feeds the "official ✓" verification |
| `icon` / `marketIcon` | opt | **absolute URLs** (must resolve even when not installed); `marketIcon` wins as the store-row icon |
| `screenshots[]` | opt | gallery/card media: string = image URL; at most 1 video item and it must come first: `{"type":"video","url":"…","poster":"…"}` (never autoplays). Rules in §3.1 |
| `cover` | opt | catalogue card cover (**absolute https URL**); omitted ⇒ poster → first still → generated cover. Rules in §3.1 |
| `category` / `categories[]` | opt | see §2 |
| `pricing` | opt | paid listing, see §8 |
| `minAppVersion` | opt | minimum host version |
| `publishedAt` / `readmeUrl` / `size` | opt | publish date (any `versions[]` entry counts) / README direct link / byte size |

**Root fields**: `version`/`updatedAt` (maintained by the publish tool); `sources[]` is official-catalog-only (reviewed third-party source list — authors don't write it); `collections` (§5); `categoryRail` (category display order — slug order data; only the official catalog's rail takes effect).

Compatibility rule: **add fields only, never change semantics**. Old store versions reading a new catalog silently ignore unknown fields, never crash.

### 3.1 Media: `screenshots[]` / `cover` (change images without a release)

```json
{
  "cover": "https://raw.githubusercontent.com/<owner>/<repo>/HEAD/media/cover.png",
  "screenshots": [
    { "type": "video", "url": "https://…/demo.mp4", "poster": "https://…/poster.jpg" },
    "https://raw.githubusercontent.com/<owner>/<repo>/HEAD/media/shot-1.png",
    "https://raw.githubusercontent.com/<owner>/<repo>/HEAD/media/shot-2.png"
  ]
}
```

Rules (`marketplace-kit validate` and the store parser share the same vocabulary):

1. **Absolute https URLs only**: relative paths (`resources/x.png`) always 404 for uninstalled users (package paths are unreachable); plain `http:` is unsafe and rejected.
2. **At most ONE cover video, and it must be the first item**; `poster` is recommended (without it cards can only fall back to cover/stills/generated cover). Playback is always `controls`, `preload=metadata`, never `autoplay`/`loop`.
3. **Frame order**: video poster → `cover` → stills in declared order; de-duplicated and capped at **3 frames** (cards' hover carousel and the detail gallery consume the same selection — never one set per card type).
4. **Whose images**: the author's absolute URLs. Missing/broken media falls back to the **generated cover** (identity colour + icon + name watermark) — never a white block, never a layout jump.
5. **Stable URLs**: use a stable branch (e.g. `HEAD`) or a fixed key on your CDN/COS; never a version tag (`v1.2.3`) — tags are immutable, so changing the image would require a release. Bump the URL (`?v=20261122`) to bypass Chromium/raw caching.
6. **Changing images/prices/slots needs no release**: they are catalog metadata and apply on store refresh. Only images packaged inside the plugin (relative paths) require a `plugin.json.version` bump + republish.
7. **Two self-check commands**:
   - `npx marketplace-kit validate ./marketplace.json` — structure/closed sets/media URLs (error template: `file:field → expected → example`);
   - `npx marketplace-kit media:resolve ./marketplace.json [id]` — prints the actual `kind` (video/image/generated) / `frames` / `video`; exits non-zero on bad input.

---

## 4. Store-front recipes (`homepage.sections`, copy-paste ready)

Author store-front sections are fully declaration-driven (`homepage.sections[]` inside `authors/<id>.json`, rendered in declared order).
**"Browse by category" needs no declaration** — it always closes the list and cannot be removed.

```jsonc
// Hero carousel: 3–5 slides, you pick what makes the big screen
{ "type": "hero", "title": "Editor's picks", "hint": "Hand-picked",
  "slides": [ { "plugin": "demo-plugin", "tag": "Featured" } ] }

// Collection section: references a collection id (where collections live, see §5)
{ "type": "collection", "collection": "must-have", "layout": "duo",
  "hint": "Everyone installs these", "glow": false,
  "more": { "label": "See all", "target": "category:hardware" } }

// Everything grid
{ "type": "grid", "title": "All plugins" }

// Rank: a computed slot keyed by downloads
{ "type": "rank", "top": 6, "scope": "self",
  "more": { "label": "Full rank", "target": "rank" } }
```

**Common section fields**: `title` (fully yours) · `hint` (sub-caption; undeclared ⇒ nothing) · `glow` (ambient glow, default on; `false` falls back to a neutral shadow — no custom colors) · `more` (heading jump link: `label` is free-form, `target` is a closed set — `category:<slug>` / `rank` / `repo:<id>`, never a web URL).

**Collection section `layout` (one prototype per section, no per-card mixing)**: `small` (compact row) · `mega` (theme mega strip) · `duo` (two per row) · `split` (full-width split card) · `wall` (cover wall). Omitted ⇒ follows the collection; both omitted ⇒ `strip`.

Boundaries: only the first hero carousel gets the top slot (extras warn and render in place); `type` accepts exactly `hero/collection/grid/rank`; a section referencing a missing collection renders empty with a declaration notice.

---

## 5. Two ways to declare collections (both readable, pick one)

**Form A (inline, in the root file)** — good for 1–3 collections:

```json
"collections": [
  { "id": "must-have", "title": "Must have", "layout": "strip",
    "hint": "Curated by the store owner", "items": ["demo-plugin", "demo-tool"], "order": 1 }
]
```

**Form B (split folder)** — many collections, or you want home data maintained independently:
the root `marketplace.json` `collections` carries **string id references**, full declarations live in `collections/<id>.json`:

```json
"collections": ["must-have", "themes-picks"]
```

```json
// collections/must-have.json — identical object shape to form A
{ "id": "must-have", "title": "Must have", "layout": "strip", "items": ["demo-plugin"], "glow": false, "more": { "label": "See all", "target": "category:hardware" } }
```

Rules:
- the store fetches referenced files **only for ids listed as strings** — declare none and nothing is fetched (old catalogs cost zero);
- the same id declared both ways → **the inline object in the root file wins**, the folder copy is ignored with a declaration notice (don't double-declare);
- the file's declaration shape is identical to inline (`id/title/items` required; `subtitle/hint/cover/layout/glow/more/order` optional);
- collection `layout` accepts: `banner` (hero) · `strip` (compact row) · `duo` (two per row) · `grid` (grid) · `mega` (theme mega strip) · `small` (compact) · `split` (full-width split) · `wall` (cover wall); omitted ⇒ `strip`;
- `items` referencing plugin ids that don't exist → those members are skipped silently (defensive, the store never crashes).

---

## 6. Author block (`authors/<authorId>.json`)

```json
{
  "$schema": "https://unpkg.com/@linkdesk/marketplace-kit/schemas/authors.schema.json",
  "authorId": "your-github-username",
  "name": "Your display name",
  "intro": "One-line intro (GitHub provides avatar/name when resolvable; these are the non-GitHub fallback)",
  "storeTitle": "Your Plugin Store",
  "publicKey": "……(paid authors only, see §8)",
  "repos": [
    { "id": "main", "name": "Main repo", "sourceUrl": "https://raw.githubusercontent.com/you/your-marketplace/HEAD/marketplace.json" }
  ],
  "homepage": { "sections": [ "……recipes from §4……" ] }
}
```

- **Aggregation**: the same `authorId` in every repo's source root → the store aggregates one author domain (avatar/name follow GitHub as the canon);
- **repos[]**: one segment per marketplace repo of yours (`sourceUrl` = that repo's marketplace.json direct link) — this is where the store-front repo-switch cards come from;
- Location: standalone catalog repos keep it at the repo root `authors/` folder; single-plugin and multi-plugin repos can host the same file at their own root when a plugin should join the author domain (the store looks in each source root).

---

## 7. Using marketplace-kit (scaffolds & local checks)

```bash
npm i -D @linkdesk/marketplace-kit

npx marketplace-kit init                 # scaffold (auto-detects the repo form; never overwrites)
npx marketplace-kit init --author your-github-username   # add the author block
npx marketplace-kit validate ./          # validate the whole folder (incl. cross-file collection refs)
npx marketplace-kit validate ./marketplace.json          # validate one file
npx marketplace-kit media:resolve ./marketplace.json     # media dry-run: the frames/video actually used
npx marketplace-kit media:resolve ./marketplace.json demo-plugin --json   # one entry, machine-readable

# Paid authors (see §8):
npx marketplace-kit keygen --author your-github-username
npx marketplace-kit sign-license --key your-github-username.private.key --plugin demo-plugin --exp 30d
```

- `validate` **errors** (structure / unknown fields / closed-set typos) exit 1, **warnings** (off-list categories, collection refs… declaration notices) exit 0 — the warning codes use the same vocabulary as the store's sources-page notices;
- unknown fields are hard errors that print the allowed keys (the store silently drops keys it doesn't know — a typo means you wrote nothing, so catch it before publishing).

---

## 8. Paid plugins (pricing, public key, license issuing)

1. **Declare pricing** (entry level; display only, the store never adjudicates):

```json
"pricing": { "model": "paid", "price": 9.9, "currency": "USD",
             "licenseUrl": "https://your-sales-page", "refundUrl": "https://your-refund-policy", "trialDays": 14 }
```

   Payment happens on your own sales page (LinkDesk never collects money or takes a cut); `trialDays` is display-only (real trial gating lives in your plugin code).

2. **Generate a key pair**: `npx marketplace-kit keygen --author your-github-username` → a private key file (**never commit it, never share it; losing it means rotating keys and invalidating every license**) + a public key (one base64 line).

3. **Place the public key**: paste it into `marketplace.config.json`'s `publicKey` (publish writes it into the author block) or directly into `authors/<id>.json`'s `publicKey` field.

4. **Issue a license**: after a buyer pays, sign with their machine fingerprint —

```bash
npx marketplace-kit sign-license --key your-github-username.private.key \
  --plugin demo-plugin --machine <buyer machineFingerprint> --exp 2027-12-31
```

   `--exp` accepts `30d`/`12w`/`6m`/`1y` or a date; passing `--machine` makes it one-license-one-machine (buyers find the fingerprint in the shell's "this machine" info). Hand the `v1.…` key to the buyer; pasting it into the store's "I have a key" completes **offline verification** (in the shell, no server).

5. **Refunds / rotation**: refunds go through your sales channel; rotating keys = keygen again + update the public key + re-issue licenses for existing buyers (licenses signed by the old key stop validating).

---

## 9. Publishing (multi-plugin / standalone catalog repos)

```bash
npm run build      # produce <id>.linkdesk-plugin (each plugin in its own project)
npm run publish    # linkdesk-plugin-sdk publish: GitHub Release → upload asset → update this repo's marketplace.json
```

With `marketplace.config.json` at the project root (generated by `init`), `publish` also maintains the author-side files **in the same run**:

| File | Written by | Contents |
|:--|:--|:--|
| `marketplace.json` | publish | your plugin entries (`versions[]` history, README link, changelog) |
| `authors/<authorId>.json` | publish (config is the truth) | identity/store title/public key/homepage sections + this repo's repos segment |
| `collections/<id>.json` + root string refs | publish | collections declared in config (split form) |

- Same-version reruns are intercepted (existing Release tag → bump first); new versions append history automatically;
- `--dry-run` previews every action; `--yes` for CI;
- publish updates the **remote** repo files — the closing hint reminds you to `git pull` your local clone.

---

## 10. How others use your repo

- Paste the repo URL (or the raw `marketplace.json` direct link) into the LinkDesk store's "add source";
- Official endorsement = a PR on the official catalog repo adding your source to `sources[]` (endorsement, not a copy — you publish new versions in your own repo and the official list **never goes stale**); the application flow and the "official ✓" badge live in the official catalog repo's inclusion docs;
- All sources merge into **one shared pool**: category pages mix every source together; your plugins carry a source badge; the author domain (author card / store front) is a facade on top of the pool and never removes plugins from it.

---

## 11. Versions & compatibility

- The schema ships with `@linkdesk/marketplace-kit`; **schema changes always ship** (a yellow lamp watches it automatically);
- Old catalog files stay readable forever (every new field is optional); old store versions ignore unknown keys;
- the `$schema` line gives VS Code live completion and squiggles — upgrade the kit to get completion for new fields.

---

## 12. AI collaboration notes (for automation assistants)

- For any structural question run `npx marketplace-kit validate` first — **the error output is the spec**: it prints the available lists and allowed keys; fix accordingly, no need to read this guide;
- When generating scaffolds/author blocks/collection files, follow the kit's JSON Schema (`$schema` references let editors and AI share one contract);
- License issuing has exactly two commands (`keygen` / `sign-license`); the key format is constrained solely by the shell's verifier — never invent a second signature format;
- This guide and the kit move together per release: validate's output is fresher than this page (list extensions land in the error text first).
