# 22 — Menu contribution points (put your action into one of the host's menus)

> 🌐 **中文版（维护者面）→ [../03-插件制造/22-菜单贡献点.md](https://github.com/Encaron/linkdesk/blob/electron/docs/03-插件制造/22-菜单贡献点.md)**
>
> 2026-10-05 · **In one line**: **you declare "which slot, under what condition, running which command" in `plugin.json`** —
> the host changes no code for you, and you import no host module (**strings are the contract**).
> This page is a **spec plus an author self-check**; the per-field schema lives in [06-plugin.json-spec](06-plugin-json-spec.md),
> the discipline of turning actions into commands in [21-command-ification-spec](21-command-ification-spec.md),
> and command-id ownership in [16-naming-conventions](16-naming-conventions.md) §7.

---

## 1. Minimal working example (three things must hold at once)

```json
{
  "contributes": {
    "commands": [
      { "id": "my-plugin.exportMd", "title": "Export as HTML" }
    ],
    "menus": {
      "fileContext": [
        { "command": "my-plugin.exportMd", "when": "resourceExtname == '.md'", "group": "1_navigation" }
      ]
    }
  }
}
```

| # | Condition | What happens when it fails |
|:--:|:--|:--|
| ① | The command is **declared** in `contributes.commands` | The item renders but does nothing when clicked (rendering uses the command's `title`; running uses its handler) |
| ② | The slot id is a **value** (`fileContext`), not a member name (`FileContext`) | It **silently disappears**: the host registry has no such key and nothing errors. The `check-menu-slot-case` gate catches exactly this case (differing only in letter case) |
| ③ | The `when` expression evaluates to true | The item is hidden (an unparseable `when` is treated as "do not show" — the safe side) |

After editing `plugin.json`, **reactivate the plugin** (restart the app, or disable and enable it) — contributions are read at activation.

---

## 2. Slots (MenuId): the 14 host registration points

The slot id is the **key** in `contributes.menus`; the value is the **value** of a host `MENU_SLOTS` constant (lower camelCase).

| Slot value | Where it appears | Common `when` keys | Notes |
|:--|:--|:--|:--|
| `commandPalette` | The Ctrl+Shift+P command palette | — | ⚠️ **No host renderer reads it today**: palette entries come from `contributes.commands` (filtered by each command's own `when`), so items you post here are invisible — treat it as a **reserved slot** |
| `tabContext` | Right-click on a tab in the tab bar | — | The host posts its own "close / close others / pin…" items here; yours merge with them |
| `panelViewContext` | Right-click on the bottom panel's tab strip | — | The position/alignment submenus and the view-visibility list are injected dynamically by the host |
| `editorContext` | Right-click inside a tab's **content area** (terminal receive area, editor…) | — | Aimed at "the thing currently open", not at a file |
| `extensionGear` | The bottom gear menu (global action entry) | — | Always visible to the user — use sparingly |
| `marketplaceItemGear` | The gear on **each entry** in the plugin marketplace | — | Per-plugin actions (enable/disable/uninstall are the host's own items) |
| `menuBar` | The ☰ hamburger menu bar | — | Items with `group: "panel"` merge into the hamburger's "Panel" group (see §4) |
| `panel` | The hamburger's "Panel" group (dedicated slot) | — | Equivalent to the row above with `group:"panel"` — pick one |
| `fileContext` | Right-click on a node in the file tree | `resourceExtname` · `resourceIsFile` | The main battleground for "show by extension", see §5 |
| `cardContext` | Right-click on a card | — | — |
| `quickSendContext` | Right-click on the quick-send pill | — | — |
| `iconBar` | Right-click on the icon bar | — | — |
| `settingItemGear` | The hover gear on **each row** of the settings page | `settingKey` · `settingFollowTheme` · `settingModified` · `settingResetsToDefault` · `settingHasTitle` | These five are the settings-row public contract keys, see §5 |
| `viewTitleContext` | Right-click on a sidebar/right-sidebar **view title** | — | Collapse/expand/hide/reset-position are posted by the host |

**A `—` in the "Common `when` keys" column is not "no keys exist"** — it means there are no **public contract** keys there.
In those slots you can only use host-only flags (`activeEditor` and friends: **read-only, plugins must not set them**)
or your own `<pluginId>.*` flags.

> The "Where it appears" column is taken from the host's `MENU_SLOTS` constant table (the host's **intent**) —
> if a live reading disagrees, trust the live reading and tell us.

> 🔴 **`MenuId` is an open string**: you may invent a slot id of your own (say `my-plugin.palette`) and nothing errors —
> but **no renderer will read it** unless your own plugin does (`menu.getItems("my-plugin.palette")`).
> Posting into a host slot makes your item appear in a host menu; a self-made slot is a plugin-internal mechanism.

---

## 3. Item fields

| Field | Required | Meaning |
|:--|:--:|:--|
| `command` | ✅ | The command id to run. **A parent item with `children` may leave it empty** (a parent only expands a submenu and runs nothing; use `label` as its text) |
| `label` | — | Overrides the command's `title` (display text). **Required for a parent item (no `command`)** |
| `group` | — | Group name (see §4). Default = the fallback group |
| `when` | — | Visibility condition (see §5). Default = always shown |
| `order` | — | Sort weight within a group, **lower comes first**, default `100` |
| `children` | — | Submenu, any depth. **The parent expands on hover** (`children: []` plus a pool-side `resolveChildren` gives a dynamic submenu — advanced usage) |

```jsonc
// Shorthand: a bare string element means { "command": "…" }
"menus": { "fileContext": ["my-plugin.exportMd"] }
```

### Submenu example

```jsonc
{
  "menus": {
    "fileContext": [
      {
        "command": "",                      // a parent runs no command
        "label": "My tools",
        "group": "3_creation",
        "when": "resourceExtname == '.md'",
        "children": [
          { "command": "my-plugin.exportMd" },
          { "command": "my-plugin.wordCount" }
        ]
      }
    ]
  }
}
```

### Payload: `commandArgs` vs `context`

`MenuItemDescriptor` has one more field that matters as soon as a menu is built by shared code rather
than by you:

| Field | Meaning |
|:--|:--|
| `commandArgs` | **This item's own arguments.** The only place per-item identity belongs |
| `context` | **Shared by the whole menu.** When the menu is opened by a shared component, that component supplies it (it is not yours to set) |

**The menu payload law.** `context` is **shared by the whole menu**; each item's identity must travel in
`MenuItemDescriptor.commandArgs`. The host handler receives `args = [...commandArgs, context]`. A shared
component (for example `PluginCard`) always sends **its own** `context` (`PluginCard` = `{pluginId}`) ⇒
when you consume a shared component's context menu, your handler must tolerate **both** its own payload in
`args[0]` **and** the shared component's context **at the end** — ⛔ never assume `args[0]` is your data
(unless that slot has no shared context at all).

```ts
// Consuming PluginCard's gear menu: args = [{ pluginId }, context]
// Your own payload (from commandArgs) first, the shared component's context last.
linkdesk.commands.registerCommand("my-plugin.onCardGear", (args) => {
  const mine = args?.[0] as { pluginId?: string } | undefined;
  if (!mine?.pluginId) return;              // no target ⇒ do nothing (never "act on an empty one")
  /* … */
});
```

---

## 4. `group` and ordering (what the menu ends up looking like)

Rendering happens in two steps, **both done by the host** — you only supply `group` and `order`:

1. **Sort**: take every item in that slot (the host's own, other plugins', yours) and sort by `order` ascending (default `100`).
2. **Group**: merge by `group`, **drawing a divider between groups**; the order of groups = **the position of the group's earliest item in the sorted result** (i.e. "first appearance", **not** alphabetical).

⇒ To place "my group" after "navigation", give your group a **larger `order`**; the group *name* itself does not sort.

**Naming convention (context menus: `fileContext` / `tabContext` / `editorContext` / `cardContext`)** — use
`<number>_<meaning>` bucket names; the number decides the order, the word is for humans:

| Conventional bucket | What goes in it |
|:--|:--|
| `1_navigation` | Open, open in new tab, reveal in system, open in terminal, open with… |
| `2_editing` | Cut, copy, copy path, paste… |
| `3_creation` | New file, new folder, new terminal… |
| `4_modify` | Rename, move… |
| `5_search` | Find in folder… |
| `6_workspace` | Workspace/root-scoped actions (close folder…) |

**Two special group names**:

- `delete` — danger styling (red). **Keep destructive actions in a group of their own** (the shared `ContextMenu` only looks at this one group name to pick the danger colour).
- The fallback group — what an item joins when it has no `group`; a divider is still drawn between it and explicit groups.

> ⚠️ Group names are **free-form strings**: Chinese names work too (several settings-page plugins use them).
> The table above is the **cross-plugin convention** — your group sits in the same menu as everyone else's,
> and mismatched naming just adds meaningless dividers.

### Merging into `menuBar` / `panel`

Posting into the `menuBar` or `panel` slot with `group: "panel"` merges the items into the hamburger's **"Panel" group**
(where the host keeps its "open/collapse panel" entry; plugin items follow it). This is the only special rule for those two slots.

---

## 5. `when`: conditional visibility

`when` is a small expression that **judges context keys in the host** (values written at runtime by the host or by another plugin).

| Syntax | Example | Meaning |
|:--|:--|:--|
| Bare key | `file-tree.itemIsFile` | True when the value is **truthy** (undefined = false) |
| `==` / `!=` | `resourceExtname == '.md'` | String comparison; empty and undefined compare as the empty string (see the pitfalls) |
| `=~` | `resourceExtname =~ '\\.md$'` | Regular expression (**case-sensitive**, run as a plain JS `RegExp`) |
| `in` | `activeEditor in ['terminal', 'editor']` | Set membership |
| `&&` / `\|\|` / `!` / `( )` | `resourceIsFile && !file-tree.inputFocus` | Boolean combination (`!` binds tightest, then `&&`, then `\|\|`) |
| `true` / `false` | `when: "false"` | Constants (`false` = never show; useful as a placeholder) |

### 🔴 Three pitfalls you must know

**Pitfall 1 — literals need (single) quotes.**
The parser only accepts `'…'` (and numbers) as literals. Writing `resourceExtname == .md` without quotes **fails to parse**,
the `when` is treated as "do not show", the menu item **silently disappears**, and the only trace is one
`when 表达式解析失败` line in the console.

```jsonc
"when": "resourceExtname == .md"      // ❌ parse failure → the item never appears
"when": "resourceExtname == '.md'"    // ✅
"when": "resourceExtname =~ '\\.md$'" // ✅ regexes need quotes too (escape `\` as `\\` in JSON)
```

**Pitfall 2 — `== ''` also matches "undefined".**
`==` is implemented as `String(value ?? "")`, so **a key that was never written** and **a key whose value is the empty string**
cannot be told apart. To mean "there is a file context", do not write `resourceExtname != ''` (that is false when undefined either) —
use the boolean key:

```jsonc
"when": "resourceExtname == '.md'"   // ✅ undefined → "" ≠ ".md" → hidden
"when": "resourceIsFile"             // ✅ undefined → false
"when": "resourceExtname != ''"      // ❌ false when undefined; reads fine but is ambiguous
```

**Pitfall 3 — an identifier in `when` is a plain property lookup on the object you hand in (watch this in plugin-authored slots).**
The host reads `when` with a **bare property lookup** (`key in overrides ? overrides[key] : global value`) — the identifier in the
expression is used **verbatim as the property name**. So when you render one of **your own slots** with the shared `ContextMenu`
and pass the row data down through its `context` prop, the name in `when` must match that object's field name
**character for character, case included**. A mismatch — or renaming one side only — makes the expression **permanently false and
the item silently disappears**: no error, no warning, **not even the console line from Pitfall 1**.

```jsonc
// menu declaration: reads the per-row "this row has a binding" flag
{ "command": "my-plugin.copyKey", "when": "rowHasKey" }
```
```tsx
// the object handed down at render time — the field name must match "rowHasKey" exactly
<ContextMenu context={{ command, key, rowHasKey: key !== "" }} … />
```

> 🔴 Real case, 2026-10-05: the official `settings` plugin 1.0.32 shipped a keybinding-row gear menu whose three gated items
> (copy keybinding / copy as JSON / reset to default) **never appeared at all** — the declaration said `keybindingHasKey` /
> `keybindingIsUser`, while the fields were `hasKey` and there was no `isUser` at all. All nine gate legs and every unit test
> were green, because **none of them evaluates `when`**. The fix pairs two things: derive the field names with
> **computed property names** from a single constant (so a rename becomes a TypeScript compile error), plus a **contract
> regression test** that reconciles the menu declaration in `plugin.json` against the runtime row object. Worth copying.

### Which keys you may use

| Key | Value | Written by | Notes |
|:--|:--|:--|:--|
| `resourceExtname` | The extension **lower-cased, including the dot** (`.md` / `.txt`); **undefined for a file without an extension or a dotfile** | The official `file-tree` | Injected on right-click for the target node; also **undefined** when right-clicking a root node or empty space |
| `resourceIsFile` | Boolean; undefined for a root node or empty space | The official `file-tree` | Whether the right-clicked target is a file or a folder |
| `settingKey` · `settingFollowTheme` · `settingModified` · `settingResetsToDefault` · `settingHasTitle` | Strings/booleans | The official `settings` | Public contract keys of the settings-row gear slot (`settingItemGear`) |
| `activeEditor` · `editorCount` · `editorHasSelection` · `inputFocus` · `sidebarPosition` · … | See the ledger | **The host** | **Read-only**; plugins must not set them (full list in [16-naming-conventions](16-naming-conventions.md) §7 and the SDK's `schemas/host-reserved.json`) |
| `<your pluginId>.*` | Whatever you decide | **You** | Your private flags. ⛔ Never without the prefix (the SDK's `check-context-ownership` fails it) |

**Flags you write yourself** (so the host or another plugin can read them in a `when`, or for your own menus):

```ts
await window.linkdesk.contextKey.set("my-plugin.previewOpen", true);
// when: "my-plugin.previewOpen"
```

> ⚠️ A context key is **a key in a global registry**: writing someone else's name without a prefix **silently overrides their state**
> (their `when` flickers, and neither side reports an error). The prefix rule and its consequences are in
> [16-naming-conventions](16-naming-conventions.md) §7, and the gate runs inside your own `npm run verify`.

---

## 6. Command-ownership discipline

A menu item **only references a command id**, so rule number one is always:

1. **Your command ids must carry your own prefix** (`my-plugin.`) — rationale and gate in
   [16-naming-conventions](16-naming-conventions.md) §7 and [21-command-ification-spec](21-command-ification-spec.md)
   (everything you can do in the UI should be a command).
2. **⛔ Never reference another plugin's command.** Their commands are their implementation detail: if they rename, uninstall,
   or disable, your item **silently stops working** (or worse, throws when clicked). For cross-plugin work, go through a
   **declarative contract** (they declare a public command, or use [07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md)).
   The only exception is a **host-public command** (the `theme.*` / `view.*` / `app.*` ones the docs say you may call).
3. **Visible text must be translatable.** An item shows the command's `title` (or its own `label`) — those strings belong in your
   repo's `i18n/en.json` (key = the Chinese source string), per [09-plugin-directory-layout](09-plugin-directory-layout.md);
   leg ⑧ of `npm run verify` counts them.

---

## 7. Self-check (in this order when an item does not show up)

| Symptom | Most likely cause | How to confirm |
|:--|:--|:--|
| Not a single item of mine in the slot | The slot key was written as the member name (`FileContext`) | The `check-menu-slot-case` gate (inside `npm run lint` / `verify`); or look at your `plugin.json` and check the key is lower camelCase |
| Appears sometimes, not others | The `when` is false | Re-run the `when` in the debug entry, or look for `when 表达式解析失败` in the console |
| My item **never appears** (not intermittently), and the console is clean | The identifier in `when` does not match the field name of the object you hand into the menu (spelling/case) — the host does a bare property lookup, so a miss is simply false | Derive the field name with a **computed property name** from one constant, or write a declaration↔runtime contract test (see §5, Pitfall 3) |
| Appears but does nothing when clicked | The command was never registered (declared in `contributes.commands` but no pool-side `registerCommand`) | See [21-command-ification-spec](21-command-ification-spec.md) §2 "two legs" |
| My item sorts first/last and loses to others | `order` defaults to `100` and other groups are smaller | Adjust `order` or rename the group (group order = first appearance) |
| A "missing your repo's prefix" report | A command id / config key / appearance id / context key lacks the `<pluginId>.` prefix | `npm run verify` reports the site and suggests a name (see [16-naming-conventions](16-naming-conventions.md) §7) |

**One command runs every author-side gate**: `npm run verify` (lint + cross-plugin imports + dictionary + declaration consistency + test coverage + …).
