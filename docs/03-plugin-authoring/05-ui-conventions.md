# Plugin UI Authoring Conventions

> **In one line: the core already provides the standard components and registries—don't hand-roll wheels. Hand-rolling = inconsistent style + something to tear out at the next normalization.**
> Skim this before writing a plugin, to avoid the same kind of rework.
> **Reconciled against the implementation on 2026-09-06**: flatten-to-single-root (no plugins/{builtin,user}) · shared controls go through @linkdesk/ui · distribution = `.linkdesk-plugin` zip. References to the corresponding mechanisms have been cleaned out of this page.

---

## 1. Context Menu → `<ContextMenu>` + MenuRegistry

**❌ Forbidden:** hand-writing `<div className="my-menu">` + `useState` + a click-outside listener.

**✅ Right:**
```json
// ① Declare the menu items—plugin.json contributes.menus (preferred, declarative)
{
  "contributes": {
    "menus": {
      "editorContext": [
        { "command": "myPlugin.copy", "group": "navigation" },
        { "command": "myPlugin.clear", "group": "edit" }
      ]
    }
  }
}
```

```tsx
// Dynamic registration at runtime (equivalent)—window.linkdesk.menu.registerItems(menuId, pluginId, items)
window.linkdesk.menu.registerItems("editorContext", "myPlugin", [
  { command: "myPlugin.copy", group: "navigation" },
  { command: "myPlugin.clear", group: "edit" },
]);

// ② Use the unified component—MenuId is an open string, so just write a string literal
<ContextMenu menuId="editorContext" />
```

**Rationale:** `<ContextMenu>` brings its own backdrop + four blur paths (Escape / backdrop click / window blur / option click) + keyboard navigation + when-condition filtering. You can't hand-roll those four blur paths.

**MenuId is an open string (`src/core/registry/commands/MenuRegistry.ts` `export type MenuId = string`)—a plugin declaring any string at all is the contract; no shell code change is needed.** Shell built-in registration points (the MENU_SLOTS constant table):

| MenuId (string literal) | Scenario |
|---|---|
| `commandPalette` | Ctrl+Shift+P command palette |
| `tabContext` | Tab Bar tab right-click |
| `panelViewContext` | Panel tab bar right-click (position/alignment submenu + view show/hide list) |
| `editorContext` | Tab page main content area right-click |
| `extensionGear` | Bottom gear menu (settings/command palette/theme picker) |
| `marketplaceItemGear` | Marketplace entry gear (enable/disable/uninstall) |
| `menuBar` | ☰ hamburger menu bar |
| `panel` | The "Panel" menu in the menu bar |
| `fileContext` | File tree right-click |
| `cardContext` | Card right-click |
| `quickSendContext` | Quick-send pill right-click |
| `iconBar` | Icon bar right-click |
| `settingItemGear` | Setting item gear (Settings Editor row hover) |
| `viewTitleContext` | Sidebar view title right-click (collapse/reset position/group the view) |

New context-menu scenarios → just declare a new open-string MenuId (e.g. `"myMenu"`): declare `contributes.menus.myMenu` + consume it with `<ContextMenu menuId="myMenu" />`—**zero shell changes** (the plugin-independence iron rule). The shell only needs to add a MENU_SLOTS entry if it wants to provide a unified render point for that scenario.

---

## 2. Overlays / Dialogs → `createPortal`

**❌ Forbidden:** a dialog nested deep inside a div in the component tree.

**✅ Right:**
```tsx
import { createPortal } from "react-dom";

return createPortal(
  <div className="my-dialog">{/* ... */}</div>,
  document.body  // ← the key: render into body
);
```

**Rationale:** under the keep-alive architecture inactive tabs are `display: none`, and children aren't visible even with `position: fixed`. Only rendering into `document.body` escapes the component-tree constraint.

---

## 3. Persistence → `window.linkdesk.configuration` (declared via plugin.json contributes.configuration)

**❌ Forbidden:** `localStorage.setItem()` / `PreferenceService.loadPrefs()` / hand-written file I/O / `import ... from "@src/core/..."`.

**✅ Right—go through `window.linkdesk.configuration` (plugin communication iron rule: only `window.linkdesk.*`, never `import` from @src/core):**
```tsx
// Read configuration (a Promise—the value is dynamic at runtime)
useEffect(() => {
  window.linkdesk.configuration.get<boolean>("myPlugin.showLineNumbers").then((v) => {
    setShowLineNumbers(v);
  });
}, []);

// Write configuration
await window.linkdesk.configuration.set("myPlugin.showLineNumbers", true);

// Subscribe to changes—returns an unsubscribe; call it on unmount
useEffect(() => {
  return window.linkdesk.configuration.onChange<boolean>("myPlugin.showLineNumbers", (v) => {
    setShowLineNumbers(v);
  });
}, []);
```

**Declaring configuration items in plugin.json:**
```json
{
  "contributes": {
    "configuration": {
      "title": "My Plugin",
      "properties": {
        "myPlugin.showLineNumbers": {
          "type": "boolean",
          "default": true,
          "description": "Show line numbers"
        }
      }
    }
  }
}
```

**Rationale:** the shell persists automatically + restores on restart + the Settings Editor renders it automatically. Hand-rolled localStorage → you lose Settings Editor integration + get the next persistence bug.

---

## 4. Keyboard Shortcuts → Two Tracks: Declarative (non-text keys) + Pool-side self-handling (text keys / focus-bound keys)

Shortcuts have **two tracks**, and which one you pick depends on the nature of the key. **Picking the wrong track = a dead key or a hijack of the whole pool** (lesson).

### 4.1 Track one: `contributes.keybindings` (visible in the settings panel)—**non-text keys only**

**❌ Forbidden:** putting **text-editing keys** such as `ctrl+c` / `ctrl+v` / `ctrl+x` / `ctrl+a` / `f2` into `contributes.keybindings`.

**✅ Right:** (non-text keys—such as `ctrl+k` / `ctrl+shift+e` / `f5`)
```json
{
  "contributes": {
    "keybindings": [
      {
        "key": "ctrl+k",
        "command": "myPlugin.clear",
        "when": "activeEditor == 'myPlugin'"
      }
    ]
  }
}
```

