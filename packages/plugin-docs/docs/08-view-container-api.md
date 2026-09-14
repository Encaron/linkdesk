# 08 — The ViewContainer API

> 2026-07-30 · full update 2026-08-21. **How plugins register sidebar/panel views.** Aligned with VS Code's `contributes.viewsContainers` + `contributes.views`.
> Every plugin with a sidebar (file-tree/marketplace/serial-monitor) goes through this API. Panel views (`location: "panel"`) use the same mechanism.
> **2026-09-06 reconciliation against the implementation** (audit): flattened single root (no plugins/{builtin,user}) · shared widgets live in @linkdesk/ui · distribution = a .linkdesk-plugin zip. The corresponding mechanism references on this page have been cleaned out.

---

## 1. Concepts

```
┌────────────────────────────────────────┐
│ Sidebar (SidebarZone)                  │
│ ┌────────────────────────────────────┐ │
│ │ Explorer       [◀ Collapse][+][🔄] │ │ ← container header (ViewContainer.title) + titleActions
│ ├────────────────────────────────────┤ │
│ │ ▶ FOLDERS                          │ │ ← view (SidebarSection — independently collapsible)
│ │    src/                            │ │
│ │    docs/                           │ │
│ │                                    │ │
│ │ ▶ OUTLINE  (language plugin)       │ │ ← a view registered by another plugin — file-tree knows nothing about it
│ │    functionA()                     │ │
│ │                                    │ │
│ │ ▶ TIMELINE (Git plugin)            │ │ ← yet another plugin's registered view
│ │    M  modified.ts                  │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Bottom Panel (PanelZone)               │  ← containers with location: "panel" render here
│ ┌─────────┬─────────┐                  │
│ │ Output  │ To-do   │                  │  ← panel tab bar (switcher) + the active view's titleActions
│ └─────────┴─────────┘                  │
└────────────────────────────────────────┘
```

- **ViewContainer** = one "channel" of the sidebar/panel. Click the icon in the icon bar to switch. Examples: `explorer` / `marketplace` / `serial-monitor` / `panel-demo`.
- **View** = one collapsible section inside a container. Examples: `folders` / `sessions` / `settings`.
- **Any plugin** can register views into someone else's container. The container's owner neither knows nor cares.
- **Where it renders is decided by `location`**: `"sidebar"` → the left sidebar SidebarZone; `"panel"` → the bottom panel PanelZone (the tab bar switches views); `"auxiliarybar"` → the right auxiliary sidebar RightSidebarZone — ⚠ **not wired up in the shell today (it does not render; the region is dormant)**: declaring an auxiliarybar container/view = no surface, nothing visible. For third-party sidebar/panel needs use `"sidebar"`/`"panel"`. Every region renders views with the same `PoolSectionStack` (SidebarSection is wrapped automatically).

---

## 2. Declarative registration — plugin.json (the right way)

**🔥 Every view must be declared in plugin.json.** `render` is a component module path string — the loader loads the component and registers it into the shell. **The `render` field is a function/component and cannot cross IPC** — a render passed to the runtime `registerView` (§4) is stripped by the pool-side whitelist. So: **components always come from a plugin.json declaration; runtime calls only update metadata.**

```json
{
  "contributes": {
    "viewsContainers": {
      "explorer": {
        "title": "Explorer",
        "location": "sidebar",
        "hideIfEmpty": false,
        "order": 100
      }
    },
    "views": {
      "explorer": [
        {
          "id": "folders",
          "title": "",
          "render": "src/views/FoldersView.tsx",
          "order": 0,
          "collapsed": false,
          "titleActions": []
        }
      ]
    }
  }
}
```

### viewsContainers fields

| Field | Required | Type | Description |
|------|:--:|------|------|
| `title` | ✅ | string | The name shown in the sidebar header. E.g. "Explorer" |
| `location` | ❌ | `"sidebar"` \| `"panel"` \| `"auxiliarybar"` \| `"main"` | Container location. Defaults to `"sidebar"` (see the render regions in §1). `"main"` = the main-area tab render surface — declared only by the active factoryRole plugin (the marketplace), consumed by the shell's ShellViewRenderer |
| `hideIfEmpty` | ❌ | boolean | Hide automatically when there are no active views. Defaults to `false` |
| `order` | ❌ | number | Ordering among containers in the same location. Smaller values come first |
| `icon` | ❌ | string | Container icon — overrides the plugin's own icon |
| `mergeHeaderWhenSingle` | ❌ | boolean | When the container holds only one view, hide the view's collapse header — the title merges into the container header. Aligned with VS Code's `mergeViewWithContainerWhenSingleView` (the `panel-demo` sidebar container uses exactly this mode) |

### views fields (full table)

