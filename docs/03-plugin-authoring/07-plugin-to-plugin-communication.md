# 07 — Plugin-to-Plugin Communication

> 2026-07-28 · full update 2026-08-21 · **2026-09-06 reconciliation against the implementation** (the three communication mechanisms have not changed since they were settled; verified section by section with zero leftovers, kept as-is). **How do plugins pass data between each other?** It is not "the terminal opens a door for the protocol" — all communication goes through pipes provided by the core. Plugins only consume them; they never build them.

---

## 1. Core principles

```
❌ Plugin ⇄ Plugin    (direct handshake — LinkDesk does not allow this)

✅ Plugin → Core → Plugin  (the core provides the pipe; plugins just use it)
```

**Only the core builds APIs. Plugins do not build APIs.** A plugin does one thing: call the functions the core hands it and read/write data through the pipes.

---

## 2. The three communication mechanisms — provided by the core, chosen by the plugin

| | Broadcast `events` | Commands `commands` | Data pipeline |
|------|------|------|------|
| API | `events.emit/on` | `registerCommand` / `executeCommand` | `serial.onData/onStats/onSystem` + `lsp.onData` + `filesystem.watch` |
| Semantics | whoever subscribes receives it (filtered by channel within the same pool) | a named, callable action | high-frequency push — a **stream**, not an event |
| Does the producer know the consumer? | No | No (anyone can call a command) | No |
| Target not online | Doesn't matter — if nobody listens, nobody listens | Command not registered → no-op | The subscriber is responsible |
| Good for | event broadcasting, state changes, data sharing | exposing capabilities for others to call | serial data, LSP output, directory changes |
| Analogy | a loudspeaker in the square | a service counter calling numbers | a water tap |

**All three can be used at once.** When the terminal receives a burst of serial data it can simultaneously:
- broadcast it to the logger plugin via `events.emit` (everyone who should know gets it)
- push it to the protocol parser through the data pipeline `serial.onData` (high-frequency, streaming, carrying a port routing key)
- expose `registerCommand('xxx.send', handler)` so other plugins can send data back to the device

> Historically there was a "back-door p2p" as a second pipe — see §4: it is implemented, but its `target` routing has been removed and its semantics were normalized to in-pool broadcast.

---

## 3. Broadcast `events` — a loudspeaker in the square

```
Terminal                   Protocol                   Logger plugin
  │                            │                            │
  │ events.emit(               │                            │
  │   'serial:rawData',        │                            │
  │   { portName, text }       │                            │
  │ )                          │                            │
  │         ↓                  │                            │
  │     Core broadcast         │                            │
  │ (pool + shell, by channel) │                            │
  │         ↓                  ↓                            ↓
  │                     events.on(                   events.on(
  │                       'serial:rawData',            'serial:rawData',
  │                       callback                     callback
  │                     )                            )
  │                      parse bytes                 log entries
```

**The sender does not know who is listening.** Zero listeners, one listener, ten listeners — all the same; `emit` and it is done.

**Channel names are strings.** The core has no idea what `'serial:rawData'` means. The naming convention is `<pluginId>:<dataName>`.

