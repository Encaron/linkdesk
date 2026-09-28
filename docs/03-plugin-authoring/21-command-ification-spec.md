# 21 — Command-ification Spec (so AI, keybindings and the Command Palette all take one road)

> 2026-09-28 · **In one line**: **everything a user can do in your UI should be a command.**
> A command is not "a shortcut for power users" — it is the **single entry point for an action**: the Command Palette, keybindings,
> context menus, automation and AI all come in through the same road.
> This doc is the **spec + author checklist**; field-level details live in [03-contributes-spec](03-contributes-spec.md) §3.1,
> and the runtime signature in [01-plugin-api-contract](01-plugin-api-contract.md) (the `commands` namespace).

---

## 1. Why (the shell only knows commands)

**The shell has zero knowledge about your plugin.** It doesn't know whether you are a serial monitor or a note board — it only knows
"**some plugin registered these commands**".

So "let AI operate my plugin" is not an application or an integration — it is **register a command and you are supported automatically**:

| What you do | What appears for free |
|:--|:--|
| `contributes.commands` + a pool-side `registerCommand` | One more item in the Command Palette · bindable to a key · referenceable from context menus/title bar/section buttons · **one more callable command on the AI surface (the command list)** |

**The flip side**: actions that live only in the UI (buttons that appear on hover, context-menu items, double-clicking a row) have
**no command at all**. That is fine for a human (they have hands), but for keybindings, for automation and for AI they **do not exist** —
the only option left is to fake mouse input, and faked mouse input depends on movement thresholds, timing and coordinates, so it can
silently fail on another machine or another resolution. **A command is one line of JSON; a mouse simulation is a stretch of unreliable code.**

---

## 2. Two legs (both are required)

| Leg | Where it is written | What it carries |
|:--:|:--|:--|
| ① **Metadata** | `plugin.json` → `contributes.commands` | id / title / category / when / **description** / **params** — this is the **manifest**; it is what AI reads |
| ② **The real handler** | Pool-side code (when the view component mounts) | `window.linkdesk.commands.registerCommand(id, handler, meta)` — this is the **execution**; it lives only in the pool renderer |

```json
{
  "contributes": {
    "commands": [
      {
        "id": "demo-notes.addNote",
        "title": "New Note",
        "category": "Notes",
        "description": "Create a note and return its id",
        "params": [
          { "name": "title", "type": "string", "description": "Note title (omitted = untitled)" }
        ]
      }
    ]
  }
}
```

```typescript
// Pool side: the real handler (registered when the component mounts; unregisterCommands(pluginId) on unmount)
useEffect(() => {
  window.linkdesk.commands.registerCommand(
    "demo-notes.addNote",
    (title?: string) => createNote(title), // ← the *same* action function the UI button calls
    { description: "Create a note and return its id" },
  );
}, []);
```

> ⚠️ **Declaring without registering a handler** = the palette shows it, clicking does nothing (no-op + a diagnostic warning).
> The declaration side contributes **metadata** (a placeholder); the handler is what actually runs.

---

## 3. Four things every command should get right

1. **`id` carries your own prefix**: `<pluginId>.<action>` (e.g. `demo-notes.addNote`).
   Both AI and users list "what can this plugin do" by **prefix** — an id without one gets attributed to somebody else.
2. **`description` states the intent; do not restate the id.** That single sentence is **how AI picks a command**: write
   "Delete every message logged in the current session", not "the clearSession command". Without it your command is just an id to AI.
3. **`params` written position by position** (`name` / `type` / `required` / `description`).
   Callers build `executeCommand(id, ...params)` straight from it and **never have to read your source to guess arguments**.
4. **State must be readable back.** Once a command changes state, provide a separate read path (a list/query command, or
   `configuration.get()`) — "do it, then verify" is basic behaviour for automation and AI, and with no read path it can only retry blindly.

---

## 4. Four things not to do (each one has actually bitten us)

1. **⛔ Don't let the caller bypass your plugin.** The command handler must go through **your plugin's own state chain** (your existing
   store/service). Calling a lower-level API directly behind its back produces "the command ran but the UI doesn't know" — the sidebar
   lamp doesn't change, the list doesn't refresh.
2. **⛔ Don't write the command as a copy of the UI function.** Extract one shared action function and have the button's `onClick` call
   **the same one** as the command handler. Two copies drift apart over time, and no light turns on when they do.
3. **⛔ Don't leave gestures as the only path.** Hover buttons, context menus and double-clicks **all stay** (they feel good to use), but
   each one needs a command behind it: gestures are **feel**, commands are **entry points**. They coexist; this is not a replacement.
4. **⛔ Don't bury implicit preconditions in the command.** Express preconditions with `when` and spell them out in `description`
   ("requires an open serial port"), instead of relying on "some view happens to be selected right now" — the caller cannot see your focus.

---

## 5. Author checklist (tick as you go)

- [ ] I listed every action **a user can perform** in my plugin (including the ones that only live on hover buttons / context menus / double-clicked rows)
- [ ] Each has a `contributes.commands` entry (`id` + `title` required, `id` carries my prefix)
- [ ] Each has a `description` (one plain sentence, intent first — it is how AI picks the command)
- [ ] Anything with parameters has `params` (`name` matching the handler's parameter name, one of the four `type` values, `required` marked)
- [ ] Each has a real handler registered pool-side (`registerCommand`), with `unregisterCommands(pluginId)` on `unmount`
- [ ] Buttons/menu items and the command handler call **the same** action function (not two implementations)
- [ ] Anything that changes state also has a **read-back** path (list/query)
- [ ] Self-test: install it → findable in the Command Palette → `description`/`params` visible in the command list → invoking it works **and the UI reflects it**
- [ ] I walked these actions through **without a mouse** (keyboard / Command Palette) and every step was reachable

---

## 6. Scope (how far this spec reaches)

- **This doc governs new plugins**; existing plugins are not retrofitted: whether and how thoroughly to add commands is
  **each author's own call**.
- Whether a plugin command-ifies its business actions is **up to the author** — what this spec guarantees is that
  "**when you do want to be operable by AI, there is a standard way**", not that "every plugin must be command-ified".
- The scaffolder **ships a command-registration template** with new plugins (see the three tiers in
  [13-development-guide](13-development-guide.md)); this spec is the reasoning behind it. The two are complementary:
  one is **default-by-construction**, the other is **knowing what to write**.
- `when` only decides **whether a command shows up in menus/the palette** (and whether its keybinding fires); it does **not** block API
  calls — never use `when` as permission control.

---

**Related:** [03-contributes-spec](03-contributes-spec.md) §3.1 (every `contributes.commands` field) ·
[07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md) (calling another plugin's command) ·
[14-data-pipeline-command-conventions](14-data-pipeline-command-conventions.md) (naming conventions for data pipeline commands)
