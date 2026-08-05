# 壳硬编码 PluginId 清理

> 2026-08-06。E5 技术债——E5#26d 发现。
> 位于 E5 收尾 → `05-收尾/架构债/`

---

## 一、问题

`MainContent.tsx` 中有 2 处硬编码插件 ID（`"editor"` / `"serial-monitor"`），是多 WebView IPC 残余。当前单 WebView 下不执行，但壳代码不该出现插件 ID——违反硬约束 #10。

---

## 二、根因

E5 多 WebView 阶段，`MainContent.tsx` 需要为特定插件发 IPC 指令（`requestToPlugin("editor", "openFile", ...)` 等）。多 WebView 回退后这些代码仍在——但因为 `readyWebViewIds` 永远为空，IPC 路径不执行。

硬编码来自多 WebView 的三通信机制——`requestToPlugin(pluginId, channel, payload)` 需要知道目标 pluginId。回退单 WebView 后 pluginId 硬编码失去意义但未清理。

---

## 三、修复方案

两种策略：

### 策略 A：随多 WebView 恢复时消灭（当前选择）

保留代码不动，在恢复多 WebView 时改为声明字段驱动——插件在 `plugin.json` 中声明需要的 IPC 通道，壳读声明而非硬编码 pluginId。

### 策略 B：立即标记 `@deprecated` + 注释

```typescript
// 🔴 @deprecated E5#26d：多 WebView IPC 残余——pluginId 硬编码。
// 单 WebView 下不执行。多 WebView 恢复时改为声明字段驱动。
const IPC_PLUGINS = ["editor", "serial-monitor"] as const;
```

**推荐：策略 B。** 不改行为，加注释和类型标记——确保下一个 AI 进场不会困惑。

---

## 四、可能遇到的问题

### 1. 和硬约束 #10 的矛盾

**风险：** 硬约束 #10 禁止 core/ 和 pluginLoader/ 中硬编码 pluginId。`MainContent.tsx` 在 `src/components/` 下（不是 core/），但精神一致——壳组件不该写死插件名。

**缓解：** 注释明确标注"多 WebView 恢复时改为声明字段"。

### 2. 影响其他 IPC 硬编码

**风险：** `requestToPlugin` 的调用模式天然需要 pluginId——如果以后有其他 IPC 需要也写死 pluginId。

**缓解：** 在 CLAUDE.md 硬约束中记录：`requestToPlugin` 的 pluginId 参数必须来自 plugin.json 声明或 registry，不可硬编码。

---

## 五、涉及文件

| 文件 | 改动 |
|:--|:--|
| `src/components/MainContent.tsx` | 2 处 pluginId 硬编码加 `@deprecated` 注释 + 类型标记 |

**改动量：** ~4 行注释。

---

## 六、备注

E5#26d grep 结果：
```
grep "pluginId === \"[a-z]" src/ → MainContent.tsx 两处（"editor"/"serial-monitor"）
```

全部 `src/` 下只有这 2 处。插件层不在此约束内（插件可以引用自己的 pluginId）。

---
