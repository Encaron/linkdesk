# Phase 5 → Phase 6 通盘分析

> 2026-07-20。2026-07-21 修订：Phase 6 设计内容迁移到独立文件夹。
> Phase 5 建基础设施，Phase 6 在基础设施上写功能。
> **前提：Phase 5.5 必须先完成**（三栏交互对标 VS Code——`viewRole` 声明替代 `isSidebarOnlyView` 硬编码）。
>
> **Phase 6 完整设计已迁到：** [phase6_编辑能力/](../phase6_编辑能力/)

---

## 一、核心原则

- **Phase 6 不新增 Registry 类型。** 全消费 Phase 5 的 Registry 模式、Phase 4 的 loader 模式、Phase 3 的引擎模式——套用到主题/语言/文件/Profile/激活事件/编辑器/标题栏这些新领域。框架零改动。
- **Phase 6 的本质 = 编辑能力。** 文件树 + 文件操作 + 文本编辑 + 主题/语言引擎 = 完整的文件编辑基础设施。三层（6a/6b/6c）从基础到完整递进。

---

## 二、Phase 5→6 新增需求的承接链

```
Phase 5 已经建好的                     Phase 6 新建或扩展
─────────────────────────           ─────────────────────
ConfigurationService + scope        WorkspaceService（文件夹管理）
                                     ↕ scope 的上下文来源
                                     ProfileService（settings 覆盖）

CoreEvents + EventEmitter            + onDidChangeFileSystem
                                     + onDidChangeWorkspaceFolders
                                     + onDidChangeProfile

CommandRegistry                      FileAssociationService
                                      ↕ 文件→命令的映射
                                     "workbench.action.reopenClosedTab"
                                     "workbench.action.switchProfile"

KeybindingRegistry                   Ctrl+Shift+T → reopenClosedTab
                                     拖入文件 → 开对应插件

MenuService + MenuId                 + MenuId.FileContext
                                     + "打开方式…"子菜单

ContextKeyService                    齿轮菜单完整版
                                     "activeWorkspace" / "fileTreeHasSelection"
                                     "profile" 等新 context key

LogChannel（Phase 5 盲区 10）        输出面板 UI（查看器）

ThemeEngine（Phase 3）               ThemeRegistry + ThemeBrowser UI
                                     出厂 Dark/Light → contributes.themes

i18next（Phase 2）                   LanguageRegistry
                                     出厂 en/zh → contributes.languages

loader + viewRegistry（Phase 4）      loader 升级：
                                      + parseContributions(themes/languages/fileAssociations/resources)
                                      + activationEvents 处理
                                      + extensionDependencies 检查
                                      + scanAll({ filter: profile.plugins })

Monaco Editor（Phase 2 终端已有）     JSON 编辑器标签页

Tauri window API                   标题栏暗色化 + 系统菜单 + ☰ 汉堡菜单
```

---

## 三、详见 Phase 6 文件夹

| 文档 | 内容 |
|------|------|
| [V3-Phase6-设计.md](../phase6_编辑能力/V3-Phase6-设计.md) | 28 项任务 + 19 个隐藏任务 + 承接链细节 + 不做清单 |
| [V3-Phase6-实施顺序.md](../phase6_编辑能力/V3-Phase6-实施顺序.md) | 5h→5.5→6a→6b→6c 完整路径 + 每层验证标准 |
| [V3-Phase6-终端会话持久化.md](../phase6_编辑能力/V3-Phase6-终端会话持久化.md) | 终端 .session.json 持久化——Phase 6 消费者 feature |

---

## 四、5h→5.5→6 链路

```
5h（运行时动态加载）→ 5.5（三栏交互对标 + viewRole）→ Phase 6（零框架改动）

Phase 6 三层递进：
  6a（文件树基础闭环 7 项）→ 6b（编辑体验闭环 8 项）→ 6c（引擎+壳 13 项）
```

路线图唯一权威：`docs/开发管理/V3开发计划.md`。
