# 已知问题——5.5 / Phase 6 需处理

> 2026-07-21。从 [三栏交互对标](V3-Phase5.5-三栏交互对标.md) §九 + memory 整理。
> 不在此刻修，但设计新机制时需考虑。每个 bug 标注了归属 Phase 和修法。

---

## Bug 1：预览标签页顶替回归

**现象：** 市场点击插件 A → 斜体"插件 A (介绍)" ✅。再点插件 B → 开新标签页而不是顶替 ❌。

**根因：** `useTabManager.ts:210` Phase 5 "rootfix" 把预览替换从 opt-OUT 改成了 opt-IN（`opts?.pinned === false`），但 `marketplace/sidebar.tsx:122` 不传 `pinned` → `undefined === false` → 永不替换。

**修法：** 两种路径——要么 marketplace 调用方传 `pinned: false`（小改），要么回退 opt-IN 逻辑改为默认替换（正确改）。

**归属：** 5h 之前修。5h 改 loader 会碰到同一段 useTabManager 代码。

详见 memory `preview-tab-regression.md`。

---

## Bug 2：卸载后无法浏览插件详情

**现象：** 插件卸载后，市场里点它 → 打不开介绍页。VS Code 卸载后仍可浏览扩展详情。

**根因：** 市场从 `plugins/<pluginId>/plugin.json` 读元数据。卸载移走目录 → json 消失。VS Code 有服务端 marketplace + 本地缓存，浏览和安装是独立操作。

**解决方向：** 建插件元数据缓存层——安装/发现时存一份 plugin.json 副本。市场从缓存读，安装/卸载只改缓存中的状态字段（不删条目）。

**归属：** 5h（运行时动态加载）。与 5h 的插件加载机制紧密相关——动态加载时自然要维护一份"已知插件清单"。

详见 memory `plugin-detail-after-uninstall.md`。

---

## Bug 3：终端 COM 口多实例

**现象：** 新建终端标签页继承上一个终端的 COM 口状态——打开第 2 个终端标签页，它显示"COM3 已连接"，但实际上没有独立的串口连接。

**根因：** 终端插件使用共享状态（全局 SerialContext），未做 tabId 隔离。每个终端标签页应该有独立的连接状态。

**修法位置：** `plugins/terminal/index.tsx` ——终端插件重写时，为每个 tabId 维护独立的串口状态。

**归属：** 5.5（终端侧栏重写为控制面板时修）。侧栏重设计时自然会碰到串口状态管理——届时做 tabId 隔离。

详见 memory `terminal-multi-instance-com-port-bug.md`。

---

## Bug 4：JSON 按钮 alert 占位

**现象：** Settings Editor `{}` 按钮弹 alert 显示 JSON。代码注释写明 `TODO Phase 6 §2.17：Monaco JSON 编辑器标签页`。

**根因：** 不是 bug——是占位符。SettingsView.tsx:120 的 `{}` 按钮只是临时入口。

**修法：** Phase 6a Monaco JSON 编辑器标签页就位后，`{}` 点击 → `createTab("editor", {filePath: "settings.json"})` 直接打开 Monaco 编辑器。

**归属：** Phase 6a（文件树基础闭环中交付 Monaco JSON 编辑器标签页）。

详见 memory `json-button-alert-placeholder.md`。

---

## Bug 5：F5 键——刷新 vs 调试

**现象：** LinkDesk F5 = 页面刷新（webview 默认行为）。VS Code F5 = 调试入口。

**根因：** Tauri webview 默认 F5 刷新。不是 bug——是未实现的 feature。

**修法：** MCU 调试系统（Phase 6+）实现时，F5 改为调试触发。刷新功能移到 Ctrl+R。

**归属：** 远期——等 MCU 调试系统就位。

详见 memory `f5-debug-vs-refresh.md`。

---

## 总结

| # | Bug | 归属 Phase | 何时修 |
|:--:|------|:--:|------|
| 1 | 预览标签页顶替回归 | useTabManager.ts | **5h 之前** |
| 2 | 卸载后无法浏览插件详情 | loader | **5h** |
| 3 | 终端 COM 口多实例 | terminal/plugin | **5.5** |
| 4 | JSON 按钮 alert | Settings Editor | **6a** |
| 5 | F5 调试 vs 刷新 | 远期 | Phase 6+ |
