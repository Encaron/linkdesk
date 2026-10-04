# 20 — Adding a Setting to Your Plugin

> **This page answers one question:** your plugin needs a "user-adjustable toggle/number/dropdown" — **what is the minimum you have to write**?
>
> **Three steps: declare one entry → it appears on the settings page by itself → read it in code.** No settings UI to write at all.

| | |
|---|---|
| Audience | Authors who already have a plugin running and now want to add a configurable entry |
| Form | **The minimal path** (copy it and you're done) |
| Not | "Building a settings plugin" (that means **replacing the whole settings UI**, a different job → [10-Building a Settings Plugin](10-building-a-settings-plugin.md)) · the full field table (→ [03-Contributes Spec](03-contributes-spec.md)) |

> **Don't conflate two things** (this is the most common misunderstanding):
> - **This page**: add one setting **to your plugin** — it shows up in the **existing** settings page, as one group, with zero UI code.
> - [10-Building a Settings Plugin](10-building-a-settings-plugin.md): **build a whole settings UI yourself** to replace the shell's settings page (`factoryRole: "settings"`). The vast majority of plugins **never need** this.

---

## 1. Step 1: Declare it in `plugin.json`

```jsonc
{
  "pluginId": "my-plugin",
  "contributes": {
    "configuration": {
      "title": "My Plugin",                       // ← the group name in the settings page's left nav
      "properties": {
        "my-plugin.autoSave": {                  // ← the key must carry the <pluginId>. prefix
          "type": "boolean",
          "default": true,                       // ← default is required
          "title": "Auto save",                  // ← the row name (optional; without it the row shows the key)
          "description": "Save automatically on exit"          // ← description is required (rendered as a tooltip)
        },
        "my-plugin.refreshInterval": {
          "type": "number",
          "default": 1000,
          "title": "Refresh interval",
          "description": "Refresh interval (ms)"
        },
        "my-plugin.units": {
          "type": "string",
          "default": "mm",
          "enum": ["mm", "cm", "inch"],
          "enumDescriptions": { "mm": "Millimeters", "cm": "Centimeters", "inch": "Inches" },   // ← object: enum value → display name
          "title": "Display units",
          "description": "Display units"
        }
      }
    }
  }
}
```

**The sign you got it right:**

```bash
npm run validate     # Validate that plugin.json is well-formed
```

Once installed into LinkDesk, a "My Plugin" group appears on the left of the settings page and the three controls render automatically on the right — **boolean becomes a toggle, enum becomes a dropdown, number becomes an input box**. You didn't write a single line of UI code.

**Two optional names worth filling in.** `title` is the row's human-readable name — the settings page shows it instead of the raw key, and the marketplace's features tab shows it on the line above the key; a row without one falls back to the key. `enumDescriptions` names each dropdown option (an **object**: value → display name); an option with no entry falls back to the raw value. Both follow the same convention as `description`: the Chinese source text is the i18n key, the English translation goes in your plugin's `i18n/en.json`. Your repo's verify leg `check-config-titles` lists the ones still missing as warnings during the internal-beta period (it becomes an error at v1) — see [06-plugin-json-spec](06-plugin-json-spec.md).

---

## 2. Step 2 (Optional): Make It Look Nicer

| What you want | What to add |
|:--|:--|
| **A more fitting widget** (color picker / slider / file picker…) | `uiHint` — see the table below |
| Subheadings inside the same group | `group` — entries sharing a `group` value collect under one second-level heading |
| Dropdown options that **show a short label**, with the full sentence on hover | `enum` + `enumDescriptions`, together with `uiHint: "segmented"` |
| The entry is not user-editable but **shows a live status** | `renderHint: "readonly"` + `statusCommand` — see 2.2 below |
| The entry is a **button** (click to do something) | `renderHint: "action"` + `actionCommand` — see 2.3 below |
| A one-line note under the group name / under each section | `subtitle` / `groupDescriptions` (written on the `configuration` level, not on a key) |

**Known `uiHint` values** (an unknown value falls back to the default rendering for its `type`, without error):

| `uiHint` | Renders as |
|:--|:--|
| `"color"` | Color picker |
| `"slider"` | Slider (pair with `minimum` / `maximum` / `step`; inferred from the range if omitted) |
| `"segmented"` | Segmented radio (pair with `enum` + `enumDescriptions`) |
| `"fontFamily"` | Font family picker (`monoOnly: true` lists monospace families only) |
| `"fontSize"` / `"file"` / `"directory"` / `"image"` | The matching specialized widget |

```jsonc
"my-plugin.accent": {
  "type": "string", "default": "#3B82F6",
  "uiHint": "color", "description": "Accent color"
},
"my-plugin.level": {
  "type": "number", "default": 50,
  "uiHint": "slider", "minimum": 0, "maximum": 100, "step": 5,
  "description": "Sensitivity"
}
```

> ⚠️ **There is no `"integer"`** — integers use `"number"` too (with `step: 1`).

### 2.1 Notes for the Group and Its Sections

Besides the group name (`title`) you can add one subtitle line under it, and one line under each section (`group`) — **written on the `configuration` level**:

```jsonc
"configuration": {
  "title": "My Plugin",
  "subtitle": "What this whole group is about, in one line",
  "groupDescriptions": { "Sampling": "The settings here affect the sampling stage" },
  "properties": { /* … */ }
}
```

Both are optional. The key in `groupDescriptions` **must match the `group` text on the entry character for character** (otherwise that line does not appear); sections you don't describe stay exactly as they were — no empty rows.

### 2.2 Read-Only Status Row: Show **Live State**, Not a Configuration Value

Some rows are not meant to be edited; they let the user (and an AI) **see what is happening right now** — for example "Channel status: running · 127.0.0.1:47001". Use `renderHint: "readonly"` for those: the value comes from the **return value of a command**, and it is re-fetched **every 3 seconds**, so what you see is a live reading.

```jsonc
"my-plugin.engine.status": {
  "type": "string", "default": "",
  "description": "Engine status",
  "renderHint": "readonly",
  "statusCommand": "my-plugin.engineStatus"   // ← a command you registered (returns one line of text)
}
```

```ts
// Register that command in your plugin — its return value is the text shown on the row (\n allowed)
window.linkdesk?.commands?.registerCommand?.("my-plugin.engineStatus", async () => {
  return connected ? `running · ${endpoint}` : "not connected";
});
```

| Point | Explanation |
|:--|:--|
| Where the value comes from | **The command**, not `configuration` — that is why it can show runtime state; `default` only exists to satisfy validation and is never displayed |
| What the command returns | A string (use `\n` for multiple lines; rendered as multiple lines) |
| Whose command goes in `statusCommand` | **One of your own**; a shell command id works too, as long as you know what it returns |
| Can the user edit it? | No — it is a read-only row with no input control |
| What if the command does not exist yet | The row stays **blank** (no error, no placeholder) — so don't expect text before the command is registered |

### 2.3 Button Row: Click to Do Something

```jsonc
"my-plugin.openDashboard": {
  "type": "string", "default": "",
  "description": "Open dashboard",              // ← this line is the button text
  "renderHint": "action",
  "actionCommand": "my-plugin.showDashboard"    // ← executed when clicked
}
```

- **The button text is `description`** (there is no other string on an action row, so phrase it as an action, not as a noun explanation).
- Clicking runs `actionCommand`; the command can be **one of your own** or **a shell command** (such as `app.openAiManual`).
- To grey the button out while some condition holds, add `actionDisabledAll: [{ "key": "my-plugin.engine", "value": "off" }]` — the button is disabled while **every** listed entry matches the current configuration value. **Leaving the field out means the button is always clickable** (same when none of the entries matches).

> All three are **general capabilities**: any plugin gets them by declaring them, and the host has no privilege here (a different settings plugin renders them just the same — the contract lives in `plugin.schema.json`).

---

## 3. Step 3: Read It in Code

**Always read and write through `window.linkdesk.configuration`** (`localStorage` is forbidden):

```ts
// Read it once
const autoSave = await window.linkdesk.configuration.get<boolean>("my-plugin.autoSave");

// Subscribe to changes (the moment the user edits it on the settings page, you hear about it)
useEffect(() => {
  return window.linkdesk.configuration.onChange<number>("my-plugin.refreshInterval", (ms) => {
    restartTimer(ms);
  });
}, []);
```

**Don't forget to unsubscribe**: the return value of `onChange` is the unsubscribe function — `return` it from your `useEffect` (subscriptions always hang off an effect, never off module top level).

> For "the user changes a setting → several places in the UI update at once", see [18-Cross-Region Wiring §Recipe D](18-cross-region-wiring.md).

---

## 4. Advanced: Suggesting Values for **Someone Else's** Setting

If you want a key to "have a better default" but **the key isn't yours** (suggesting a font size for the built-in editor, say), use `configurationDefaults`:

```jsonc
{
  "contributes": {
    "configurationDefaults": {
      "editor.fontSize": 14
    }
  }
}
```

| Comparison | `configuration` | `configurationDefaults` |
|:--|:--|:--|
| Defining **your own** settings | ✅ | ❌ |
| Suggesting a default for **someone else's** key | ❌ | ✅ |
| After the user has set it manually | the user's value wins | the user's value wins (the weak default only applies when the user has never set it) |

---

## 5. Common Mistakes

| Symptom | Root cause | Do this instead |
|:--|:--|:--|
| The setting never appears on the settings page | The `key` lacks the `<pluginId>.` prefix, or `default` is missing | Always `my-plugin.xxx`; you need all three of `type`/`default`/`description` |
| I have to restart for a settings change to take effect | You only `get` once and never subscribed | `configuration.onChange` |
| `npm run validate` errors out | `configuration` was written as an array / `properties` is missing | Copy the shape from §1 of this page |
| The value is lost on restart | You used `localStorage` or component state | `configuration.set` |
| I want a full-page settings UI, but I'm only changing a font size | Wrong door | The three steps on this page are enough; a full replacement is the job of [10](10-building-a-settings-plugin.md) |

---

## 6. Related Reading

| What you want to do | Read this |
|:--|:--|
| The complete field table / more examples | [03-Contributes Spec](03-contributes-spec.md) |
| Building a whole settings UI (replacing the shell's settings page) | [10-Building a Settings Plugin](10-building-a-settings-plugin.md) |
| How to make several regions follow a config change | [18-Cross-Region Wiring](18-cross-region-wiring.md) |
| What the settings page looks like and which widgets it has | [19-Component Cheatsheet](19-component-cheatsheet.md) |
| Field type definitions | `plugin.schema.json` |
