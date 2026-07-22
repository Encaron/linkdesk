# Phase 5g — 类型系统去硬编码：核心决策

> 精简自 V3-Phase5g-类型系统去硬编码-深度分析.md（29KB → 核心决策 + VS Code 对标 + 利弊权衡）。
> Phase 5g 拆掉 Phase 3 留下的最后一道围墙——把类型系统从"核心知道所有插件"改为"核心只知道有插件这个概念，具体是谁由 plugin.json 说"。

---

## 一、一句话总结

**Phase 3 把插件 ID 写死在类型系统里——因为那时候插件 = 手写的几个视图，union type 是最佳选择。Phase 5 插件系统建好了，但类型系统还在用 Phase 3 的假设。5g 把 `TabType` 从 8 个硬编码字面量改为 `string`。**

---

## 二、为什么 Phase 3 的 union type 在 Phase 5 变成了束缚

Phase 3 时只有 5 种标签页（终端/工作台/设置/市场/欢迎页）。`TabType = "terminal" | "workspace" | ...` 是正确的——编译期穷举检查确保 `switch(tab.type)` 不漏分支。

Phase 4 建了插件系统，但 `TabType` 没改——因为当时插件只有 4 个，全在 union 里。Phase 4 做了妥协（`legacyPluginId` 映射），两套系统在 `"terminal" = "terminal"` 的巧合下相安无事。

**Phase 5 时所有 Registry 都声明驱动了——唯独类型系统还在说"我知道有哪些插件——就这 8 个"。**

```
命令系统：plugin.json 声明 → CommandRegistry 动态收集 ✅
配置系统：plugin.json 声明 → ConfigurationRegistry 动态收集 ✅
菜单系统：plugin.json 声明 → MenuService 动态收集 ✅
协议系统：plugin.json 声明 → ProtocolRegistry 动态收集 ✅

类型系统：useTabManager.ts:26 —— 8 个硬编码字面量 ❌
```

---

## 三、不改会怎样

加一个新插件的流程：
```
① 写 plugin.json + index.tsx → 放到 plugins/my-plugin/
② 改 TabType 联合类型 → 加 "my-plugin"
③ 改 TAB_IDENTITY 表 → 加一行
④ 改 workspace.schema.json enum → 加 "my-plugin"
⑤ 如果插件图标在底部 → 改 BOTTOM_ICONS Set
⑥ 如果插件有特殊行为 → 改 isShellRenderedTab / isSidebarOnlyView / shouldKeepSidebarOnFocus
⑦ 改 renderTabContent → 加 case "my-plugin"
```

②-⑦ 全是改核心代码。这不是"插件"——这是"在核心里加了新功能"。

---

## 四、VS Code 对照——它怎么做

VS Code 支持几十种编辑器（TextEditor、WebviewEditor、NotebookEditor、ExtensionEditor…），**没有一个是 union type。**

```typescript
// VS Code 源码 src/vs/workbench/common/editor.ts
abstract class EditorInput {
  abstract readonly typeId: string;       // 字符串，不是 enum
  abstract matches(other: EditorInput): boolean;
}

// 新编辑器类型 = 新建 EditorInput 子类。不改任何核心文件。
class TextFileEditorInput extends EditorInput {
  override typeId = 'workbench.editors.files.textFileEditorInput';
  override matches(other: EditorInput): boolean {
    return other instanceof TextFileEditorInput && this.resource.toString() === other.resource.toString();
  }
}
```

VS Code 用 `editor instanceof TextFileEditorInput` 做类型判断，不是 `editor.type === "text"` 字符串比较。**LinkDesk 的对标：`viewRegistry.getViewPlugin(pluginId)` 做运行时查找，`TabType = string` 接受任意 pluginId。**

VS Code 从 0.1 开始就是 Extension Host 架构——十年的代码库里没有一行 `EditorType = "text" | "settings" | ...`。LinkDesk Phase 3 没有插件系统，用 union 是正确的。Phase 5 插件系统就绪了，现在拆——和 VS Code 0.1 的设计对齐。

---

## 五、利弊权衡总表

| | Union Type（Phase 3 遗留） | Dynamic String（5g） |
|:--|:--|:--|
| **加新插件** | 改 7 处核心代码 | 不改核心，只写 plugin.json |
| **编译期安全** | ✅ 穷举检查，漏分支 = 编译错 | ❌ 运行时 fallback 兜底 |
| **重构工具** | ✅ F2 改名 → 全项目更新 | ❌ 改 pluginId = 手动检查 |
| **AI 写插件** | ❌ AI 需要知道改 useTabManager.ts | ✅ AI 只需写 plugin.json + 组件 |
| **插件改名** | ❌ 改 8 个文件 | ✅ 改目录名 + plugin.json |
| **VS Code 对标** | ❌ VS Code 没有 EditorType union | ✅ 对标 VS Code EditorInput.typeId |
| **未来束缚** | ❌ 不改核心 = 加不了新插件类型 | ✅ 核心零改动 |

**结论：编译期安全换来的代价太大——每个新插件都要改核心。这不是"保护"，是"枷锁"。**

---

## 六、5g 交付清单（7 项——已完成）

| # | 变更 | 要点 |
|:--:|------|------|
| 1 | `TabType` union → `string` | 新插件的 pluginId 即 type |
| 2 | `TAB_IDENTITY` 简化 | singleton/confirmOnClose → plugin.json tabBehavior |
| 3 | 特殊判断声明化 | `isSidebarOnlyView`→viewRegistry.viewRole；`shouldKeepSidebarOnFocus`→keepSidebarOnFocus |
| 4 | `BOTTOM_ICONS` 删除 | settings 声明 `iconLocation: "bottom"`，IconBar 从 viewRegistry 读取 |
| 5 | 新元数据字段 | iconLocation / viewRole / shellRendered / keepSidebarOnFocus |
| 6 | coreCommands 去硬编码 | "打开设置"从 viewRegistry 动态查找 |
| 7 | schema enum → string | 任何 pluginId 都是合法 type |

---

## 七、相关文档

- [V3-Phase5-设计.md](V3-Phase5-设计.md) — Phase 5 主设计文档
- [V3-Phase5-承前启后.md](V3-Phase5-承前启后.md) — Phase 4→5 断层 + Phase 5→6 承接
- [[core-ignorance-principle]] — 5g 是这个原则在类型系统上的应用
