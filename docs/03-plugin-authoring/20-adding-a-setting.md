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
          "description": "Save automatically on exit"          // ← description is required (rendered as a tooltip)
        },
        "my-plugin.refreshInterval": {
          "type": "number",
          "default": 1000,
          "description": "Refresh interval (ms)"
        },
        "my-plugin.units": {
          "type": "string",
          "default": "mm",
          "enum": ["mm", "cm", "inch"],
          "enumDescriptions": ["Millimeters", "Centimeters", "Inches"],   // ← one-to-one with enum
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

---

## 2. Step 2 (Optional): Make It Look Nicer

| What you want | What to add |
|:--|:--|
| **A more fitting widget** (color picker / slider / file picker…) | `uiHint` — see the table below |
| Subheadings inside the same group | `group` — entries sharing a `group` value collect under one second-level heading |
| Dropdown options that **show a short label**, with the full sentence on hover | `enum` + `enumDescriptions`, together with `uiHint: "segmented"` |

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
