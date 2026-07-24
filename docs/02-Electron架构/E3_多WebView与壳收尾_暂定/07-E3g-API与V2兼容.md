# E3g — 通用 API + V2 兼容

> 2026-07-24。从旧 P7d 拆分——壳的最后一批 API：StatusBarItem、图标共享、☰ 完整版、V2 配置导入。
> **性质：** 纯 TS/React。所有 API 都是壳提供、插件消费。
> **依赖：** E3f（☰ 基础版就绪——本 Phase 做完整版）

---

## 一、动态 StatusBarItem

```typescript
const item = createStatusBarItem("myPlugin.cursorPos", {
  label: "行 1, 列 1", align: "right", priority: 10
});
// unmount → dispose() 自动移除
```

对标 VS Code `vscode.window.createStatusBarItem()`。~50 行。

---

## 二、contributes.icons（共享图标）

```json
// 插件 A 贡献
{ "contributes": { "icons": { "stm32-chip": { "description": "STM32 芯片图标", "default": { "fontPath": "icons.woff", "fontCharacter": "\\e001" } } } } }
// 插件 B 使用
{ "icon": "stm32-chip", "iconSource": "shared" }
```

~30 行。

---

## 三、☰ 完整版

在 E3f 基础四组之上，加三项完善：

### 3.1 快捷键提示

菜单项右侧灰字显示绑定快捷键（如 `Ctrl+K Ctrl+O`）。读 KeybindingRegistry。

### 3.2 禁用态灰显

when 条件不满足 → 菜单项灰色不可点击。读 ContextKeyService。

### 3.3 插件动态贡献的顶级菜单组

插件 `contributes.menus` 声明顶级菜单组 → ☰ 自动多一列。

合计 ~100 行。

---

## 四、V2 配置导入

V2 `prefs.json` → 映射表转换。`文件 → 导入 → V2 配置...`。

映射逻辑（参考 Phase 5 迁移经验）：
- V2 `BaudRate` → `terminal.baudRate`
- V2 `Encoding` → `terminal.encoding`
- V2 `Theme` → `app.theme`
- 未知 key → 跳过 + toast 报告

~60 行。

---

## 五、任务清单

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 60 | 动态 StatusBarItem——运行时创建 + dispose 自动清理 | ~50 | 插件 mount → 状态栏出现 → unmount → 消失 |
| 61 | contributes.icons——共享图标注册 + 引用 | ~30 | 插件 A 贡献图标 → 插件 B 的 icon 字段引用 → 渲染 |
| 62 | ☰ 完整版——快捷键提示 + 禁用态灰显 + 插件菜单组 | ~100 | ☰ → 右侧灰字快捷键 → when 不满足项灰色 → 插件菜单多一列 |
| 63 | V2 配置导入——映射表 + 文件选择 + 逐 key 迁移 | ~60 | 选 V2 prefs.json → 波特率/编码/主题导入 |
| **合计** | | **~240 行** | |

> ~~#53 Toggle 动态标题~~ 已移除——Phase 5.5 已修（`f476c21` registerCommand 更新 title）。

---

## 六、验证标准

```
StatusBarItem → 创建 → 状态栏出现 → dispose → 消失 → 无残留
共享图标 → 插件 A 贡献 → 插件 B 引用 → 图标正确渲染
☰ 完整版 → 快捷键灰字 → 禁用态灰色 → 插件菜单项可用
V2 导入 → 选文件 → 配置映射正确 → 未知 key toast 提示
```

---

> **← 上一份：** `06-E3f-壳UI收尾.md`
> **🏁 E 编号到此为止。此后全是插件。**
> **E3 索引：** `00-README.md`