**Code (the `on<T>` generic — the payload type is inferred from the subscriber's callback; for cross-process type safety see §11):**
```typescript
// ── Emit data (plugin A) ──
window.linkdesk.events.emit('serial:rawData', {
  portName: 'COM3',
  text: '\xAA\x01\x02'
})

// ── Receive data (plugin B) ──
const unsub = window.linkdesk.events.on<{ portName: string; text: string }>(
  'serial:rawData',
  (data) => {
    console.log(data.portName, data.text)  // COM3, \xAA\x01\x02
  }
)
// Clean up when the component unmounts
// unsub()
```

**The channel broadcasts to "pool + shell".** A pool emit → main process `plugin:emit` → broadcast `plugin:push` → both the pool and the shell receive it. To send from the pool directly to the shell without coming back = `p2p` (§4).

---

## 4. The `p2p` back door — a phone in a private room (implemented; `target` routing removed)

```
Terminal                   Protocol
  │                            │
  │ p2p.send(                  │
  │   'sbq-protocol',     ← specifies the recipient (historical semantics)
  │   'serial:raw',            │
  │   data                     │
  │ )                          │
  │         ↓                  │
  │ Main process sends to pool │
  │   (bypassing broadcast)    │
  │         ↓                  │
  │                     p2p.on('serial:raw', callback)
  │                       filtered by channel — not broadcast
```

**Status: implemented, no longer a "plan".** Signature:

```typescript
interface P2pApi {
  send(target: string, channel: string, data: unknown): void;   // fire-and-forget
  on(channel: string, cb: (data: unknown) => void): () => void; // returns an unsubscribe
}
```

**⚠️ `target` routing has been removed.** Now that per-tab WebViews (one instance per plugin) no longer exist, the only receiver is the pool — the `target` parameter is kept (for backward compatibility; the signature is not deleted) but **it takes no part in routing**: whatever you send goes to the pool, and whoever calls `p2p.on` on the same channel receives it. **Zero validation, zero errors** — a wrong target will not report "target not running".

**How p2p differs from events today:**
- `events.emit` → broadcast `plugin:push` → **both the pool and the shell** receive it (the shell can add bridge wiring, see §11)
- `p2p.send` → the main process sends straight to the **pool** (a separate `p2p:data` channel), bypassing the broadcast

So: if you need shell wiring → use events; if you only intend to pass data between plugins and do not want to trigger the shell bridge → p2p. In high-frequency scenarios the performance difference no longer matters (dispatch happens in-process within a single pool). New code defaults to events; p2p is for a targeted test channel that does not disturb the shell's broadcast path (serial-monitor's `test-p2p` is exactly that usage).

---

## 5. Commands `commands` — calling numbers at the service counter

**A plugin's "capability" = a set of named commands.** Someone else (the shell or another plugin) invoking it = `executeCommand`.

```typescript
// ── Plugin A registers a capability (on component mount) ──
window.linkdesk.commands.registerCommand('serial-monitor.send', (args?: { text: string }) => {
  // Send data to the serial port
})

// ── Plugin B invokes the capability ──
await window.linkdesk.commands.executeCommand('serial-monitor.send', { text: 'AT\r\n' })
```

**Registration semantics:**
- `registerCommand` is idempotent (Map.set overwrites) — safe under StrictMode double-mounting
- `when: "false"` = a purely programmatic command that does not enter the command palette (commands dedicated to `titleActions` are declared this way; see `08`)
- **Commands are the delivery mechanism for `titleActions`** — the declarative `titleActions` widget's `command` field is executed on click by the pool side via `executeCommand` (pool-side registry first, shell IPC as fallback)

---

## 6. The data pipeline — a stream, not an event

Broadcast `events` handles "one-off notifications"; **the data pipeline handles "a continuous flow being poured in"**. Serial data, LSP output and directory changes are all streams — not "telling you once" but "pouring into you continuously".

| Pipeline | API | Payload | Routing key |
|------|------|------|------|
| Serial data | `serial.onData(cb)` | `SerialDataPayload` | `portName` (multiple ports) |
| Serial stats | `serial.onStats(cb)` | `SerialStatsPayload` | `portName` |
| Serial system events | `serial.onSystem(cb)` | `SerialSystemPayload` | `portName` |
| LSP output | `lsp.onData(cb)` | `(channelId: string, data: string)` | `channelId` |
| Directory changes | `filesystem.watch(dir, cb)` | `FileChangeEvent` | — (internally `filesystem:changed:<watcherId>`) |

```typescript
// Subscribe to serial data — the payload is an object carrying the portName routing key: multiple ports coexist, each receives its own
const unsub = window.linkdesk.serial.onData((p) => {
  if (p.portName !== 'COM3') return;   // the consumer filters — the shell does not collect on your behalf
  handleBytes(p.data);
});
// Cleanup on unmount
// unsub()

// Watch directory changes — returns an unsubscribe
const off = await window.linkdesk.filesystem.watch('/workspace', (e) => {
  // e: FileChangeEvent
});
// off()
```

