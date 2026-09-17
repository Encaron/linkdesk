# 18 — Cross-Region Wiring: Sidebar selection → Main Area switches → Status Bar updates

> **This page answers one question:** your plugin spans several regions (Icon Bar / Sidebar / Main Area / Bottom Panel / Status Bar) — **how do they line up with each other**?
> Example: "Select a session in the sidebar → the Main Area switches to that session's tab → the Status Bar shows the current session name."

| | |
|---|---|
| Audience | Authors who already know where the regions are (→ [17-Region Map](17-region-map.md)) and now want them to **work together** |
| Form | **A recipe collection** — a skeleton you can copy, one per scenario |
| Not | A dictionary of communication mechanisms (→ [07-Plugin-to-Plugin Communication](07-plugin-to-plugin-communication.md) covers "what mechanisms exist") · data pipeline command naming (→ [14-Data Pipeline Command Conventions](14-data-pipeline-command-conventions.md)) |

> **Division of labor in one sentence: `07` answers "how do plugins pass data to each other"; this page answers "how do the several regions of one plugin line up".** The former is mechanism, the latter is **wiring** — pick your tool on this page first, then read `07` for the mechanism details.

---

## 1. Five Wiring Tools (pick the tool, then write the code)

| What you want to achieve | What to use | Direction | Coupling |
|:--|:--|:--|:--|
| **Click something → another region does something** | `window.linkdesk.commands.executeCommand("id", args)` | Directed (one-to-one) | Tight — the caller knows the command name |
| **One region changes → whoever cares refreshes itself** | `window.linkdesk.events.emit(channel, payload)` + `events.on` | Broadcast (one-to-many) | Loose — the publisher doesn't know who's listening |
| **Some state decides whether a button/menu/view shows** | `window.linkdesk.contextKey.set(key, value)` + `when` in the declaration | Declarative (zero-code wiring) | Loosest — the shell reads the key, you never touch the other side |
| **Cross-region "navigation"** (open/focus somewhere else) | `tabs.create` / `tabs.openOrFocus` / `tabs.focus` / `panel.reveal(viewId)` / `panel.revealFloating(viewId)` | Directed | Tight — you're naming the destination |
| **The user changes a value on the settings page → regions follow** | `window.linkdesk.configuration.onChange(key, cb)` | Broadcast (the shell publishes for you) | Loosest — zero extra declarations (→ [20-Adding a Setting](20-adding-a-setting.md)) |

**And one more, zero-code:** **appearance** — colors, fonts, radii, glass — follows the theme automatically. Just use `var(--xxx)` and switching themes updates every region, with no subscription at all.

---

## 2. Four Typical Recipes

### Recipe A — Selection in the sidebar → open/focus the matching tab in the Main Area

Pick an item in the sidebar view and make the Main Area show/focus the matching content. This is the **"command + open"** combination:

```tsx
// Sidebar view (src/views/SessionListView.tsx)
function onPick(id: string) {
  // ① Have the Main Area surface the matching content (idempotent: focus if it exists, create if not)
  void window.linkdesk.tabs.openOrFocus("my-plugin", { sourceId: id, label: `Session ${id}` });
}
```

```tsx
// Main Area entry component (src/index.tsx) — sourceId tells it which one to show
export default function MyView({ isActive, sourceId }: { isActive: boolean; sourceId?: string }) {
  // sourceId changed → this is "same plugin, different tab"; each is independent
  return <SessionDetail id={sourceId} />;
}
```

