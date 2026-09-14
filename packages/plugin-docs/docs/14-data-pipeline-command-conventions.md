# 04 — Data Pipeline Command Conventions

> **Type: shell-level** — reference document defining the command ID format convention | 2026-07-26. **Settle this before writing any protocol/card plugin.** Command ID format, argument conventions, return format — once fixed they can't be changed casually; changing them is an API break.

---

## Pipeline model

```
Slider card drag
  → protocol.encode(value)
  → terminal.sendBytes(bytes)
  → MCU receives → computes → sends back
  → terminal.receiveData(raw)
  → protocol.parse(raw)
  → waveform card updates
```

Three roles: **data source** (terminal/serial/network) → **protocol** (encode/decode) → **card** (UI widget).

---

## Command ID format

```
<pluginId>.<action>
```

| Role | Command | Example |
|---|---|---|
| Data source | `<pluginId>.sendBytes` | `terminal.sendBytes` |
| Data source | `<pluginId>.onData` (event) | `terminal.onData` |
| Protocol | `<pluginId>.encode` | `bracket.encode` |
| Protocol | `<pluginId>.parse` | `bracket.parse` |
| Protocol | `<pluginId>.decode` | `modbus.decode` |

**Rules:**
- Prefix = plugin ID (the `id` field in `plugin.json`)
- Action name = a verb (`sendBytes` / `encode` / `parse` / `decode`)
- A data source is not named `send` — too vague. Byte-level push is `sendBytes`
- `onData` is an event (Emitter), not a command — it goes through CoreEvents rather than the CommandRegistry. It is listed here only for naming consistency

---

## Argument formats

### sendBytes — a data source sends bytes

```typescript
// request
{
  channel: number,          // channel / serial port number
  bytes: number[],          // raw bytes to send
}

// response
{
  success: boolean,
  error?: string,           // failure reason (e.g. "port closed")
}
```

### encode — protocol encoding (value → bytes)

```typescript
// request
{
  channel: number,
  value: number,            // application-layer value (e.g. slider 0-100)
}

// response
{
  success: boolean,
  bytes?: number[],         // the encoded bytes
  error?: string,
}
```

### parse / decode — protocol parsing (bytes → value)

```typescript
// request
{
  channel: number,
  bytes: number[],          // raw bytes
}

// response
{
  success: boolean,
  value?: number,           // the parsed application-layer value
  fields?: Record<string, unknown>,  // structured fields (e.g. { temp: 25.3, humidity: 60 })
  error?: string,
}
```

### Card update — extended form

```typescript
// request
{
  cardId: string,           // card instance ID
  fields: Record<string, unknown>,  // field → value mapping
}

// response
{
  success: boolean,
  error?: string,
}
```

---

## Result format — one unified envelope

```typescript
interface PipelineResult {
  success: boolean;
  error?: string;           // human-readable and short — good for a toast
}
```

**Rules:**
- All pipeline commands return `PipelineResult` or a subtype of it
- When `success = false`, `error` is required
- `error` is a short human-readable string — not a stack trace, not a code
- The concrete data fields (`bytes` / `value` / `fields`) are only guaranteed to exist when `success = true`

---

## How to register

Plugins declare them in `contributes.commands`:

```json
{
  "contributes": {
    "commands": [
      { "id": "bracket.encode", "title": "Bracket Protocol: Encode" },
      { "id": "bracket.parse", "title": "Bracket Protocol: Parse" }
    ]
  }
}
```

Callers use `executeCommand`:

```typescript
const result = await executeCommand("bracket.encode", {
  channel: 1,
  value: 75,
}) as PipelineResult & { bytes?: number[] };
```

---

## Why settle it now

| Not settled | Settled |
|---|---|
| AI A writes `terminal.send`, AI B writes `serial.pushBytes` — they don't connect | Every data source is named `sendBytes` — the pipeline connects automatically |
| Everyone invents their own return format — `{ ok }` vs `{ success }` vs throw | One unified envelope — callers don't have to guess |
| A card doesn't know whether the protocol returns `value` or `fields` | The convention is explicit — an AI reading this document knows how to consume it |

---

## Not registered as core commands

These commands are **not registered in `coreCommands.ts`** — the core doesn't know that protocols/terminals/cards exist. They are registered by their respective plugins and discover each other through the CommandRegistry. The core only provides the CommandRegistry table.

> **← 07 index:** `00-readme.md`