| Field | Required | Type | Description |
|------|:--:|------|------|
| `id` | ✅ | string | Unique view ID. Naming suggestion: `<feature-name>`, e.g. `folders` / `sessions` |
| `render` | ✅ | string | Component module path. **Relative to the plugin directory.** E.g. `"src/views/FoldersView.tsx"` |
| `title` | ❌ | string | SidebarSection collapse-header title. An empty string = no collapse header, the content renders directly |
| `role` | ❌ | `"toolbar"` \| `"section"` | Container role. Defaults to `"section"` (has a collapse header); `"toolbar"` = stuck to the top, not covered by sections. Replaces the empty-title hack |
| `order` | ❌ | number | Ordering within the container. Smaller values on top |
| `collapsed` | ❌ | boolean | Initially collapsed. Defaults to `false` |
| `when` | ❌ | string | Context key condition — the view is shown only when satisfied. E.g. `"explorerFocus"` |
| `canToggleVisibility` | ❌ | boolean | ✅ Implemented — the user can toggle visibility from the panel switcher / the sidebar's "Views" submenu |
| `canMoveView` | ❌ | boolean | ✅ Implemented — the user can drag this view into another container |
| `hideByDefault` | ❌ | boolean | ✅ Implemented — hidden by default; the user must switch it on manually from the view menu |
| `titleDescription` | ❌ | string | Secondary text next to the title. Aligned with VS Code's `ViewPane.titleDescription` |
| `singleViewPaneContainerTitle` | ❌ | string | With a single view and `mergeHeaderWhenSingle`, the container header shows this title instead of the container title |
| `minHeight` | ❌ | number | Minimum height for drag-resizing (px). Defaults to 100 if not declared |
| `showActions` | ❌ | `"always"` \| `"whenExpanded"` \| `"default"` | Controls when the action area is shown. Aligned with VS Code's `ViewPaneShowActions` |
| `titleTooltip` | ❌ | string | Title hover tooltip — shows the full text when the title is truncated |
| `badge` | ❌ | string \| number | Marker to the right of the title — a number or short text (e.g. the installed count "15") |
| `titleActions` | ❌ | `TitleActionWidget[]` | **The view action area's declaration system** — see §3 |

---

## 3. Declarative titleActions — the action area on the right of a view header

**Aligned with VS Code's `[+][🔄][⊟]` on the right of a view header / the terminal's `[+][▾]`.** Declared in `contributes.views[].titleActions` and consumed by the shell's uniform renderer `ViewTitleActions.tsx` — **it travels with the view, and moves with the view** (when the view moves between the panel and the sidebar, the action area comes along).

### The three widget forms

| Type | Form | Click behavior |
|------|------|------|
| `icon` | A single icon button | Executes `command` |
| `dropdown` | A pure dropdown (chevron) | Expands the `items` list; clicking an entry executes its `command` |
| `split` | A primary button + dropdown combined | The primary button executes `command` (the default action); the chevron on the right expands the `items` alternatives |

**Widget fields:** `id` (unique), `command` (the command ID executed on click), `args` (optional — passed through as the single positional argument of `executeCommand(command, args)`), `icon` (a codicon class name, e.g. `"codicon-add"`), `title` (tooltip/aria-label/text when there is no icon), `items` (the alternative entries of a dropdown/split: `{ label, command, args }`).

### A real example — panel-demo (the official verification plugin)

```json
{
  "id": "demo-output",
  "title": "Output",
  "render": "src/views/DemoOutputView.tsx",
  "order": 0,
  "titleActions": [
    {
      "type": "split",
      "id": "add-log",
      "command": "panel-demo.addLog",
      "icon": "codicon-add",
      "title": "Add a demo log",
      "args": { "level": "info", "text": "The primary button — add an info log" },
      "items": [
        { "label": "Add info", "command": "panel-demo.addLog", "args": { "level": "info" } },
        { "label": "Add warning", "command": "panel-demo.addLog", "args": { "level": "warn" } },
        { "label": "Add error", "command": "panel-demo.addLog", "args": { "level": "error" } }
      ]
    },
    {
      "type": "icon",
      "id": "clear-log",
      "command": "panel-demo.clearLog",
      "icon": "codicon-clear-all",
      "title": "Clear output"
    }
  ]
}
```

### Registering titleActions commands

The source of truth for executing a `command` declared in `titleActions` = **the pool-side command registry** (`executeCommand` prefers the pool side, with shell IPC as fallback). Command handlers are registered inside the view component:

```tsx
// DemoOutputView.tsx (the real panel-demo code)
useEffect(() => {
  const api = window.linkdesk?.commands;
  api?.registerCommand?.(
    "panel-demo.addLog",
    (args?: { level?: LogLevel; text?: string }) => {
      addLine(args?.level ?? "info", args?.text ?? "");
    },
    // Registered through the pool-side registerCommand — `when` is left to the declaration system;
    // when:"false" = a purely programmatic command that does not enter the command palette (titleActions-only)
  );
  api?.registerCommand?.("panel-demo.clearLog", () => clearLines());
}, []);
```

