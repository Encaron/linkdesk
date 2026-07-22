# Phase 7b — 文件树与编辑

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7b 展开。
> **设计细节直接引用旧 P6a/P6b——内容已完整，只是 Phase 归属从"编辑能力"变成"多 WebView + 编辑能力"的一部分。**
>
> 完整设计见：**[旧 Phase 6 设计](../phase6_编辑能力/V3-Phase6-设计.md)** §2.1-2.4, §2.9, §2.10, §2.14-2.17
> 实施细节见：**[旧 Phase 6 实施顺序](../phase6_编辑能力/V3-Phase6-实施顺序.md)** §第 1 层-第 2 层

---

## 一、旧 P6→新 P7 的变化

| | 旧 P6a/P6b | 新 P7b |
|------|------|------|
| Phase 位置 | 编辑能力第一批 | 多 WebView 之后的第一批消费者 |
| 底座 | 单 WebView，ErrorBoundary 未归一化 | 多 WebView 进程隔离，ErrorBoundary 全覆盖 |
| FileService | 和文件树同一批建 | Phase 6c 已建好——直接消费 |
| WorkspaceService | 同上 | Phase 6c 已建好——直接消费 |
| 文件树键盘操作 | 在文件树插件内实现 | 键盘操作通过 KeybindingRegistry + Chord（P6c 已建） |

**设计细节不变——文件树 UI、FileAssociationService、Monaco JSON 编辑器、系统文件拖入、Ctrl+Shift+T、搜索、编码、多工作区——所有设计沿用旧 P6a/P6b。**

---

## 二、新增依赖（Phase 6 提供）

文件树诞生时，以下基础设施已就绪（Phase 6c）：

```
FileService
  → 文件树 listDir(rootPath) → 渲染文件列表
  → Monaco readFile(path) → 编辑 JSON
  → watch(rootPath) → 外部变动自动刷新

WorkspaceService
  → rootPath → 文件树的根
  → openFolder() → 欢迎页/标题栏/文件树 三处入口

KeybindingRegistry + Chord
  → F2 重命名（when: Explorer focus + !root + writable）
  → Delete 移到回收站（when: Explorer focus）
  → Ctrl+X/C/V 剪切复制粘贴
  → Ctrl+Shift+F 跨文件搜索

CoreEvents.onDidChangeFileSystem
  → FileService.watch 检测外部变动 → emit → 文件树自动刷新

CoreEvents.onDidChangeWorkspaceFolders
  → WorkspaceService 文件夹变化 → emit → 欢迎页/标题栏/文件树联动
```

---

## 三、任务清单（从旧 P6a/P6b 直接迁移）

| # | 任务 | 旧编号 | 设计文档位置 |
|:--:|------|:--:|------|
| 1 | 文件树视图——📁 图标栏 → 侧栏/标签页（viewRole: sidebarPrimary） | P6a #1 | 旧 §2.4 |
| 2 | 文件树键盘操作——F2/Delete/Ctrl+XCV/Ctrl+N/Ctrl+Shift+N，全部带 when 条件对标 VS Code | P6a #1b | — |
| 3 | 文件关联——FileAssociationService + contributes.fileAssociations | P6a #2 | 旧 §2.2 |
| 4 | 系统文件拖入 + Reopen Closed Tab（Ctrl+Shift+T） | P6a #5, #6 | 旧 §2.14, §2.15 |
| 5 | Monaco JSON 编辑器标签页（打开 settings.json / keybindings.json） | P6a #7 | 旧 §2.17 |
| 6 | Tauri fs API 归一化清理——3 个服务 7 处重复 I/O 改为走 FileService | P6a #8 | — |
| 7 | 文件搜索（Ctrl+Shift+F 跨文件内容搜索） | P6b #8 | — |
| 8 | 文件树多选/批量操作 | P6b #9 | — |
| 9 | 文件编码检测/切换（EncodingService） | P6b #10 | — |
| 10 | 拖拽文件树节点到编辑区 | P6b #11 | — |
| 11 | Settings Editor JSON schema 自动补全 | P6b #12 | — |
| 12 | 多工作区文件夹（Multi-root） | P6b #13 | — |
| 13 | 文件图标主题 | P6b #14 | — |
| 14 | 文件装饰器框架（FileDecorationProvider 接口 + DecorationRegistry） | P6b #15 | — |

---

## 四、新增注意事项

### 4.1 多 WebView 下的文件树

- 文件树在独立 WebView 中运行
- `FileService.listDir()` 通过 IPC 调用壳侧的 FileService
- 文件树右键菜单走 IPC → 壳侧 MenuService（对标 VS Code：文件树和菜单在同一个 WebView 中？还是在不同？——Tauri 多 WebView 下，右键菜单在壳 WebView 渲染更简单，文件树只负责发"我被右键了"的 IPC 事件）

### 4.2 不再使用 window.confirm()

Phase 6c 的 DialogService 已就绪：
- 删除文件确认 → `DialogService.confirm({ title: "删除文件", message: "..." })`
- 覆盖文件确认 → 同上

### 4.3 禁止写死插件 ID

提交前 grep：`git diff --staged | grep -E 'pluginId === "file-tree"'` → 必须返回空。文件树走 `viewRole: "sidebarPrimary"` 声明，和 terminal 完全相同路径。

---

## 五、相关文档

- [旧 Phase 6 设计 §2.1-2.4, §2.9, §2.10, §2.14-2.17](../phase6_编辑能力/V3-Phase6-设计.md) — 文件树 + 编辑详细设计
- [旧 Phase 6 实施顺序 §第 1 层-第 2 层](../phase6_编辑能力/V3-Phase6-实施顺序.md) — 实施细节
- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — 文件树运行的 WebView 底座
- [LinkDesk-Phase6-基础设施缺口.md](../phase6_底层加固_暂定/LinkDesk-Phase6-基础设施缺口.md) — FileService / WorkspaceService（文件树直接消费）
