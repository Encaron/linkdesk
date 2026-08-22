# 剪贴板 Provider 归一化

> 2026-08-02。**E5 第 2 层第 7 轮。** Ctrl+C/V/X 只在一处注册——核心统一快捷键，插件注册上下文 handler。
> 执行清单任务：E5#15、E5#16、E5#17

---

## 一、前因——碎片式快捷键

### 1.1 当前状态

Ctrl+C/V/X **只在 file-tree 插件注册了快捷键**（`plugins/builtin/file-tree/plugin.json` L47-53）：

```json
{ "key": "Ctrl+X", "command": "explorer.cut",   "when": "explorerFocus && !inputFocus" },
{ "key": "Ctrl+C", "command": "explorer.copy",  "when": "explorerFocus && !inputFocus" },
{ "key": "Ctrl+V", "command": "explorer.paste", "when": "explorerFocus && !inputFocus" },
```

**问题：** editor 插件没有注册剪贴板快捷键——Monaco 走浏览器原生 `document.execCommand`。但 Ctrl+A / Delete / F2 等标准编辑键要么缺失、要么每个插件自己声明。

**核心裂缝：** 每个插件各自声明同一个快捷键。如果 editor 将来需要自定义剪贴板行为——它得再注册一份 Ctrl+C → 两份 Ctrl+C 声明 → 冲突 → 调试地狱。

### 1.2 目标

```
核心注册: { key: "Ctrl+C", command: "core.clipboardCopy" }
  → ClipboardProviderRegistry
    → file-tree 注册: { when: "explorerFocus", onCopy: copySelectedFiles }
    → editor 注册:   { when: "editorFocus", onCopy: copyText }
```

**快捷键只在一处声明。行为按焦点上下文分发。** 对标 VS Code 的 `IClipboardService`。

---

## 二、设计方案

### 2.1 ClipboardProviderRegistry

```typescript
// src/core/ClipboardProviderRegistry.ts

export interface ClipboardProvider {
  pluginId: string;
  /** 焦点上下文——when 条件匹配时才调此 provider */
  when: string;  // e.g. "explorerFocus" / "editorFocus"
  onCopy?(): void;
  onCut?(): void;
  onPaste?(): void;
  onDelete?(): void;
  onSelectAll?(): void;
}

export class ClipboardProviderRegistry {
  private _providers: ClipboardProvider[] = [];

  /** 注册剪贴板 Provider。同 when 重复注册 → console.warn */
  register(pluginId: string, provider: Omit<ClipboardProvider, "pluginId">): void {
    const existing = this._providers.find(p => p.when === provider.when);
    if (existing) {
      console.warn(
        `[ClipboardProvider] ⚠️ "${provider.when}" 已有注册者，被覆盖。` +
        `旧: ${existing.pluginId} → 新: ${pluginId}`
      );
      this._providers = this._providers.filter(p => p.when !== provider.when);
    }
    this._providers.push({ pluginId, ...provider });
  }

  /** 卸载插件时清理 */
  unregisterAll(pluginId: string): void {
    this._providers = this._providers.filter(p => p.pluginId !== pluginId);
  }

  /** 根据焦点上下文找到合适的 Provider */
  resolve(contextKey: string): ClipboardProvider | undefined {
    return this._providers.find(p => p.when === contextKey);
  }

  /** 获取全部注册的 Provider（用于调试） */
  getAll(): readonly ClipboardProvider[] {
    return this._providers;
  }
}

export const clipboardProviders = new ClipboardProviderRegistry();
```

### 2.2 核心快捷键 handler

```typescript
// src/core/coreCommands.ts——核心注册快捷键 + handler

// 🔥 核心统一注册剪贴板快捷键——不是每个插件各自声明
registerKeybinding({ key: "Ctrl+C", command: "core.clipboardCopy", source: "core" });
registerKeybinding({ key: "Ctrl+V", command: "core.clipboardPaste", source: "core" });
registerKeybinding({ key: "Ctrl+X", command: "core.clipboardCut", source: "core" });
registerKeybinding({ key: "Ctrl+A", command: "core.selectAll", source: "core" });
registerKeybinding({ key: "Delete", command: "core.delete", source: "core" });

// handler——分发给匹配的 Provider
registerCommand("core.clipboardCopy", {
  handler: () => {
    // 1. 检查是否有 input/textarea 聚焦——走浏览器原生
    if (ContextKeyService.getValue("inputFocus")) return;
    
    // 2. 根据焦点上下文找到 Provider
    const focusContext = resolveFocusContext();  // e.g. "explorerFocus" / "editorFocus"
    const provider = clipboardProviders.resolve(focusContext);
    
    // 3. 调 Provider 的 handler
    if (provider?.onCopy) {
      provider.onCopy();
    } else {
      // 无 Provider → 走浏览器原生（document.execCommand("copy")）
      document.execCommand("copy");
    }
  },
});
```