**Stream semantics (the RingBuffer lesson):**
- **Data is a stream, not an event.** It is not "notify once" — it is "pour in continuously". The subscriber provides its own buffering/filtering.
- **Consumers filter by routing key** (`portName` / `channelId`) — this is the general routing-key pattern: the consumer filters, the shell does not collect on anyone's behalf.
- **Consumers that need the full history** can `import { RingBuffer } from "@src/core/pipeline/RingBuffer"` (a pure-utility whitelist — `@src/core/pipeline/*` is the exception plugins are allowed to import, see `01 §5`). RingBuffer is a standard part for streaming consumption, not an event bus.
- **Internal normalization:** underneath, `serial.onData/onStats/onSystem` are simply `events.on("serial:data"/"stats"/"system")` — the three channels run over the broadcast pipe, with no separate direct channel. Plugins do not need to know these details; `serial.onXxx` is the only entry point.

---

## 7. The terminal — the first plugin to hand out data (historical reference)

> 2026-08-21 note: this section is a historical record from an early development phase, and **the terminal plugin's current implementation differs from the tasks below** (its data sources have been normalized onto the data pipeline). It is kept as a pattern reference for "how the first data-source plugin did it".

The terminal plugin originally handed three things to the hall:

| Step | What it does | Which API | Who benefits |
|---|--------|-----------|--------|
| 1 | Pushes raw serial data | `events.emit('serial:rawData', data)` | Protocol plugins subscribe and parse it |
| 2 | Broadcasts connection state | `events.emit('serial:connected', {...})` | The status bar / other plugins |
| 3 | Accepts a send command | `registerCommand('serial-monitor.send', handler)` | Workbench cards send data back to the MCU |

**The terminal did not build any API.** It only called functions the core already had: `events.emit`, `registerCommand`. Today's terminal runs over the `serial.onData/onStats/onSystem` data pipeline (§6) + commands (§5) — an evolved version of the same principle.

---

## 8. What every plugin does from here on

When a new plugin comes in, it answers two questions:

**1. What data do I have that others might need?**
→ If the data is a stream → use the data pipeline (§6, for serial/LSP/file scenarios) or `events.emit('channel-name', data)`. Name the channel by convention.

**2. What capabilities do I have that others might need to call?**
→ Call `registerCommand('command-name', handler)`. You pick the command name. `handler` is the function you write.

Once those two questions are answered, the plugin has no extra work to do. **The table belongs to the core, the pipes belong to the core, the functions belong to the core. Plugins only consume.**

---

## 9. Why it works this way

> "The terminal builds an API, and the protocol connects to the terminal's API"

**That is not the LinkDesk model.** That is the "open a door" model — every plugin you add means opening N×(N-1) doors among N plugins.

The LinkDesk model:

- **Pipes are built once by the core.** `events.emit`, `events.on`, `p2p.send`, `p2p.on`, `registerCommand`, `serial.onData` — these functions belong to the core, not to any plugin.
- **Channel names/command names are picked by the plugin.** `'serial:rawData'`, `'sbq-protocol:parsed'` — just strings; the core does not know what they mean.
- **A new data source = no core changes needed.** A new plugin calls the same `events.emit('new-channel-name', data)` line, and the core code changes by zero lines.

**The core's workload is O(1), not O(N).** That is what plugin freedom means.

---

## 10. Related

- `01-plugin-api-contract.md` — §3.2 `events` (channel naming + the shell broadcast event table) and the `commands` runtime conventions; the single source of truth for method signatures = `contracts/linkdesk.d.ts` (`DataAPI.events/p2p` / `CommandsAPI`)
- `05-ui-conventions.md` — §8 plugin-owned data models (EventTarget); §9 system UI overlays (quickPick/notifications/dialog)
- `08-view-container-api.md` — how declarative `titleActions` are delivered through `executeCommand`

---

## 🔥 11. Required reading for AI developers — how to add a new communication path when a new plugin needs one