> **`when: "false"` = a purely programmatic command that does not enter the command palette** — commands dedicated to titleActions are all declared this way, to keep them from flooding Ctrl+Shift+P.

### Render locations (one renderer, two consumers)

- **Panel containers (PanelZone)**: the action area on the right of the tab bar — rendered from the **active view**'s titleActions (`PanelZone.tsx`)
- **Sidebar containers (SidebarZone/RightSidebarZone)**: on the right of a section's collapse header — each view renders its own (`PoolSectionStack` injects the SidebarSection actions slot); with `mergeHeaderWhenSingle` and a single view, the container header is the view header and it consumes the same way

**Zero declarations (`titleActions: []`) → renders null (the right side stays blank, preserving the status quo).** The widget is a general-purpose part, not something built for the terminal — whoever declares it, uses it (the iron rule of plugin independence: a third party declares and it just works, with zero shell changes).

---

## 4. Runtime updates and queries — `window.linkdesk.viewContainer`

**The declarative side (§2) governs "which views exist"; the runtime API governs "metadata updates + queries".** The source of truth for a view's metadata is the shell's `ViewContainerService` (the pool reaches it over real IPC).

```typescript
// Query — returns a DTO (serializable public fields; render/actions are stripped)
const views = await window.linkdesk.viewContainer.getViews("explorer");      // ViewDto[]
const view = await window.linkdesk.viewContainer.getView("folders");          // ViewDto | undefined
const container = await window.linkdesk.viewContainer.getViewContainer("explorer");

// Update metadata — the title follows the data (aligned with VS Code's registerViews update)
// Calling repeatedly with the same (pluginId, viewId) = update the existing view; render is kept
// (render cannot cross IPC and is stripped by the pool-side whitelist)
await window.linkdesk.viewContainer.registerView("file-tree", "explorer", {
  id: "folders",
  title: newFolderName,   // Update the title only — other fields are optional
  minHeight: 180,
});
```