### 2.3 现有插件迁移——从 plugin.json 声明到 Provider 注册

**文件树（当前 L47-53 —— 删快捷键声明）：**

```diff
// plugins/builtin/file-tree/plugin.json
- { "key": "Ctrl+X", "command": "explorer.cut", ... },
- { "key": "Ctrl+C", "command": "explorer.copy", ... },
- { "key": "Ctrl+V", "command": "explorer.paste", ... },
```

**文件树（加 Provider 注册——在 activate 时调用）：**

```typescript
// plugins/builtin/file-tree/src/index.tsx（或 FileTreeContextMenu.tsx）
clipboardProviders.register("file-tree", {
  when: "explorerFocus",
  onCopy: () => {
    const uris = getSelectedUris();
    fileTreeClipboard.copy(uris);
  },
  onCut: () => {
    const uris = getSelectedUris();
    fileTreeClipboard.cut(uris);
  },
  onPaste: () => {
    const { uris, isCut } = fileTreeClipboard.pull();
    // ... executeSafeDrop(uris, targetDir) ...
  },
  onDelete: () => {
    executeCommand("explorer.delete");
  },
});
```

---

## 三、实现步骤

### E5#15 ClipboardProviderRegistry（~40 行）

**文件：** 新建 `src/core/ClipboardProviderRegistry.ts`

**内容：** 接口 + 类 + 单例。`register` / `unregisterAll` / `resolve`。

**验证（vitest）：**
```typescript
it("register → resolve 返回正确 provider", () => {
  clipboardProviders.register("p1", { when: "explorerFocus", onCopy: () => {} });
  expect(clipboardProviders.resolve("explorerFocus")).toBeDefined();
});
it("同 when → console.warn + 覆盖", () => { ... });
it("unregisterAll → resolve 返回 undefined", () => { ... });
```

### E5#16 核心快捷键注册（~30 行）

**文件：** `src/core/coreCommands.ts`

**内容：** 注册 Ctrl+C/V/X/A/Delete/F2 的 core.* 命令 + handler。

**⚠️ input/textarea 检测：** `ContextKeyService.getValue("inputFocus")` 为 true → 不走 Provider——走浏览器原生（允许在 input 里正常复制粘贴）。

### E5#17 现有插件迁移（~15 行 × 2）

**文件树：**
1. `plugin.json`——删 Ctrl+X/C/V 快捷键声明
2. `FileTreeContextMenu.tsx`——加 `clipboardProviders.register("file-tree", { ... })`

**编辑器（如果已有剪贴板快捷键）：**
1. 删独立快捷键声明
2. 注册 `clipboardProviders.register("editor-focus", { ... })`

---

## 🔴 预测 Bug

### Bug E5-15a 🔴 两个插件同 when → 一个失效

**历史：** E3f #59f——`CommandRegistry.registerCommand` 覆盖已有命令。E3b #36f9——配置写入前 enum 验证。

**E5 触发条件：** 两个插件都注册 `when: "editorFocus"` → 后注册的覆盖 → 先注册的静默失效。

**🔥 防线：** `register()` 中 `console.warn` + 覆盖——开发者立即看到冲突。**不做静默保留两个**——因为剪贴板行为不能合并（谁的结果写到系统剪贴板？）。

---

### Bug E5-16a 🔴 input/textarea 内 Ctrl+C 走 Provider → 复制失败

**触发条件：** 用户在设置页搜索框（`<input>`）内按 Ctrl+C → Provider 的 handler 执行 → 但 Provider 不知道 input 里有选中文本 → 复制空内容。

**🔥 防线：** handler 最前面检查 `ContextKeyService.getValue("inputFocus")` → true → `document.execCommand("copy")`——走浏览器原生。

---

## 四、完工标准

- [ ] `ClipboardProviderRegistry` 类完整——register / resolve / unregisterAll
- [ ] 核心注册 6 个标准快捷键（Ctrl+C/V/X/A/Delete/F2）——不在任何 plugin.json 中
- [ ] 文件树 Ctrl+C → 复制文件路径（通过 Provider）
- [ ] input/textarea 内 Ctrl+C → 浏览器原生（不经过 Provider）
- [ ] 编辑器 Ctrl+C → Monaco 原生或 Provider
- [ ] `npm run check` 零错误
- [ ] vitest ClipboardProviderRegistry.test.ts

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#15–#17