> 2026-08-04. **A pattern discovered after the React Fallback retirement.**
> This is also the core loop of LinkDesk's plugin freedom — it is not a bug, it is the normal development process.

**Ask first: does this communication need the shell to take part?** The answer decides where you change things.

### 11.1 Scenario

You are developing a new plugin. It needs to receive some kind of external instruction (data sent by the shell or another plugin), but there is no matching event type in the existing `window.linkdesk.events`.

**Example:** the editor plugin needs to know which file was opened. But there is no `editor:openFile` event today — the editor's `sourceId` is passed via the React prop `<EditorView sourceId="xxx" />`.

### 11.2 Three cases, three kinds of change

| Case | Where to change | Does the shell need to change? |
|:--|:--|:--|
| **Plugin ↔ plugin** — just passing data between two plugins | **Zero changes.** `events.emit('myPlugin:xxx', payload)` + the other side's `events.on`. The channel is a free-form string contract; the subscriber narrows the payload | ❌ No |
| **Plugin → shell wiring** — the shell must react (close a tab / switch a view / show or hide) | **Add a bridge in `src/App/bridges.ts` (`useUiBridges`)**: a chunk of `events.on("channel", ...)` → `shellEvents.emit(...)` | ✅ Add a bridge only, no architecture change |
| **A cross-process payload needs type safety** | Define the payload type in the `src/core/api/` generation source → re-run `contracts:gen` to regenerate the contract → `import type` on both ends | ✅ Mechanically gated contract |

**Plugin ↔ plugin (most common, zero shell changes):**
```typescript
// Plugin A — send
window.linkdesk.events.emit('editor:openFile', { filePath: 'xxx' })

// Plugin B — receive (zero shell changes)
window.linkdesk.events.on('editor:openFile', ({ filePath }) => { ... })
```

**Plugin → shell wiring (add a bridge — the existing bridge list in `bridges.ts`):**

| Bridge (built into `bridges.ts`) | What the shell wiring does |
|:--|:--|
| `icon:selected` / `icon:reordered` | Icon bar click opens a tab / drag-to-reorder is persisted |
| `file:deleted` / `file:renamed` | File-tree resource events → TabManager closes a tab / migrates a label |
| `panel:viewSelected` / `panel:resize` / `panel:toggleViewVisibility` | Panel switches view / drag to change height / checkbox shows-hides |
| `panel:createView` | Panel [+] → QuickPick view picker |

```typescript
// Template for adding a bridge on the shell side (compare with the existing file:deleted bridge):
useEffect(() => {
  const off = window.linkdesk?.events?.on("myPlugin:someEvent", (payload) => {
    shellEvents.emit("myPlugin:someEvent", payload);
  });
  return () => { off?.(); };
}, []);
```

**Shell-side event types** (the payloads of `shellEvents.emit`) are defined in `src/core/react/events/ShellEvents.ts` — add a line to the type table when needed.

### 11.3 When communication is actually needed

| Scenario | Communication needed? | Which one |
|:--|:--|:--|
| A new plugin needs to receive shell instructions | ✅ Yes | Add a bridge in the shell's `bridges.ts` → subscribe with `events.on` |
| A new plugin pushes data to other plugins | ✅ Yes | `events.emit` (events) or the data pipeline (streams) |
| A new plugin only manages state internally | ❌ No | Component state / a plugin-owned EventTarget model (`05 §8`) |
| A new plugin needs to read configuration | ❌ No | `linkdesk.configuration.get()` |
| A new plugin needs to manipulate files | ❌ No | `linkdesk.filesystem` |

### 11.4 Key principles

- **`contracts/linkdesk.d.ts` is the single source of truth for API signatures; `bridges.ts` is the collection of shell↔pool bridges.** A new AI only needs to read these two to know the entire communication surface.
- **Adding communication is normal, not a hack.** LinkDesk is designed so that "the shell is empty and the APIs grow inside the pipes". VS Code grew from 10 APIs to 1000+; LinkDesk works the same way — the channel table keeps growing.
- **Do not write plugin-specific branches into the shell.** The shell only forwards `emit`/`on` — plugins handle their own business logic.
