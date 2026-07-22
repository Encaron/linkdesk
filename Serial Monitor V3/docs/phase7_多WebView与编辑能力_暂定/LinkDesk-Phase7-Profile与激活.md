# Phase 7d — Profile 与激活

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7d 展开（前半——Profile + 激活 + 齿轮菜单 + 输出面板 + 终端会话持久化）。
> **设计细节直接引用旧 P6d——内容已完整。**
>
> 完整设计见：**[旧 Phase 6 设计](../phase6_编辑能力/V3-Phase6-设计.md)** §2.12（Profile）, §2.13（activationEvents）, §2.16（extensionDependencies）, §2.11（齿轮菜单）, §2.8（输出面板）

---

## 一、旧 P6→新 P7 的变化

| | 旧 P6d | 新 P7d |
|------|------|------|
| 前置 | FileService 在建 | FileService 已就绪（P6c） |
| Profile 存储 | P6d 自建 `.linkdesk/profiles/` | 走 FileService 读写（归一化） |
| activationEvents | 在单 WebView 内按需 import() | 多 WebView——按需创建 WebView |
| 终端会话持久化 | 消费 FileService | FileService 已就绪，直接写 `.session.json` |

### 多 WebView 下的 activationEvents

```
单 WebView（旧）：
  activationEvents 触发 → import() 插件 JS → 注册组件 → React render

多 WebView（新）：
  activationEvents 触发 → 创建插件 WebView → 加载 JS → React render
  → 更彻底——不仅代码不 import，连 WebView 都不创建
```

---

## 二、任务清单（从旧 P6d 直接迁移）

| # | 任务 | 旧编号 | 设计文档位置 |
|:--:|------|:--:|------|
| 1 | Profile 系统——ProfileService + loadProfile / switchProfile + 五维验证 | P6d #19 | 旧 §2.12 |
| 2 | activationEvents——onCommand / onFileOpen / onPortOpen 按需激活 | P6d #20 | 旧 §2.13 |
| 3 | extensionDependencies——加载前检查缺失依赖 | P6d #21 | 旧 §2.16 |
| 4 | 齿轮菜单完整版——context key 驱动，Profile 切换时菜单联动 | P6d #22 | 旧 §2.11 |
| 5 | 输出面板 UI——LogChannel 消费端，Profile 切换时频道变化 | P6d #23 | 旧 §2.8 |
| 6 | 终端会话持久化——`.session.json` 文件 + 文件树双击恢复 | P6d | [旧终端会话持久化](../phase6_编辑能力/V3-Phase6-终端会话持久化.md) |

### Profile 五维验证（不变量——旧设计照搬）

| # | 维度 | 验证方法 | 失败后果 |
|:--:|------|------|------|
| 1 | 插件加载列表 | `PluginStateService.getAll()` | 幽灵插件 |
| 2 | settings 值 | `ConfigurationService.inspect(key)` | 配置残留 |
| 3 | 主题 CSS 变量 | `getComputedStyle(document.body).getPropertyValue('--bg')` | UI 半新半旧 |
| 4 | 语言 | `i18next.language` + UI 文字 | 碎片化体验 |
| 5 | 布局（标签页+工作区） | tabs[] + activeGroupId + workspace root | 标签页残留 |

---

## 三、新增注意事项

### 3.1 多 WebView 下的 Profile 切换

```
切 Profile →
  1. 禁用不在 Profile 中的插件 → 销毁对应 WebView
  2. 启用在 Profile 中的插件 → 创建对应 WebView
  3. 应用 settings → IPC 广播给所有活跃的插件 WebView
  4. 切换主题 → IPC 广播 theme:changed
  5. 切换语言 → IPC 广播 lang:changed
  6. 打开 workspace → WorkspaceService.openFolder

六个操作任何一个失败 → toast 报告哪个操作失败了
对标 VS Code：失败时回退到切换前的状态
```

---

## 四、相关文档

- [旧 Phase 6 设计 §2.8, §2.11-2.13, §2.16](../phase6_编辑能力/V3-Phase6-设计.md) — Profile/激活/齿轮菜单/输出面板详细设计
- [终端会话持久化](../phase6_编辑能力/V3-Phase6-终端会话持久化.md) — 会话文件格式 + 双击恢复
- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — Profile 切换时的 WebView 批量创建/销毁
- [LinkDesk-Phase7-壳完善与抛光.md](./LinkDesk-Phase7-壳完善与抛光.md) — 7d 后半（通知/标题栏/模糊搜索/兼容）
