# 17 — Region Map: Where Can Your Plugin Appear?

> **This page answers one question:** which **part of the window** should your plugin appear in? How is that part **declared**, and **what can it hold**?
> If you know the words "Icon Bar / Sidebar / Main Area" but not which declaration each one maps to — read this page first, then [13-Development Guide](13-development-guide.md).

| | |
|---|---|
| Audience | Authors (human, or the author's AI) who want to know "where does the thing I'm building belong" |
| Form | **A map** — take in the whole picture first, then look up the declaration snippet region by region |
| Not | A field dictionary (→ [06-plugin.json Spec](06-plugin-json-spec.md)) · the full syntax of every contribution point (→ [03-Contributes Spec](03-contributes-spec.md)) · container API details (→ [08-ViewContainer API](08-view-container-api.md)) |

---

## 1. All Regions in One Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│ ① Title Bar   [logo] LinkDesk                   [buttons…]  ─  □  × │ ← contributes.titleBar
├──────┬───────────────────────────┬──────────────────────────────────┤
│      │ ③ Sidebar title       [◀] │ ④ Tab Bar   [Terminal][📊]   [+] │
│ ⑤    ├───────────────────────────┼──────────────────────────────────┤
│ Icon │                           │                                  │
│ Bar  │ ③ Sidebar                 │ ⑥ Main Area (tab content)        │
│      │   container → view        │   (when split, each pane has     │
│ 42px │   (multiple sections)     │    its own Tab Bar)              │
│      │                           │                                  │
├──────┴───────────────────────────┴──────────────────────────────────┤
│  Bottom Panel (Ctrl+J)  [Output][Todo]                    [actions] │ ← location: "panel"
├─────────────────────────────────────────────────────────────────────┤
│ ⑦ Status Bar   ● COM3 connected │ TX:1,234 │      中:EN   ☀   🔔(3) │ ← top-level statusBar[]
└─────────────────────────────────────────────────────────────────────┘

  Overlays (context menu / dialog / quick pick / floating panel) are painted on top — they belong to no region
```

**This page is the authority on region names** (`docs/总体设计/V3-部件命名规范.md` is the canon for the same set of names): Title Bar · Icon Bar · Sidebar · Tab Bar · Main Area · Bottom Panel · Status Bar · Overlay.

---

## 2. Region Cheatsheet

| Region | How you get in (declaration) | What goes there | How the user sees it |
|:--|:--|:--|:--|
| **⑤ Icon Bar** | `appearsIn.iconBar` (`"top"` / `"bottom"`) **plus** either an `entry` or a **sidebar** container | One icon button | The icon shows up in the 42px vertical strip on the far left; clicking it toggles the sidebar container |
| **③ Sidebar** | `location: "sidebar"` under `contributes.viewsContainers` (the default) + views attached via `contributes.views` | Collapsible sections (one per view) | Switch to it by clicking the Icon Bar; several plugins can add views to the same container |
| **⑥ Main Area** | `entry` + `appearsIn.tabBar: true` | The content of one tab | Click the icon in the Icon Bar, or pick it from the `[+]` new-tab menu; multiple instances, splittable |
| **Bottom Panel** | `location: "panel"` under `contributes.viewsContainers` + views | Several panel views switched by the Tab Bar | `Ctrl+J` expands it; focus it in code with `window.linkdesk.panel.reveal(viewId)` |
| **⑦ Status Bar** | A top-level `statusBar: [...]` array (**not** `contributes.statusBar`) | A line of text / icons / clickable entries | Usually at the bottom; `align` decides left or right |
| **① Title Bar** | `contributes.titleBar.right[]` / `.left[]` | Icon buttons or text-only buttons | The right side of the window's top row |
| **Overlay** | `contributes.floatingPanel` (declares one of your existing views as "openable in a Floating Panel") | One of your existing views | Right-click a tab → "Open in Floating Panel" |
| **View action area** | `contributes.views[].titleActions[]` | Three kinds of small controls: `icon` / `dropdown` / `split` | Right side of a sidebar section's collapsible header, or right side of a panel's Tab Bar |

### Two Places You Can't Get Into

| Where you might want to put it | What actually happens |
|:--|:--|
| **Right side bar** (`location: "auxiliarybar"`) | ⚠️ **The shell isn't wired up for it today** — declaring it renders nothing; it's a dormant region. Third parties that want a side bar should use `"sidebar"` |
| **Top Bar** (the old TopBar) | Removed in an early version. The name `contributes.titleBar` survived, but its slots land in the **① Title Bar**, not the old "Top Bar" |

---

## 3. Things People Mix Up Most

### ① Icon Bar ≠ tab: two plugin shapes

A plugin has **two paths** to being seen. Don't mix them up:

| Shape | What it needs | Result |
|:--|:--|:--|
| **Has an `entry`** | `entry` + `appearsIn.iconBar` | An icon plus openable-as-a-tab (the classic shape) |
| **entryless** (sidebar-only) | **No `entry`**; just a sidebar container + `appearsIn.iconBar` | An icon and a sidebar only, **never a tab** |

> **entryless is the recommended path for sidebar-only plugins** — no need to write an empty `src/index.tsx` just to earn an icon.
> Conversely: `appearsIn.tabBar: true` **requires** an `entry` (tabs are rendered by the entry component).

**What clicking the Icon Bar icon actually does, by declaration** (two shell consumers read the same click independently — one opens tabs, one switches the sidebar):

| Declaration | Clicking the icon does |
|:--|:--|
| `entry` + `appearsIn: { iconBar: "top", tabBar: true }` | **Opens (or focuses) a tab** — the classic shape, nothing else to declare |
| `entry` + `appearsIn: { iconBar: "top" }` — no `tabBar`, no sidebar container | **Nothing** — the icon is display-only. `iconBar` alone never opens a tab; add `tabBar: true` for that |
| No `entry` + sidebar container + `appearsIn: { iconBar: "top" }` | **Switches to your sidebar container**; clicking the same icon again collapses/expands the sidebar — entryless never opens a tab |
| `entry` + `tabBar: true` + sidebar container | The sidebar switch always happens; the tab opens **only when `appearsIn.sidePanel` is not declared** — declare `sidePanel: true` to keep the click sidebar-only |
| Top-level `statusBar[]` | Never goes through the Icon Bar at all — entries render directly in the Status Bar, and clicking one runs that entry's own `onClick` command |

**Three cases where you don't get an icon** (none of them are bugs — they're by design):
- You don't declare `appearsIn.iconBar` (**opt-in** — no declaration, no icon)
- Data plugins (language packs / themes / icon themes, anything without a sidebar container)
- You have only panel / auxiliarybar containers — the Icon Bar means "open a sidebar container", and the Bottom Panel doesn't count

### ② Sidebar container ≠ tab

The sidebar holds two layers, **container → view**: the container is a "channel" (switched by clicking the Icon Bar), and the views are the individual **collapsible sections** inside it.
**Other plugins can add views to your container, and your plugin can add views to theirs** — the container's owner neither knows nor cares.

```jsonc
// Adding a section to someone else's container: write only contributes.views, not viewsContainers
{ "contributes": { "views": { "explorer": [ { "id": "timeline", "title": "TIMELINE", "render": "src/views/TimelineView.tsx", "order": 100 } ] } } }
```

### ③ Don't wrap your view component in `SidebarSection` yourself

When the shell renders with `PoolSectionStack` it **automatically** wraps your component in a collapsible header. Just return the **content**; wrap it yourself and you get a double header.

### ④ Three images, three jobs: `icon` / `marketIcon` / `cover`

| Image | Where it shows up | The one rule that bites |
|:--|:--|:--|
| `icon` | Icon Bar / tab bar / [+] menu / welcome page | **The Icon Bar force-tints it** — draw a single-colour line glyph, a coloured image turns into a blob |
| `marketIcon` | Marketplace list row + detail-page header | The coloured identity image; omit it and the market falls back to `icon` |
| `cover` | README description area only | Not a manifest field — put the file in `resources/` and reference it from `README.md` |

Full rules → [06-plugin.json Spec §The marketplace image marketIcon](06-plugin-json-spec.md) · [12-README Media Contract](12-readme-media-contract.md).

---

## 4. Minimal Declaration Snippet for Each Region

### ⑤ Icon Bar + ⑥ Main Area (classic tab plugin)

```jsonc
{
  "pluginId": "my-plugin",
  "name": "My Plugin",
  "icon": "resources/icon.svg",
  "entry": "src/index.tsx",
  "appearsIn": { "iconBar": "top", "tabBar": true }
}
```

```tsx
// src/index.tsx — the entry component: the shell injects props as { isActive, tabId?, sourceId? }
export default function MyView({ isActive }: { isActive: boolean }) {
  return <div>Hello LinkDesk</div>;
}
```

### ③ Sidebar

```jsonc
{
  "appearsIn": { "iconBar": "top" },
  "contributes": {
    "viewsContainers": { "my-sidebar": { "title": "My Tools", "location": "sidebar", "order": 100 } },
    "views": { "my-sidebar": [ { "id": "main", "title": "", "render": "src/views/MainView.tsx", "order": 0 } ] }
  }
}
```

### Bottom Panel

```jsonc
{
  "contributes": {
    "viewsContainers": { "my-panel": { "title": "My Panel", "location": "panel" } },
    "views": { "my-panel": [ { "id": "output", "title": "Output", "render": "src/views/OutputView.tsx", "order": 0 } ] }
  }
}
```

```ts
await window.linkdesk.panel.reveal("output");   // Focus the "output" view in the Bottom Panel (not in a panel container → no-op, no error)
```

### ⑦ Status Bar

```jsonc
{
  "statusBar": [
    { "id": "units", "label": "mm", "align": "right" },
    { "id": "zoom",  "label": "100%", "align": "right", "onClick": "my-plugin.zoomFit" }
  ]
}
```

The React component for a Status Bar entry is auto-discovered along three paths: `statusBar.tsx` / `src/statusBar.tsx` / `src/components/statusBar.tsx`.

### ① Title Bar buttons

```jsonc
{
  "contributes": {
    "titleBar": { "right": [ { "command": "my-plugin.refresh", "icon": "codicon-refresh", "when": "my-plugin.busy" } ] }
  }
}
```

### View action area (sidebar section / right side of the panel Tab Bar)

```jsonc
{
  "contributes": {
    "views": {
      "my-sidebar": [
        {
          "id": "main", "title": "My Tools", "render": "src/views/MainView.tsx",
          "titleActions": [ { "type": "icon", "id": "reload", "command": "my-plugin.reload", "icon": "codicon-refresh", "title": "Reload" } ]
        }
      ]
    }
  }
}
```

The `command` in `titleActions` is registered by your own view component (`window.linkdesk.commands.registerCommand`); **for purely programmatic commands like these, prefer `when: "false"`** so they don't flood the Command Palette.

---

## 5. The Props Contract for Components

No matter which region you land in, **your content component receives the same set of props**:

```ts
type PluginViewProps = { isActive: boolean; tabId?: string; sourceId?: string };
```

| prop | Meaning | Usage |
|:--|:--|:--|
| `isActive` | Whether the containing tab/view is currently focused | **Use it only to gate side effects that should run while focused** (polling, autosave) — under keep-alive every tab stays mounted, so blanking the whole content block with `isActive` is a bug |
| `tabId` | This tab's id | Tells apart multiple instances of the same plugin |
| `sourceId` | Context data (file path / session id, etc.) | Editor-style plugins use it to know which file the user opened |

**View** components in the Sidebar / Panel have the same signature (you may declare only the props you actually use).

---

## 6. How Regions Talk to Each Other

Picking a region only settles "where you live". **Cross-region wiring** like "sidebar selection → Main Area switches → Status Bar updates" is a different page:
→ [18-Cross-Region Wiring](18-cross-region-wiring.md).

---

## 7. Related Reading

| What you want to do | Read this |
|:--|:--|
| Every field of the view container API (`viewsContainers` / `views` / `titleActions`, three forms) | [08-ViewContainer API](08-view-container-api.md) |
| The full syntax and examples for every contribution point | [03-Contributes Spec](03-contributes-spec.md) |
| What each field means / its type / its default | [06-plugin.json Spec](06-plugin-json-spec.md) · `plugin.schema.json` |
| How regions connect to one another | [18-Cross-Region Wiring](18-cross-region-wiring.md) |
| Writing a plugin for the first time | [13-Development Guide](13-development-guide.md) |
| The full documentation index | [00-README](00-readme.md) |

> Temporary negative-control line.