> **`openOrFocus` is used more often than `create`** — double-clicking shouldn't produce two identical tabs.
> Multiple tabs of the same plugin are told apart by **`sourceId`** (not by each one's own React state) — see [17 §5 Props Contract](17-region-map.md).

### Recipe B — Selected or not → Status Bar entries / Title Bar buttons show and hide by themselves

**To make a "only appears when something is selected" button appear, don't thread a prop down through React — use a context key and let the shell decide:**

```tsx
// Sidebar view: write the state into a context key (prefix the key with your plugin id so it can't collide)
useEffect(() => {
  void window.linkdesk.contextKey.set("my-plugin.hasSelection", !!selectedId);
}, [selectedId]);
```

```jsonc
// plugin.json — consume that key declaratively; each region writes its own when
{
  "contributes": {
    "titleBar": { "right": [
      { "command": "my-plugin.rename", "icon": "codicon-edit", "when": "my-plugin.hasSelection" }
    ] },
    "menus": { "editor/context": [ { "command": "my-plugin.rename", "when": "my-plugin.hasSelection" } ] }
  }
}
```

> **This is "zero-code wiring"**: Title Bar buttons, context menu items, keybindings, and sidebar views can all use the same `when` condition — you `set` it in one place and the shell reads it in N places. The `when` syntax (`&&` / `||` / `==` / `in` / `!` / `()`) and the shell's built-in key table → [03-Contributes Spec §4](03-contributes-spec.md).

#### 🔴 Flag reservation table — **read this before naming a key** (shell 1.38+)

Flags are **keys in a global registry**: the name you `set` is **visible to the whole pool**, and the shell's built-in commands/menus read `when` against that same table. So names are not free-form — there are **two segments**, with different rules:

**① Host-only flags (🔴 plugins must not set)** — state maintained by the host kernel/shell itself. Taking one over rewrites the show/hide conditions of host menus and the command palette, and **neither side reports an error** — the user just sees "a menu item mysteriously vanished":

| Flag | What it controls (host side) |
|:--|:--|
| `activeEditor` | Current editor type (commands/menus gate on it) |
| `editorCount` | Number of open editors |
| `editorHasSelection` | Whether the current editor has a selection |
| `inputFocus` | Whether an input is focused (🔴 the measured case: on F2 rename, **keybindings must yield**) |
| `sidebarPosition` | Sidebar dock position |
| `updateActionable` | Whether an installable update exists |
| `updateButtonLabel` | The update button's text |

**② Host public-convention flags (🟠 settable, but only the host should set them)** — the host `when` **reads** these; the writer is meant to be the host itself:

| Flag | Convention | Who may set it |
|:--|:--|:--|
| `settingKey` | Settings row gear menu — **the current item's key** | Only the `settingItemGear` gear menu should |
| `settingValue` | Same — current value | Same |
| `settingType` | Same — control type | Same |
| `settingScope` | Same — scope | Same |

These four are **in practice** "anyone can set, anyone can read" (`MenuId` is an open string ⇒ a third party **can** add entries to the `settingItemGear` slot) — which is why setting them is **not** judged red. But **the one legitimate write site is the gear menu**: if you overwrite them from anywhere else, the gear menu opens against **the wrong row**. ⇒ **Don't set them** unless you are implementing that slot's menu.

**Machine-readable source of truth** (ships with the SDK package — don't guess):

```
node_modules/@linkdesk/plugin-sdk/schemas/host-reserved.json
  → "contextKeysHostOnly": ["activeEditor", "editorCount", ...]   ← segment ① do not set
    "contextKeysPublic":   ["settingKey", "settingValue", ...]     ← segment ② don't set (except the gear menu)
```

**Two-level judgement** (same shape as config keys and appearance ids — don't conflate them):

| Criterion | Grade | Judged by | What happens |
|:--|:--:|:--|:--|
| The `set` name ∈ **segment ① host-only** | 🔴 **red** | SDK leg `linkdesk/no-unowned-context-key` | Your lint reports red by name; the **runtime second net** adds a `console.error` at the `contextKey:set` bridge — but 🔴 **the value is still written, not rejected** (see below) |
| **New** flag's first segment isn't your `pluginId` | 🟡 yellow (advisory) | SDK leg | Reported with `suggested` = the same name with only the first segment swapped (`zzzFlag` → `my-plugin.zzzFlag`). 23 flags across the 18 official repos break this rule; the shell migrates them centrally — **write new ones by the rule** |
| The `set` name ∈ **segment ② convention face** | 🟠 **not judged** | Registered only | Legal, but see above: that's the gear menu's spot — don't overwrite it |

> **Why "taking a host-only flag" is red while "missing your prefix" is only yellow**: taking a host-only flag does **real harm** (it replaces host state, and neither side errors); whereas "missing the prefix" has 23 counterexamples in existing code, so a blanket rule would break shipped plugins on the spot. Different grades = different tolerance, not "the more important rule is written stricter".

> 🔴 **Why the runtime only speaks up and never rejects** (unlike config keys / appearance ids, which **refuse registration**): a flag is a **state write**, not a **registration** — `contextKey.set(name, value)` just writes a value into a table, and two parties writing the same name in sequence with the later one winning is **normal runtime behaviour**. "Refusing" would require the runtime to know **who came first**, but `contextKey:set` crosses IPC carrying **only `[key, value]` and no writer identity** ⇒ "first writer wins" is **structurally impossible** on this face. ⇒ The only honest action is to speak up by name and write the value anyway. **The real protection lives in your lint** (it has your identity and reports at compile time); the runtime layer is just a second net.

### Recipe C — One region changes, UI scattered across several places refreshes together

Say "the serial port disconnected" has to affect the sidebar's connection row, a button in the Main Area, and the Status Bar's counter at the same time. **Publish one event and let each place subscribe on its own:**

```tsx
// Publisher (e.g. the sidebar view detects that the port dropped)
window.linkdesk.events.emit("my-plugin:connectionChanged", { portName, open: false });
```

```tsx
// Subscriber 1 — Main Area component
useEffect(() => window.linkdesk.events.on<{ open: boolean }>("my-plugin:connectionChanged", (p) => setOpen(p.open)), []);

// Subscriber 2 — Status Bar component (a different file, a different region; neither knows the other exists)
useEffect(() => window.linkdesk.events.on<{ open: boolean }>("my-plugin:connectionChanged", (p) => setText(p.open ? "Connected" : "Disconnected")), []);
```

> 🔴 **Channel names must carry a plugin prefix** (`<pluginId>:<dataName>`). All plugins share one renderer process, and channels are **visible pool-wide** — naming one `changed` will collide.

### Recipe D — The user changes a setting → every region follows immediately

```tsx
useEffect(() => {
  return window.linkdesk.configuration.onChange<number>("my-plugin.refreshInterval", (ms) => {
    restartTimer(ms);   // Sidebar, Main Area, and Status Bar each subscribe to the keys they care about
  });
}, []);
```

How to declare a setting and make it appear on the settings page → [20-Adding a Setting](20-adding-a-setting.md).

---

## 3. One Complete Small Example (three regions strung together)

Goal: select in the sidebar list → the Main Area switches over → the Status Bar shows the current item → the Title Bar button hides when nothing is selected.

```tsx
// ① src/views/SessionListView.tsx — Sidebar: the single place where "user intent" originates
export default function SessionListView() {
  const [sel, setSel] = useState<string | null>(null);

  const pick = (id: string) => {
    setSel(id);
    void window.linkdesk.contextKey.set("my-plugin.hasSelection", true);   // → Recipe B
    void window.linkdesk.tabs.openOrFocus("my-plugin", { sourceId: id });  // → Recipe A
    window.linkdesk.events.emit("my-plugin:selectionChanged", { id });     // → Recipe C
  };

  return <ul>{items.map((it) => <li key={it.id} onClick={() => pick(it.id)}>{it.name}</li>)}</ul>;
}
```

```tsx
// ② src/index.tsx — Main Area entry: only cares about sourceId, manages its own state
export default function MyView({ sourceId }: { sourceId?: string }) {
  return sourceId ? <Detail id={sourceId} /> : <Empty />;
}
```

```tsx
// ③ src/components/statusBar.tsx — Status Bar: subscribes to the event instead of asking "who selected it"
export default function StatusBar() {
  const [label, setLabel] = useState("");
  useEffect(
    () => window.linkdesk.events.on<{ id: string }>("my-plugin:selectionChanged", (p) => setLabel(`Current: ${p.id}`)),
    [],
  );
  return <span>{label}</span>;
}
```

```jsonc
// ④ plugin.json — the declarative side: each region in its place, the button carries a when
{
  "pluginId": "my-plugin",
  "appearsIn": { "iconBar": "top", "tabBar": true },
  "entry": "src/index.tsx",
  "contributes": {
    "viewsContainers": { "my-plugin": { "title": "Sessions", "location": "sidebar" } },
    "views": { "my-plugin": [ { "id": "sessions", "title": "", "render": "src/views/SessionListView.tsx", "order": 0 } ] },
    "titleBar": { "right": [ { "command": "my-plugin.rename", "icon": "codicon-edit", "when": "my-plugin.hasSelection" } ] }
  },
  "statusBar": [ { "id": "current", "label": "", "align": "left" } ]
}
```

---

## 4. Iron Rules and Anti-Patterns

| Don't do this | Why | Do this instead |
|:--|:--|:--|
| Register `events.on` / IPC listeners **at module top level** | Module level = runs on import = never cleaned up, becomes a zombie callback after unmount (hard constraint 19, mechanically caught by ESLint) | Put it in `useEffect` and return the unsubscribe function |
| Store "state passed across regions" in a `useRef` | Ref updates don't re-render → the UI drifts from the real state and only "jumps" when the next unrelated event fires (hard constraint 17) | Anything render-related goes in `useState` |
| Use `localStorage` / a global variable as the bus | Bypasses the shell's single channel; behavior across multiple windows / after unmount is unpredictable | `configuration` (when it must persist) or `events` (when it's just a notification) |
| Channel names without a plugin prefix | All plugins share one renderer process, and channels are globally visible | `<pluginId>:<dataName>` |
| `import` another plugin directly | Plugins don't know each other exists (the round-hall model) | Go through commands / events / context keys |
| Blank whole content blocks with `isActive` | Under keep-alive every tab stays mounted; conditional rendering loses state | `isActive` only gates side effects |
| Hand-roll a context menu to "string regions together" | Hard constraint: context menus are declarative (`contributes.menus` + `<ContextMenu>`) | See [05-UI Conventions](05-ui-conventions.md) |

---

## 5. Related Reading

| What you want to do | Read this |
|:--|:--|
| Which regions exist and how to get into them | [17-Region Map](17-region-map.md) |
| The full table of communication mechanisms (events / commands / data pipeline) | [07-Plugin-to-Plugin Communication](07-plugin-to-plugin-communication.md) |
| Naming and registration conventions for data pipeline commands | [14-Data Pipeline Command Conventions](14-data-pipeline-command-conventions.md) |
| `when` syntax and the shell's built-in context keys | [03-Contributes Spec §4](03-contributes-spec.md) |
| Adding a setting to your plugin | [20-Adding a Setting](20-adding-a-setting.md) |
| Every `window.linkdesk.*` method signature | [01-Plugin API Contract](01-plugin-api-contract.md) |