**Rules:**
- Calling `registerView` repeatedly with the same `(pluginId, viewId)` pair = **updating the existing view**. A field you omit keeps its original value.
- **`render` is a function — it cannot cross IPC** (invoke's structured clone throws `DataCloneError`; the pool-side whitelist `toViewMetaDto` strips it). **Never pass a component through runtime registration** — components must be declared in plugin.json (§2); the runtime only updates metadata.
- Querying a container/view that does not exist → `undefined` / `[]`.

### View change broadcasts

A change to the shell's registry triggers `events.emit("viewContainer:changed", { containerId, views: DTO[] })` — plugins can subscribe (marketplace uses it to refresh its UI after views are registered):

```typescript
const unsub = window.linkdesk.events.on<{ containerId: string }>(
  "viewContainer:changed",
  ({ containerId }) => { refresh(containerId); }
);
```

### Shell-side write APIs (plugins never call these directly — cross-plugin interaction goes through the UI/bridges)

The following methods live in the shell's `ViewContainerService` (`src/core/services/layout/ViewContainerService.ts`) — the plugin side is **forbidden to import that module** (the ESLint `noCoreImportInPlugin` error level, see `01 §5`). **User actions** that show/hide, move or reorder views are carried automatically from the pool-side UI to the shell over an IPC bridge:

| Shell method | Meaning | How a plugin triggers it |
|--------|------|------|
| `setVisible(containerId, viewId, visible)` / `isVisible` / `toggleViewVisibility` | View visibility (+ persistence) | Checking a box in the panel switcher, via the `panel:toggleViewVisibility` bridge |
| `moveView(viewId, from, to, newIndex?)` | Cross-container migration | Drag and drop (the `viewDragProtocol` MIME) |
| `reorderView(containerId, viewId, newIndex)` | Reorder within a container (+ persistence) | Drag a header to reorder |
| `registerViewEmptyContent(containerId, viewId, content, when?)` | View empty-state placeholder (shown when there is no data) | — |

> A plugin that wants to show/hide or move views "programmatically" = go through `executeCommand` (calling the shell-side service inside a command handler registered by the shell or a plugin), or `panel.reveal` (see §5).

---

## 5. Panel views — `location: "panel"` + `panel.reveal`

Panel containers (`location: "panel"`) render in the bottom PanelZone, with the tab bar switching views. **Focusing a bottom-panel view = `window.linkdesk.panel.reveal(viewId)`** (aligned with VS Code's view-promotion semantics):

```typescript
await window.linkdesk.panel.reveal("demo-output");  // focus the demo-output view in the bottom panel
```

- Panel hidden → expand it and switch to that view (the same mechanism as Ctrl+J)
- Panel already shown → switch focus
- `viewId` not in a panel container → **no-op** (no error)

**Complete panel container example — panel-demo:**

```json
{
  "contributes": {
    "viewsContainers": {
      "panel-demo": { "title": "Panel Demo", "location": "panel" },
      "panel-demo-sidebar": { "title": "Panel Demo", "location": "sidebar" }
    },
    "views": {
      "panel-demo": [
        { "id": "demo-output", "title": "Output", "render": "src/views/DemoOutputView.tsx", "order": 0, "titleActions": [/* §3 */] },
        { "id": "demo-todo", "title": "To-do", "render": "src/views/DemoTodoView.tsx", "order": 1 }
      ],
      "panel-demo-sidebar": [
        { "id": "demo-sidebar", "title": "Sidebar Demo", "render": "src/views/DemoSidebarView.tsx", "order": 0, "titleActions": [/* §3 */] }
      ]
    }
  }
}
```

> The same plugin can declare a panel container and a sidebar container at the same time (each belongs to its own zone). **`panel.moveToEditor` has been removed** — moving zones is the job of layout commands.

---

## 6. View component authoring conventions

### Component signature

```typescript
// src/views/MyView.tsx
export default function MyView() {
  // A standard React component — exactly like writing any ordinary component
  return <div>...</div>;
}
```

### Do not wrap SidebarSection yourself

**❌ Wrong:**
```tsx
export default function MyView() {
  return (
    <SidebarSection title="My View">
      <div>content</div>
    </SidebarSection>
  );
}
```

**✅ Right:**
```tsx
export default function MyView() {
  // PoolSectionStack wraps it in SidebarSection automatically — no need to wrap it yourself
  return <div>content</div>;
}
```

The render loop (shell `usePoolSync` → pool `PoolSectionStack`):
```tsx
views.map(view => (
  <SidebarSection key={view.id} title={view.title} defaultOpen={!view.collapsed}>
    <PluginComponent renderPath={view._renderPath} />
  </SidebarSection>
))
```

A view component is responsible only for the **content area**. Collapsing/expanding and the title are managed uniformly by SidebarSection.

### An empty title string

`"title": ""` → SidebarSection does not render the collapse header — the content shows directly. Suited to the "single view, no collapsing needed" case. E.g. file-tree's `folders` view. For a multi-section scenario use `role` rather than a title hack.

### Toolbar buttons

A view may freely place toolbar buttons at the top of its content — these are not SidebarSection's header actions (those go through the declarative titleActions, §3). The content area is entirely free:

```tsx
export default function MyView() {
  return (
    <>
      <div className="my-toolbar">
        <button onClick={...}>+ New</button>
      </div>
      <div className="my-content">...</div>
    </>
  );
}
```

---

## 7. Full example — a Git plugin registering TIMELINE into Explorer

```json
// git/plugin.json
{
  "contributes": {
    "views": {
      "explorer": [
        {
          "id": "timeline",
          "title": "TIMELINE",
          "render": "src/views/TimelineView.tsx",
          "order": 100,
          "when": "gitOpen"
        }
      ]
    }
  }
}
```

```typescript
// git/src/views/TimelineView.tsx
export default function TimelineView() {
  // ... read the git log → render the list ...
  return <div className="git-timeline">...</div>;
}
```

The file-tree plugin changes by zero lines. TimelineView shows up automatically below FOLDERS.

---

## 8. Lifecycle

```
Plugin load
  → loader parseContributions → declarative registration of viewsContainers + views (loading render components)
  → component mount → runtime registerView updates metadata (title/order/minHeight)
  → shell usePoolSync → pool PoolSectionStack renders getActiveViews(containerId)

Plugin unload
  → ViewContainerService.unregisterAll(pluginId) (the reversible-registration tracker rolls back in reverse order)
  → all of that plugin's containers + all its views are removed
  → events.emit("viewContainer:changed") broadcast
  → the pool re-renders — other plugins' views are unaffected
```

## 9. When to use declarative vs. runtime

| Scenario | Approach |
|------|------|
| The view title never changes | plugin.json, declarative (§2) |
| The view title follows the data (e.g. "Send/Receive Settings — COM3") | plugin.json declaration + a runtime `registerView({ title: newTitle })` metadata update (§4) |
| A fixed number of views | plugin.json, declarative |
| The view needs an action area (buttons/dropdown on the right of the header) | the declarative `titleActions` in plugin.json (§3) |
| Need to focus a bottom-panel view | `window.linkdesk.panel.reveal(viewId)` (§5) |

---

> **← Overview:** `00-readme.md`
> **→ Related:** `01-plugin-api-contract.md` `03-contributes-spec.md` `07-plugin-to-plugin-communication.md`