**Rationale (why text keys are a landmine):** declared/registered keys sync into the main-process keyCache → when `before-input-event` hits, the key is **swallowed unconditionally** (it doesn't respect when, doesn't respect an editable state, doesn't respect whether a handler even exists). Register one `ctrl+c` in the shell and you swallow the native `ctrl+c` of every input box / Monaco instance in the whole pool. The right answer for text keys = track two.

### 4.2 Track two: pool-side self-handling (container onKeyDown)—the right answer for text keys + focus-bound keys

**✅ Right:** a component handles its own keyboard interaction inside its own **container's `onKeyDown`**:

```tsx
<div
  tabIndex={0}          // makes the container focusable—clicking a child makes the browser give focus to the nearest focusable ancestor
  onKeyDown={(e) => {
    if (e.key === "F2") { e.preventDefault(); startRename(); }
  }}
>
  {items}
</div>
```

**Why this is the right answer:** every plugin in the pool shares one document—**DOM focus partitions naturally**. Only a focused container receives the key; a focused Monaco doesn't, and multiple plugins can each do their own `ctrl+c` without stepping on each other. No when needed, no conflict detection needed. File tree clipboard keys = the shared `useClipboardKeys` hook + the same command chain. Clipboard-related keys can reuse `src/pool/hooks/useClipboardKeys` (declarative `onCopy`/`onCut`/`onPaste` callbacks, one implementation and one fix location for the mechanism).

**❌ Anti-pattern (red flag):** `document.addEventListener("keydown", ...)` / `window.addEventListener("keydown", ...)` = **global hijack**—it bypasses the partitioning premise, and while the plugin has an active session it hijacks that key across the whole pool (serial F2 once hijacked the file tree's F2). **`tabIndex` + container `onKeyDown` is the right answer for focus partitioning**; non-focusable elements don't trigger it, so add `tabIndex={0}` to receive keys.

**Note:** track-two keys **do not appear in the keyboard shortcuts settings panel**—the panel only shows KeybindingRegistry bindings (track one). This is a design trade-off (registering means swallowing across the pool, see 4.1), not a bug.

### 4.3 Clipboard channel picker

| What you want to copy | Channel | Example |
|---|---|---|
| Text inside an editable element (input/textarea/Monaco) | **Browser native**—write nothing | Ctrl+C/V inside an input box |
| Arbitrary text | `window.linkdesk.clipboard.writeText` | Copy selected text to the system clipboard |
| File/path list | `window.linkdesk.clipboard.writeFileList` | File tree copy → pasteable in Explorer (CF_HDROP) |

**Note:** editable elements take the browser-native path—**don't** declare a shortcut and don't intercept it; Electron/Chromium wires up the system clipboard automatically.

---

## 5. Colors → CSS Variables `var(--xxx)`

**❌ Forbidden:** hardcoding `#0078d4` / `#1e1e1e` / `#ffffff`.

**✅ Right:**
```css
.my-element {
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border);
}
```

**Rationale:** after a theme switch hardcoded colors stay the same → under a dark theme you get white text on a white background. See `src/index.css` for all available CSS variables.

---

## 6. Text → `t()` Internationalization

**❌ Forbidden:** bypassing `t()` and hardcoding display strings (`<button>发送</button>` / `<button>Send</button>`).

**✅ Right:**
```tsx
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
<button>{t("发送")}</button>  // the i18n key = the plugin UI's source text (a Chinese plugin uses Chinese, an English/French plugin uses its own language)
```

---

## 7. Sidebar List Item Selection → `onMouseDown` (not `onClick`)

**❌ Forbidden:** using `onClick` to select items in a vertical Sidebar list.

**✅ Right:**
```tsx
<div
  className={`my-list-item${isActive ? " active" : ""}`}
  onMouseDown={() => onSelect(item.id)}
>
  <span>{item.label}</span>
</div>
```

**Rationale:** sidebar items sit vertically adjacent—on a fast click the mousedown lands on item A and the mouseup slides onto item B. Per the browser `click` event spec: when mousedown and mouseup land on different elements → click is dispatched to their common ancestor → React finds no handler on the ancestor → the event is silently lost. `onMouseDown` only cares about where the press happened and doesn't require the release on the same element—eliminating lost events on fast clicks.

**Aligned with VS Code:** the Explorer file tree selects files with `onMouseDown`, not `onClick`. This is a pattern validated by tens of millions of users; don't design your own.

**When it applies:** any clickable list in a Sidebar that is vertically arranged with small gaps between items—session lists, file trees, database connections, MQTT topics, device lists, and so on.

**Handling child elements:** action buttons/input boxes inside an item need `onMouseDown={(e) => e.stopPropagation()}` to avoid accidentally selecting the parent item:
```tsx
<button
  onMouseDown={(e) => e.stopPropagation()}
  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
>
  ✕
</button>
```

---

## 8. Plugin-Owned Data Models → `Emitter` Reactive Pattern

**❌ Forbidden:** mutating the model in a command handler and then manually calling `rerender()` / `setVersion()` / passing a `treeVersion` prop.

**✅ Right—the web-standard `EventTarget` (zero core imports; plugin-owned classes extend it directly):**
```typescript
class MyModel extends EventTarget {
  private _items: Item[] = [];

  add(item: Item): void {
    this._items.push(item);
    this.dispatchEvent(new CustomEvent("change"));  // ← dispatch at the end of every state-changing method
  }

  remove(id: string): void {
    this._items = this._items.filter(i => i.id !== id);
    this.dispatchEvent(new CustomEvent("change"));
  }
}
```

```tsx
// Subscribe on component mount, clean up on unmount
function MyView({ model }: { model: MyModel }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onChange = () => setVersion(v => v + 1);
    model.addEventListener("change", onChange);
    return () => model.removeEventListener("change", onChange);  // auto-unregistered on unmount
  }, [model]);

  const items = useMemo(() => computeItems(model), [model, version]);
  // ...
}
```

**Rationale:** three timing bugs (badge stuck at 0 / when stops working / refresh doesn't update the tree) all traced back to a module-level command handler mutating a mutable model, with React unable to perceive it. The model announces its own changes (`EventTarget`/`CustomEvent` are web standards; you don't need the shell's `Emitter`)—handlers only mutate the model and never touch React.

**When it applies:** a plugin has module-level command handlers that need to trigger a UI refresh after changing data.

**⚠️ Plugins must not `import { Emitter } from "@src/core/CoreEvents"`—that is a shell-internal implementation (plugin communication iron rule + ESLint `noCoreImportInPlugin` at error level). Plugin-owned models use the web-standard `EventTarget`; events between plugins, or between a plugin and the shell, go through `window.linkdesk.events` (see `07-plugin-to-plugin-communication.md`).**

---

## 9. System UI Overlays → linkdesk API (quickPick / notifications / dialog)

**❌ Forbidden:** hand-rolled picker overlays / `window.alert()` / `window.confirm()` / `import ... from "@src/core/..."`.

**✅ Right:**
```tsx
// Picker—window.linkdesk.quickPick.show({ items, placeholder, prefix })
const picked = await window.linkdesk.quickPick.show({
  placeholder: "Select target session",
  items: [
    { label: "Session A", description: "/dev/ttyUSB0" },
    { label: "Session B", description: "/dev/ttyUSB1" },
  ],
});

// Notification—window.linkdesk.notifications.show(message, { type })
await window.linkdesk.notifications.show("Connected", { type: "info" });
await window.linkdesk.notifications.show("Validation failed", { type: "error" });

// Confirm / alert / file picker—window.linkdesk.dialog
const ok = await window.linkdesk.dialog.confirm("Delete this session?");
await window.linkdesk.dialog.alert("Version conflict, skipped");
const file = await window.linkdesk.dialog.openFile({
  filters: [{ name: "DXF files", extensions: ["dxf"] }],
});
```

**Rationale:** all three are rendered uniformly by the in-pool host (QuickPickHost / **the bell wide notification panel** / DialogHost)—styles match the shell and scale with the theme and font size. Hand-rolled overlays = inconsistent style + `position: fixed` breaking under keep-alive. Full signatures are in `contracts/linkdesk.d.ts`.

> ⚠️ **Notifications are not "auto-vanishing floating cards"** (notification-surface unification and correction): the bottom-right narrow toast pipeline has been deleted entirely, and **the only notification surface = the status bar bell wide panel**. Three things authors need to know:
> 1. **Notifications don't pop a card, don't steal focus, and don't block interaction**—they go into the bell (unread count +1), and the user only sees them after opening it. Don't treat notifications as a "must be seen" channel: if the user has to decide on the spot → use `dialog.confirm` (modal, steals focus).
> 2. **Persistent notifications per source are quota-limited**—grouped by `options.source`, at most 5 persistent per group; beyond that, the oldest one from the same source is pushed out. A flood won't pile into a wall, but **don't count on notifications for long-term records either**.
> 3. **Keyboard reachability means "the panel is reachable", not "notifications are reachable"**—the bell can be focused and opened with the keyboard, everything inside the panel can be reached with Tab, and `Esc` closes it; but the panel **has no focus trap** (non-modal, focus can leave freely). **Don't write assumptions like "Tab gets you to my notification button"**—the user may never open the panel at all.

**Notification action buttons (`actions` on `notifications.show`):** failure / user-action-required notifications can carry an `actions` button array—clicking runs through the **command system** (modeled after VS Code's `showErrorMessage(msg, { title, command })` actions). Command handlers are registered by the plugin itself (`commands.registerCommand`):

```tsx
// Failure toast + [Retry]/[View dependencies]—command = a command the plugin registered itself
await window.linkdesk.notifications.show("Install failed: cannot connect to source", {
  type: "error", // error toasts linger 8s (enough to read the diagnostics); info/warning linger 6s
  actions: [
    { id: "retry", label: "Retry", isPrimary: true, command: "myplugin.retryInstall" },
    { id: "deps", label: "View dependencies", command: "myplugin.openDeps" },
  ],
});
// Commands can take arguments—clicking runs command(...args)
await window.linkdesk.notifications.show("Save conflict", {
  type: "warning",
  actions: [{ label: "Force save", command: "myplugin.saveForce", args: [filePath] }],
});
```

Button text = the final display text (the shell does not translate it a second time); `isPrimary: true` = primary button (accent), unset = secondary text button. **Not passing `actions` = no buttons today, zero behavioral change.** Full types are in `contracts/linkdesk.d.ts` (the `actions` of the `notifications.show` options).

**Progress notifications + persistent notifications + source identity:** `show` **always returns a handle** (it isn't only progress bars that get one). The three easiest things to get wrong:

```tsx
// ① Progress notification—the handle drives the same single notification (it won't spawn N of them)
const h = await window.linkdesk.notifications.show("Downloading…", {
  progress: true,          // turns on a real progress bar; not passing percent = indeterminate animation
  source: "myplugin",      // see ③
});
await h.update("Downloading…", 42);   // 0-100; passing only message keeps it indeterminate
await h.finish("Download complete");        // closes the progress bar, optionally adds a completion notification
// or await h.cancel();            // close it outright, no completion notification

// ② Persistent notification—doesn't auto-dismiss, waits for the user to click × (use for error diagnostics)
await window.linkdesk.notifications.show("Port is in use, please close other programs", {
  type: "error",
  persistent: true,
});

// ③ Source identity—the panel groups by it, 5 persistent slots per group
await window.linkdesk.notifications.show("Sync failed", { source: "myplugin" });
```

**Three things you must know:**

1. **The handle is the only key**: a notification **can only be updated/removed by the handle that created it**. A `show` with the same text elsewhere = another notification, and you can't retract theirs. To retract a persistent notification (e.g. a failed `persistent`), use its own handle or let the user click ×.
2. **`source` must be self-reported**: the pool is a single process sharing one realm, all plugins share the same `window.linkdesk`, and preload **cannot** know which plugin issued this `show` ⇒ only the author can pass it explicitly. **Not passing it → everything lands in the "Other" group**; plugins pass their own plugin id, and the shell's own domains use `app.<domain>`.
3. **`persistent` has a quota**: at most 5 persistent per group (by `source`); beyond that the oldest of the same source is pushed out and a summary hint is shown. **Persistent ≠ unlimited retention**—if you need retention, write your own file.

> The full **behavior contract** (not signatures—for signatures see `contracts/linkdesk.d.ts`) is in the `notifications` row of [`01-plugin-api-contract.md`](01-plugin-api-contract.md) §3.2—this section only covers usage, and that one is authoritative for semantics.

**Rich-content confirm dialogs (`dialog.confirmContent`):** use this when the confirm dialog needs **more than one line of text** (a form / list / screenshot / custom layout)—**the dialog is the shell (centered, masking, Esc, focus lock, click-mask to cancel) and your view draws the content** (modeled after VS Code's "the dialog is the shell, the plugin defines the content"):

```tsx
// 1) First declare the view for this content in plugin.json (any contributes.views container works)
// 2) In code, address and open it by the "declared id"
const ok = await window.linkdesk.dialog.confirmContent({
  pluginId: "myplugin",      // the plugin the content belongs to (the shell uses this for composite addressing)
  viewId: "myplugin.confirmImport", // declared id of the content view
  title: "Confirm import",          // fallback title—if the content view fails to resolve, the shell falls back to a plain-text confirm
  message: "3 entries will be overwritten",  // fallback body
  payload: { files: ["a.ts", "b.ts"] }, // opaque payload: the shell doesn't interpret it, your view reads it itself
});
if (ok) { /* user confirmed */ }   // false = cancelled / closed
```

The other half—the content view (**another view in the same code**, reading the payload and stating a verdict):

```tsx
// In your content view component—mounting opens it, reading once is enough (every new dialog is a fresh mount)
function MyConfirmContent() {
  const data = window.linkdesk.dialogHost.current();
  if (!data || data.open !== true) return null;        // defensive: don't render blank
  const payload = data.content?.payload as MyPayload;
  return (
    <div>
      {/* The body layout and the buttons are entirely yours to draw */}
      <button onClick={() => window.linkdesk.dialogHost.cancel()}>Cancel</button>
      <button onClick={() => window.linkdesk.dialogHost.confirm()}>OK</button>
    </div>
  );
}
```

**The fallback is hard**: if `viewId` can't be resolved (view not declared / the declaring plugin isn't installed) → the shell **falls back to a plain-text confirm** (using `title`/`message`), the dialog still appears and **never dies silently**. So don't skip `title`/`message`. The payload crosses IPC via structured clone, so only cloneable data can go in it (no functions/React elements). There are only two ways to settle: `dialogHost.confirm()` / `dialogHost.cancel()`—**don't close the dialog yourself with `setState`**; the shell won't recognize it.

---

## 10. Font Sizes → `--font-size-*` tokens + `--ui-scale` (measurement-system normalization)

**❌ Forbidden:** writing bare `px` for plugin text font sizes (`font-size: 14px`)—the `check-font-scale-audit` gate (`npm run check`) rejects it mechanically.

**✅ Right:** font sizes consume `var(--font-size-*)`; line-height is unitless (`1.5`) or `calc(... * var(--ui-scale))`; fixed upper bounds (input box/button/status bar heights) are written as `calc(Npx * var(--ui-scale))` to scale with the global setting. Unified global font-size scaling (the `app.uiFontScale` setting, 85–150%, always shown and always in effect).

**Scale table** (100% render = `--ui-scale: 1`; the engine computes the final px from the scale factor):

| Step | Base px | Meaning |
|---|---|---|
| `--font-size-2xs` | 11 | badges/paths |
| `--font-size-xs` | 12 | secondary text/buttons/stats |
| `--font-size-sm` | 13 | main UI text (aligned with VS Code's 13px) |
| `--font-size-md` | 14 | menus/tabs/file tree name |
| `--font-size-lg` | 16 | icon glyphs/content icons (paired with 14px text) |
| `--font-size-xl` | 18 | region titles |
| `--font-size-2xl` | 22 | row icons/large text |
| `--font-size-3xl` | 28 | pd-name |
| `--font-size-4xl` | 30 | welcome-title |

**Iron rules + boundaries (see the archive's §5 icon rulings / §6.2 monaco island decision):**
- **Standalone display icons do not scale with font size** (decorative/brand semantics, not directly adjacent to text)—`.icon-btn .plugin-icon--codicon` 24 / `.plugin-icon--emoji` 24 / `.hamburger-btn` 20 / hero-icon 48 / row icons 20, and so on; for whitelist exemptions see `scripts/check-font-scale-audit.mjs`.
- **Content-level font sizes go through `contributes.configuration`** (e.g. `editor.fontSize`)—large text areas/editor content are controlled by the plugin's own configuration and don't follow `--ui-scale`.
- **The monaco content island precedent**: editor content reads `editor.fontSize`, while chrome (status bar/breadcrumbs) follows the global setting—two orthogonal axes, each minding its own business.
- **Mapping rule**: migrating existing `NNpx` to the scale table goes "up one step"—`12→sm / 13→md / 11→xs / 10→2xs / 14→lg / 18→xl` (at 100% this enlarges to the new default baseline, aligned with VS Code).

---

## 11. The Token Contract—Six-Domain Matrix + Honest Boundaries + Data Discipline (.5)

> **In one line:** before writing UI, check the 11.1 six-domain matrix—forms/controls/surfaces written with `var(--*)` **follow the theme + glass + global scaling automatically**, with zero plugin awareness. Doing it right is driven by recommendations, doing it wrong shows red through the gate but only as a WARN, and bypassing it takes a knowing declaration via a standard eslint-disable (content/brand fixed colors are legitimately exempt—see 11.2).
> The gate = `linkdesk-plugin-sdk lint` (built into `@linkdesk/plugin-sdk`): the eslint rule leg + the three-check scanner leg, dual-track; all 15 items are **WARNs that never fail the build/upload**—advice, not a lockdown. Run it once at your project root; a violation shows red with self-explanatory fix text.

### 11.1 The six-domain token matrix—authors can only write "follows automatically" if they know what variables exist

| Domain | var() keys (the full list always defers to `src/index.css`) | How authors write it | Gate coverage |
|---|---|---|---|
| **Color** | `--text-primary/--text-secondary/--text-muted` (the text-color source is controlled by fontTone) + `--bg-window/--bg-side-panel/--bg-card/--bg-input/--bg-selection` + `--accent/--accent-hover` | `color: var(--text-primary)` | `linkdesk/no-hardcoded-hex` |
| **Surface** | `--bg-*` surface fills + `--surface-radius` (follows the shell's global corner-radius slider) | `background: var(--bg-card)` | `linkdesk/no-hardcoded-hex` |
| **Radius** | `--radius-xs/sm/md/lg/xl/2xl` + `--surface-radius` | `border-radius: var(--radius-md)` | `linkdesk/no-hardcoded-radius` (bare px in border-radius is red) |
| **Glass** | `--glass-blur/--glass-saturate/--glass-tint/--glass-morph/--glass-specular…` (the full group in `src/index.css`) | `backdrop-filter: blur(var(--glass-blur)) …` | contract guidance—composite forms are beyond per-item gating |
| **Font size** | `--font-size-2xs … 4xl` + `--ui-scale` (the scaling axis for `app.uiFontScale`; the scale table is in §10) | `font-size: var(--font-size-md)` / em/rem | `check-font-scale` (the check leg—a bare px font size is red) |
| **Font family** | `--font-ui` / `--font-mono` | `font-family: var(--font-ui)` | contract guidance (authors may legitimately choose their own font) |

`var(--*)` = theme/glass/global scaling follow automatically, with zero plugin awareness—**this is exactly why the @linkdesk/ui control layer can be "follow without thinking"**—the controls are written entirely on tokens, so a plugin that does `npm i @linkdesk/ui` and consumes them follows along. Control reuse always imports from `@linkdesk/ui` (see §Quick Reference)—don't hand-roll wheels.

### 11.2 Honest boundaries / knowing bypasses—content and brand colors can have their own sky

**Three gate tiers (07 §6):** recommended (copy it and you're right) / warning (15 self-explanatory items, red but **a WARN never fails**) / knowing bypass (a standard eslint-disable declaration with a reason). **No ecosystem can stop an author from hardcoding colors**—VS Code also has extensions that don't follow the theme. What the gate does is make "doing it right" the default and "doing it wrong" explicitly red but **knowingly bypassable**: a comment carrying a reason = the "proceed anyway" informed confirmation on a browser danger page, not silently switching off the light.

**Legitimate exemption categories:** var() fallback hex (`color: var(--x, #fff)` = a compliant form, not blocked) / color-picker swatches / canvas drawing / engine regions / **view-level exemption for content canvases**.

**The content vs. chrome boundary (empirically validated by the Angry Birds test):** a game / data visualization / canvas Main Area = **a content world, not UI chrome**—UI chrome follows the theme (var()/t()/@linkdesk/ui), while content can have its own sky (grass green / health-bar red / sky blue need not follow the theme). Authors **declare a view-level exemption once**, and the gate doesn't light up item by item inside content regions (item-by-item disables for the 5-10 hardcoded values in a game are far too noisy):

```tsx
/* eslint-disable linkdesk/no-hardcoded-hex, linkdesk/no-hardcoded-radius -- content canvas: the game main area draws itself */
export function GameBoard() {
  return <canvas /* draws blue sky, green grass, red health bar—a content world, not UI chrome */ />;
}
```

```tsx
// Line-level knowing bypass (a brand fixed-color badge—exempts only this line, other lines are still blocked)
// eslint-disable-next-line linkdesk/no-hardcoded-hex -- brand fixed-color badge
const PRO_BADGE = <span style={{ color: "#ff6b00" }}>PRO</span>;
```

```css
/* The same format in CSS (the check script recognizes it)—a color-picker swatch with a fixed value, exempt on this line */
/* eslint-disable-next-line linkdesk/no-hardcoded-hex -- color-picker swatch */
.swatch--brand { background: #ffd700; }
```

**Semantics:** a line that hits an exemption goes **entirely silent** and doesn't light up (aligned with eslint's native suppress—after a disable declaration nothing is reported item by item); **no declaration = an unhandled deviation**, and `linkdesk-plugin-sdk lint` reports it with a normal WARN. **This is not new syntax**—it's the same format as the shell's existing `no-hardcoded-hex` error suggestion. **Backgrounds not being glassed holds inherently at the mechanism layer**—backdrop-filter only paints shell surface elements and is not applied to a plugin view's root node, so content the author draws is simply never glassed.

### 11.3 Non-CSS engine adaptation—the translation bridge (self-rendering engines don't use CSS variables)

monaco-style self-rendering engines (canvas / WebGL / rich-text engines likewise) don't consume CSS variables—following the theme requires a **translation bridge**: subscribe to theme changes → translate into the engine's own theme API. Precedent: `src/services/theme-sync.ts` (it lives in **the editor plugin's own repo**, `Encaron/linkdesk-plugin-editor`—shipped plugin source is not in the shell repo):

```ts
// Subscribe to theme changes (the event may fire before mount → register at top level or guard on active, see 11.5)
const off = window.linkdesk.events.on("theme:changed", () => {
  engine.updateTheme(translateTheme()); // translate your tokens → the engine's theme object
});
```

monaco's current opaque background and two-state (light/dark) following is **a transitional workaround, not a settled boundary**—full theme adaptation may come later.

### 11.4 Plugin-private data channels—choosing a channel when you build your own settings UI / manage your own saves

When authors build their own settings UI or manage their own saves (without going through a shell settings-page declaration), pick the data landing spot by semantics:

| Channel | Good for | Example |
|---|---|---|
| `window.linkdesk.pluginState` (**preferred**) | plugin-managed saves—centralized caching + file persistence (a proper API: `get/set/onChange(pluginId, key)`) | game score / level progress / high-score board / skin preference |
| `window.linkdesk.configuration.set(key)` private namespace | follows settings semantics, readable by other plugins/themes, **must appear in the shell settings-page UI** (declaring contributes.configuration puts it there) | plugin parameters (declared = UI; undeclared = a purely private key that still persists when written) |
| `window.linkdesk.filesystem` | large files / binary / cross-plugin sharing | screenshot export / save files |
| `localStorage` | supplementary—in-pool temporary cache (no cross-machine, no shell management) | high-frequency temporary values within a session |

**Iron rule: private keys that don't declare `contributes.configuration` do not appear in the shell settings-page UI**—`config.set` writes and persists even without a schema (only enums get filtered), so authors who want the shell settings page declare a contribution, and those who want their own UI write private keys directly; the two don't interfere.

### 11.5 Shell-discipline handoff list—each non-UI discipline sinks into the doc where it lands

| Discipline | Where it's specified |
|---|---|
| The plugin's only entry is `window.linkdesk.*`; **importing @src/core (including any @src subpath) is forbidden** | `01-plugin-api-contract.md` |
| Configuration: **subscribe, don't read once** (linkdesk.configuration is event-driven) | §3 of this file |
| linkdesk.events subscription **timing**—the event may fire before mount (IPC buffering) → register at top level or guard on active | `02-plugin-lifecycle.md` |
| **Don't hardcode other plugins' IDs** (differential behavior goes through plugin.json declaration fields, consumed via the Registry pattern) | `03-contributes-spec.md` |
| Configuration keys **must have a default** | `06-plugin-json-spec.md` |
| **Use only documented API namespaces** (don't casually hang undocumented `linkdesk.xxx` off the API) | `01-plugin-api-contract.md` |
| Controls always come from `@linkdesk/ui` (built-in controls are imported from the npm package; `@src/components/shared/*` is forbidden) | §Quick Reference of this file |

---

## 12. CSS Class Names—Prefix Your Own Elements; Don't "Borrow" Reserved Names

**One thing to remember first: the plugin view's stylesheet is not yours alone.** The same window loads the
host's styles, the shared components' (`@linkdesk/ui`) styles, and **every loaded plugin's** styles at once —
**class names are global identifiers**. Writing a class name claims that name; if someone else uses it too,
both stylesheets land on the same element.

**Three rules:**

1. **Class names you give your own elements must start with your `pluginId` plus a hyphen**—
   `settings-*`, `editor-*`, `file-tree-*` … (`pluginId` is the id you declare in `plugin.json`; every
   official plugin does this). **Don't use abbreviations**: the `ms-` / `mpd-` shorthand style is **retired**—
   an abbreviation guarantees nothing, and two plugins that each abbreviate to `ms-` collide. `pluginId` is
   unique by construction (immutable once published), so deriving the prefix from it is free collision
   protection.
2. **`@keyframes` names take the prefix too** (`file-tree-fadeIn`), and **rename the `animation:` reference in
   the same edit**—a keyframe name is a global identifier exactly like a class name: on a collision the later
   definition wins and the earlier animation silently stops.
3. **These names are reserved by the host—don't use them for your own elements** (if you do, the host's
   styles will hit you):

| Source | Reserved names | Notes |
|---|---|---|
| The input-box utility the host **gives you** | `.ldk-input` | Input-box utility—**just use it** (it exists for your inputs). ⚠️ It is the **one** name in the whole `ldk-` family you're encouraged to **consume** (every other `ldk-` name means "hands off"; this one means "take it") |
| Shared component classes + host container classes | **the whole `ldk-` namespace**—today: `ldk-badge`, `ldk-button`, `ldk-combobox`, `ldk-mdv`, `ldk-selectbox`, `ldk-sle`, `ldk-slider`, `ldk-toggle` (shared components), plus the host's own container classes such as `ldk-titlebar`, `ldk-input`, `ldk-setting-group` | Class names of the badge / button / combobox / Markdown container / select / string-list editor / slider / toggle components in `@linkdesk/ui`. **You don't have to memorize them**—remember one thing: **anything starting with `ldk-` belongs to the host itself (shared components + host UI containers), so don't put it on your own elements** (the one exception is `.ldk-input` on the row above: that one is **for you**) |

**`@keyframes` names work the same way**—the host already uses the animation names below, so avoid them when naming your own animations. A collision has the same consequence as a class name (the later definition wins, the earlier one is dropped), and it is equally **silent**: one of the two animations simply stops playing, with nothing in the console.

| Reserved keyframe names | Notes |
|---|---|
| `ldk-selectbox-in` | the shared select dropdown's entrance animation |
| `ldk-drop-zone-in` | the drop zone's entrance animation |
| `ldk-dropdown-card-in` | the dropdown card's entrance animation |
| `ldk-floating-panel-in` | the floating panel's entrance animation |
| `ldk-group-tab-enter` | the group tab's entrance animation |
| `ldk-group-tab-exit` | the group tab's exit animation |
| `ldk-notif-icon-spin` | the notification icon's spin |
| `ldk-notif-progress-scan` | the notification progress scan |

**The name you reference has to exist somewhere**—rule 2 above says "when you rename, change the reference in
the same commit"; this is the other half, and **the machine checks it**: the name you write in
`animation` / `animation-name` must either be defined by an `@keyframes` **in your own CSS** or be one of the
names in **the reserved table above** (referencing the host's animations is **legitimate consumption**—you will
not be flagged). Reference a name **nobody defined** and the animation **reports nothing, warns nothing, it
just does not run**—the symptom is "why isn't my animation working", while the console stays silent (other
plugins and the host are running in the same window, so it is hard to spot at a glance).
From `@linkdesk/plugin-sdk` **≥ 0.1.37**, the plugin lint reports these **dangling references** one by one
(**file name + line number + the name**); if you genuinely need a name the gate cannot see (say the animation
is injected at runtime), use a standard `eslint-disable` comment stating why.

> 🔧 **Maintainer note (authors can skip this)**—the **Reserved names** and **Reserved keyframe names** columns in the two tables above are **machine-read**: the gate
> in `npm run check` (`scripts/check-reserved-names-doc-sync.mjs`) cross-checks them **both ways** against the
> registry `packages/plugin-sdk/schemas/reserved-class-names.json`—every registry name must appear here, and
> every name here must either be registered (bare names) or a real `ldk-` name present in the host source.
> The keyframe table is cross-checked **both ways** against the registry's `keyframes` array in the same way.
> ⇒ **Editing these two columns is a public-surface change**: add/remove a name in **three places in one commit**—
> the registry plus these two tables in both language trees. Both columns hold **names only**; put prose in
> the "Notes" column.

**One more namespace rule**: your `pluginId` **must not start with `ldk-`**—the whole `ldk-` namespace belongs
to the host, so a plugin called `ldk-tools` would derive its prefix (`ldk-tools-*`) **straight into host
territory**, which also makes rule 1 meaningless. This constraint lives in the `plugin.json` schema, so your
editor flags it immediately.

**Want their look? Use their component**—`import { Button } from "@linkdesk/ui"`, don't hand-write its class
name (hand-writing bypasses the component, and you fall behind the moment it changes).

**Always use state classes in compound form**: `.your-class.active`, `.your-class.on` (never bare
`.active {}` or `.on {}`—that would also restyle same-named state elements in the host and in other plugins).

**A real example from this project**: using a host-reserved name as a "handy style name" on your own element
painted the background and the text the same color, so the text was swallowed by its own background — the UI
just looked like "a solid block". **No error**, just wrong, and hard to trace.

### 12.1 Upgrading from an older `@linkdesk/ui`—the one thing you have to change yourself

Shared component class names now carry an `ldk-` prefix (as of `@linkdesk/ui` **0.2.0**). This affects exactly
one kind of code: rules in **your own plugin's CSS** that use a descendant selector to fine-tune a shared
component. **Nothing to do before you upgrade; when you upgrade, it's one prefix.**

- **When it hits you**: after `@linkdesk/ui` moves to **0.2.0**—**not before**. In older versions these
  components' class names were bare (`.badge`), and the CSS shipped inside the package is consistent with the
  components, so **if you don't upgrade, nothing breaks**. (A `^0.1.x` range will not cross over to `0.2.0` by
  itself, so this only comes up on the upgrade you perform deliberately.)
- **What is affected**: descendant selectors in **your own plugin CSS** such as
  `.control-bar .combobox { … }`, `.settings-slider-control .slider { … }`, `.changelog .mdv { … }`.
  **The components' own styles are unaffected, and your own class names don't change.**
- **How to fix it**: add the `ldk-` prefix to **the part of the selector that points at the shared component**—
  `.combobox` → `.ldk-combobox`, `.slider` → `.ldk-slider`, `.mdv` → `.ldk-mdv`, `.badge` → `.ldk-badge`,
  `.selectbox-trigger` → `.ldk-selectbox-trigger`, `.combobox-field` → `.ldk-combobox-field`. **Family names
  (suffixes like `-trigger` / `-field` / `-input`) take the prefix too.** Your own prefixes (`.control-bar`,
  `.settings-*`) stay as they are. **After upgrading, grep your CSS for the eight old base names
  `.badge`, `.button`, `.combobox`, `.mdv`, `.selectbox`, `.sle`, `.slider`, `.toggle`**: add the prefix where
  the rule tunes a shared component, leave the rest alone.
- **Why it isn't automatically compatible**: this kind of mismatch **raises no error**—a selector that no
  longer matches simply stops applying, so the UI looks "roughly right, just a bit off". Because it is silent,
  we moved the names under the `ldk-` prefix and wrote this section.

### 12.2 The prefix rules (§12 rules 1 and 2) are live—what about existing code?

**In one line: it keeps working unchanged, but the next time you touch that file is when you fix it.**

- **The official plugins have already been cleaned up under the new rules**—four plugins were renamed:
  `file-tree` (v1.0.9), `settings` (v1.0.11), `serial-monitor` (v1.0.12) and `marketplace` (v1.0.33); their
  bare class names and keyframe names now carry the `<pluginId>-` prefix. The remaining official plugin repos
  had no bare definitions to begin with (their class names either already carry a prefix or they define none).
  Measured against the official catalog, the audit reads **18/18 compliant**.
- **Third-party authors have no repository to change**: this rule governs only **the class and keyframe names
  you write yourself**—it doesn't touch repo layout, your `pluginId`, or anyone else's code. You do **not**
  need to cut a release for it.
- **Old unprefixed class names raise no error and don't stop working**—they work fine today. The cost is that
  **the collision risk is still there**: if another plugin defines the same class name, both stylesheets land
  on the same element (no error, just wrong-looking, and hard to trace).
- **Compliance is judged by the check that ships with your project**: a scaffolded project carries a strict
  check leg (`npm run verify`) that scans your CSS for class names **bare-defined on your own elements** and
  for `@keyframes` names, and fails them when they don't start with `<pluginId>-`. So the real action is
  **rename them the next time you open that file**: `.panel {}` → `.myplugin-panel {}`, changing the CSS and
  the JSX that uses it together (identifiers only—don't touch style values).

> Want to see whether your project has bare names right now? Run `npm run verify` in the project root.

### 12.3 The host's input-box utility was renamed: `.input` → `.ldk-input` (2026-09-16)

**In one line: if your plugin wrote `className="input"`, change it to `className="ldk-input"`—the styling is identical, only the name changed.**

- **What changed**: the host used to call its input-box utility **`.input`** (no prefix—the only host public name without `ldk-`). That conflicted with rule 1 above ("every cross-party name carries a namespace") ⇒ it is now **`.ldk-input`**. The host's **setting-group card**, `.setting-group`, was renamed to **`.ldk-setting-group`** at the same time.
- **Who is affected**: **any plugin that wrote `className="input"` in its own JSX/TSX**—among the official plugins, `settings` and `serial-monitor` used it and were updated in the same release batch. **The fix is one place**: `className="input"` → `className="ldk-input"`; the same for concatenated forms (`"input my-input"` → `"ldk-input my-input"`). **Zero styling change**—same rule, same CSS variables, only the name.
- **What happens if you don't**: the input doesn't error; it simply **loses the host-provided appearance** (background / border / radius / padding) and looks like a browser-native input.
- **When you must change it**: as soon as you run on the **new shell**. The new shell version is **`0.2.0`**, and both official plugins now declare `minAppVersion: "0.2.0"` in `plugin.json`—declare the same value in your plugin and users on an older shell get a clear "requires app version ≥0.2.0" message instead of an unstyled input (see [04-distribution-format §minAppVersion](04-distribution-format.md) for the semantics).

### 12.4 The rest of the shared components' class names took the `ldk-` prefix too (2026-09-16)

**In one line: same story as 12.1, just for the components that 12.1 didn't cover—if your own CSS tunes those components with descendant selectors, add the `ldk-` prefix when you upgrade.**

- **What changed**: §12.1 covered the eight base names of `@linkdesk/ui` (`badge` / `button` / `combobox` / `mdv` / `selectbox` / `sle` / `slider` / `toggle`) at **0.2.0**. The remaining components' class names—plus one `@keyframes` name—now carry the prefix too, at **`@linkdesk/ui` 0.3.0**:

  | Old family | New family |
  |---|---|
  | `.colorpicker-*` | `.ldk-colorpicker-*` |
  | `.ctx-*` | `.ldk-ctx-*` |
  | `.form-row` | `.ldk-form-row` |
  | `.inline-input`, `.inline-input--compact/--normal` | `.ldk-inline-input`, `.ldk-inline-input--compact/--normal` |
  | `.number-input*` | `.ldk-number-input*` |
  | `.segmented-radio`, `.segmented-radio__option/__label` | `.ldk-segmented-radio`, `.ldk-segmented-radio__option/__label` |
  | `.sidebar-section*`, `.sidebar-pane-view`, `.sidebar-pane-sash` | `.ldk-sidebar-section*`, `.ldk-sidebar-section-pane-view`, `.ldk-sidebar-section-pane-sash` |
  | `.theme-picker*`, `.theme-card`, `.theme-preview` | `.ldk-theme-picker*`, `.ldk-theme-picker-card`, `.ldk-theme-picker-preview` |
  | `.tbadge` / `.tname` / `.pv-bar` / `.pv-dot` (theme-card internals) | `.ldk-theme-picker-badge` / `.ldk-theme-picker-name` / `.ldk-theme-picker-preview-bar` / `.ldk-theme-picker-preview-dot` |
  | `@keyframes selectbox-in` | `@keyframes ldk-selectbox-in` |

- **Who is affected**: again **only your own CSS**'s descendant selectors that point at those components (e.g. `.settings-row:has(.theme-picker)`). **The components' own styling does not change, and your own class names stay as they are.** The whole point is that the shared components' names now all live in the `ldk-` namespace, whose rule you already know: **anything starting with `ldk-` belongs to the host—don't put it on your own elements** (the one exception is `.ldk-input`, the utility that is **for you**).
- **What happens if you don't**: exactly the silent failure described in 12.1—the selector just stops matching and those few rules quietly stop applying. **No error.**
- 🔴 **Whenever the host renames a shared name, there are always two steps on your side: ① bump the `@linkdesk/ui` dependency, ② rebuild (repack) your plugin.** The dependency is **inlined into your bundle** (it is not resolved at runtime), so step ① without step ② changes nothing—the package still ships the old set of names. That is the only reason a plugin can lag behind a host that was fixed long ago.
- **When you must change it**: when you move to **`@linkdesk/ui` 0.3.0**. `^0.2.0` does not resolve `0.3.0` (that's how 0.x ranges work), so nothing breaks until you upgrade deliberately. **Grep your own CSS for the old names** after upgrading: an official plugin (`settings`) had exactly one such spot and it was fixed in the same release batch.

### 12.5 The **scope** of custom properties—`--x:` written under `:root` is written for the whole application

The three rules above govern **names**; this one governs **territory**. For custom properties (`--xxx`) there is exactly one rule:

> **Scope is the namespace.** The name is yours to choose; **which subtree it lives in** is what decides who it belongs to.

**① Document-level scope is the host's alone.** Declarations on `:root` / `html` / `body` / `[data-theme="…"]` / `*` are **visible to the entire document**—that is not your territory:

```css
/* ❌ this declaration is visible to the whole document */
:root { --my-panel-gap: 8px; }

/* ✅ hang it under your own root class: scope = your subtree */
.my-plugin-root { --my-panel-gap: 8px; }
```

**② Every other declaration hangs under one of your own classes.** Write `.your-class { --xxx: … }`—and note that **the name needs no prefix there**: a `--gap` under `:root` collides with someone else's, a `--gap` under `.my-plugin-root` cannot (the scope has already divided the territory).

**③ Nobody may define a `--ldk-*` custom property** (same rule as class names and keyframes—the whole `ldk-` namespace belongs to the host).

**Why this is nastier than a class-name collision**: most of the host's colors / radii / z-index layers are **provided by its stylesheets rather than written by code**. Write one of the host's contract names (say `--bg-card`) under `:root` and **you win**—the whole application's card background follows your value. And **switching themes may switch it back** (a theme overrides some of those names) ⇒ the symptom is "**works sometimes, breaks sometimes**", the hardest kind to diagnose.

**One self-check** (glance at it when your CSS is done): **"is my `--x:` written under `:root`?"** If yes ⇒ move it under your own root class.

**Migrating**—plugins that already define custom properties under `:root`:

| Case | Level | What to do |
|---|---|---|
| Name **carries** your own prefix (`--my-plugin-gap`) | 🟡 suggested | Move it under your own root class. The name is yours and nobody competes for it, but there is no reason for it to sit under `:root`—after the move its scope shrinks from the whole document to your own subtree |
| Name **carries no** prefix (`--gap`, `--bg-card`, …) | 🔴 required | It is live document-wide right now and may already be overriding the host's or another plugin's value ⇒ move it under your own root class (the name may stay as it is; **what changes is the scope**) |
| Name starts with `ldk-` | 🔴 required | Give it one of your own names—`ldk-` is the host's namespace |
| Written **under your own root class** | ✅ compliant | Nothing to do. Fine-tuning like `.your-root .ldk-x { --y: … }` is compliant too (one of your own classes appears in the selector) |

**How it is enforced mechanically**: run `npm run lint` in the plugin project root (or `npm run verify` in CI) and each occurrence is reported—🔴 turns CI red, 🟡 only prints. When "it works locally but CI is red", read this section first.

> 🔧 **Maintainer note (authors may skip)**: the rule text (including how the host registers its contract blocks and the floating-layer host exception) lives under `docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/`; the shell side is guarded by `scripts/check-css-namespace.mjs`, the plugin side by the SDK's `check-css-namespace` leg (token scope is the third criterion of that same leg, sharing one disable-comment id with the class-name and keyframe criteria).

### 12.6 The selector itself needs a "landing spot" too—**anchorless selectors are forbidden** (2026-09-16)

The five sections above govern **names** (class names / keyframes / custom properties). This one governs the **shape of the selector**—a rule that is even easier to overlook:

> **Class names and ids are "name anchors"; element / universal / attribute / pseudo-class / pseudo-element selectors are not.**
> The latter hit other people's elements **without sharing a single name with anyone.**

```css
/* ❌ one rule rewrites *every* button in the document—including the host's and other plugins' */
button { border: none; }
* { box-sizing: border-box; }
#some-id { display: none; }   /* an id is global and guessable too, and outranks classes */
:root { outline: none; }      /* `:root` is an anchorless selector as well */

/* ✅ hang it under your own root class—same intent, landing spot limited to your own subtree */
.my-plugin-root button { border: none; }
```

**Two rules** (both are **mechanically red** in `npm run lint` at the plugin project root / `npm run verify` in CI):

| Rule | Verdict | Why |
|---|---|---|
| **No anchorless selectors** | The selector has **no** `.class` or `#id` subject (element / universal / attribute / pseudo-class / pseudo-element; **top-level *and* qualified, including inside `@media`**) ⇒ 🔴 | It hits "every element of that kind in the document", regardless of who rendered it |
| **A cross-party hit must carry your own anchor** | The selector mentions an `ldk-*` class (**including a mention inside `:has(…)`**) but does **not** carry a `.<your pluginId>-*` class ⇒ 🔴 | `ldk-` is the host's namespace; **fine-tuning has to happen on your own territory** |

⚠️ **The second rule does not forbid restyling shared components**—that is a **legitimate feature** (scoped tuning). It only requires you to **carry your own prefix as the anchor**:

```css
/* ❌ targets the host's / shared components' elements with no landing spot of your own ⇒ red */
.ldk-toggle { transform: scale(1.1); }

/* ✅ the same intent, written on your own territory ⇒ compliant */
.my-plugin-root .ldk-toggle { transform: scale(1.1); }
```

**Why it is worth remembering**: the host itself has **17** such "anchorless selectors" (`*` resets / `html`·`body` / `[data-theme]` / `*:focus-visible` / the scrollbar family / `input[type="number"]`·`select`)—they are a **deliberate shared baseline** that plugins rely on (and may override). Precisely because they exist, **your anchorless selector will hit them**: write `button { }` and the host's buttons plus every other plugin's buttons change with it.

**Migration**: **zero instances today**—a full re-check of the 18 official plugins plus the in-repo fixtures (the "anchorless S2 / cross-party S3" columns of `npm run audit:plugin-prefix -- --all`) is **0** ⇒ **you have nothing to change**; this rule is **preventive**.

> 🔧 **Maintainer note (authors may skip)**: the rule text (R0 scope / R1 host baseline / R2 / R3) plus the decision formulas and negative controls live in `docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/32-任务-选择器形态轴门禁与落地.md`; the host side is guarded by criteria ⑩⑪ of `scripts/check-css-namespace.mjs` (plus the runtime mirror on axis ④ of the probe), and the plugin side by the **fourth and fifth criteria** of the SDK's `check-css-namespace` leg (`checks/selector-form.ts` for S2/S3, and `checks/keyframe-refs.ts` for dangling keyframe references—the latter in place since **2026-09-18**, SDK `≥ 0.1.37`).

---

## Quick Reference

| What you want to do | Core facility | How to bring it in |
|---|---|---|
| Context menu | `<ContextMenu>` (open-string menuId) | `@linkdesk/ui` (ContextMenu) + a `plugin.json contributes.menus` declaration (or `window.linkdesk.menu.registerItems`, see §1) |
| Overlay/dialog | `createPortal` | `react-dom` (render into `document.body`, see §2) |
| Persistence | `window.linkdesk.configuration.get/set/onChange` | plugin communication iron rule—only `window.linkdesk.*` (see §3) |
| System picker | `window.linkdesk.quickPick.show` | uniform rendering by the in-pool QuickPickHost (see §9) |
| Notifications | `window.linkdesk.notifications.show` | uniform rendering by the in-pool **bell wide notification panel** (see §9; semantics in `01-plugin-api-contract.md` §3.2) |
| Confirm/alert/file picker | `window.linkdesk.dialog.confirm/alert/open/openFile` | uniform rendering by the in-pool DialogHost (see §9) |
| Rich-content confirm | `window.linkdesk.dialog.confirmContent({ pluginId, viewId, payload })` | the in-pool DialogHost renders the shell, **the content = a plugin-drawn view** (see §9) |
| Shortcuts (non-text keys) | `plugin.json contributes.keybindings` | — (putting text keys here = swallowing the whole pool, see §4.1) |
| Shortcuts (text keys / focus-bound keys) | container `onKeyDown` + `tabIndex` | pool-side self-handling, see §4.2 (document/window keydown is forbidden) |
| Colors | CSS variables | `var(--xxx)`, list in `src/index.css` |
| Font sizes | CSS variables | `var(--font-size-*)` + `--ui-scale`, bare px forbidden (gate, see §10) |
| Six-domain token overview | see the §11.1 matrix | color/surface/radius/glass/font size/font family—`var(--*)` follows theme+glass+scaling automatically; full list in `src/index.css` |
| UI discipline gate | `linkdesk-plugin-sdk lint` | all 15 items are WARNs that never fail; a knowing bypass = a standard eslint-disable declaration (see §11.2) |
| Text | `t()` | `useTranslation()` from `react-i18next` |
| CSS class names / state classes | own prefix + host reserved-name list | see §12 (class names are global—all plugins share the document with the host) |
| Element / id selectors | must hang under your own root class | see §12.6 (an anchorless selector hits everyone's elements, name or no name) |
| Sidebar list selection | `onMouseDown` (not `onClick`) | aligned with VS Code Explorer—prevents lost events when a fast click crosses elements |

**Use these facilities when writing plugins; don't hand-roll. Even if you write one, it'll have to be torn out later—better to normalize from day one.**
