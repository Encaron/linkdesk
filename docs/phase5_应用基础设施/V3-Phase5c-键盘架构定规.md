# Phase 5c 键盘事件架构定规

> 踩了 4 轮 Ctrl+Shift+P 之后得出的架构结论。2026-07-21。

---

## 职责分工

```
按键 → capture phase
         │
         ├── App.tsx handler（先注册，壳级优先）
         │     matched? → stopImmediatePropagation → 执行 → 终止
         │
         └── KeybindingRegistry（兜底，插件级）
               matched? → executeCommand → 终止
```

| 层级 | 文件 | 触发 | when 条件 | 终止方式 |
|------|------|------|:--:|------|
| 壳级 | `App.tsx:524` | capture phase useEffect | ❌ 始终可用 | `stopImmediatePropagation` |
| 插件级 | `KeybindingRegistry.ts:164` | capture phase `mountGlobalKeybindings()` | ✅ `ContextKeyService.matches(when)` | `stopImmediatePropagation` |

## 注册顺序

```
1. App render → render 阶段 useEffect → App.tsx handler 注册（先）
2. startup useEffect → mountGlobalKeybindings() → Registry handler 注册（后）
```

**顺序是结构性的，不是巧合**——App render 早于 startup useEffect，两者都在 capture phase，所以 App.tsx 必然先触发。

## 为什么不用 bubble phase

CM6、Monaco 等编辑器有内部 keydown handler 在 bubble phase。如果把壳级快捷键放 bubble 层，编辑器的 stopPropagation 会拦截。capture phase 在编辑器之前。

## 为什么不用 KeybindingRegistry 处理壳级快捷键

1. KeybindingRegistry 的 `executeCommand` 链路在 5c 中经过 4 轮调试仍未完全走通（B49），壳级快捷键不能依赖一个不稳定路径
2. 壳级快捷键不需要 when 条件、不需要优先级、不需要动态注册——用最简单的 `if (e.code)` 即可
3. VS Code 也是同一个模式：`window.addEventListener("keydown", handler)` → 匹配 → 分发

## 加新快捷键的规则

**壳级**（Ctrl+,, Ctrl+Shift+P, Ctrl+W 等始终可用）：
→ 在 App.tsx `onGlobalKeyDown` 里加 `if` 分支 + `stopImmediatePropagation`

**插件级**（带 when 条件，上下文敏感）：
→ 插件 `plugin.json` 声明 `contributes.keybindings`，loader 注册到 KeybindingRegistry

**调试/监控工具**（需要拦截所有按键）：
→ 在 App.tsx 的 handler 之前注册（更早的 useEffect 或 render 阶段）。必须显式注明顺序依赖。

## 防重复执行的原则

**每个 matched 的 handler 必须调用 `stopImmediatePropagation()`**——这是硬约束。不允许"反正没绑定所以不会重复"的侥幸心态。未来新加的 capture handler 如果不遵守，和现有的互殴就是 B49 重演。
