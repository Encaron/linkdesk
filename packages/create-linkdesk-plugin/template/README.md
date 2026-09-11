# {{displayName}}

> 一句话：这个插件做什么。（写在最上面——LinkDesk 市场的「详情」页签显示的就是本文件）

<!-- 有场景封面时，把图放到 resources/cover.svg，再取消下面这行的注释：
![{{displayName}} 场景封面](resources/cover.svg) -->

## 怎么用

安装后在 LinkDesk 里怎么打开、点哪里、看到什么。写清楚「第一次用的人怎么走通」。

## 目录说明——东西该放哪

不必预建空文件夹（git 也不记录空目录）。**到需要时再建，位置按下表。**

| 路径 | 放什么 | 什么时候有 |
|:--|:--|:--|
| `plugin.json` | 插件清单 | **必有** |
| `README.md` | 说明——市场**详情**页签的数据源 | 强烈建议 |
| `CHANGELOG.md` | 更新日志——市场**更改日志**页签的数据源 | 强烈建议 |
| `resources/` | 资产：`icon.svg` / `cover.svg` / README 里引用的图 | 有图就有 |
| `i18n/` | `en.json`（key = 中文原文；**不建 zh.json**） | 有 UI 文案就有 |
| `themes/` · `languages/` · `snippets/` | 数据型插件的载荷 | 数据型才有 |
| `src/index.tsx` | 入口（`plugin.json` 的 `entry`） | 视图插件必有 |
| `src/views/` | 侧栏 / 面板视图组件（`contributes.views` 的 render 指向的文件） | 有视图时 |
| `src/components/` | 本插件内部复用的组件 | 需要时 |
| `src/services/` | 域逻辑 / IPC 封装 / 数据层 | 需要时 |
| `src/styles/` | **多份** CSS 时统一放这（单份且与入口同夹也可） | 需要时 |
| `src/__tests__/` | 单元测试（要测就自己 `npm i -D vitest`，脚手架不预装） | 需要时 |

> 🔴 **共享的东西不进这里**——跨插件复用的组件 / hook 走 `@linkdesk/ui`（壳提供的公共包），**不要在插件里再写一份**；只属于本插件的域逻辑才留本地。
> 🔴 **资产一律住 `resources/`，插件根不放散图**——能进安装包的是**被 README 引用过**或**被 `icon` / `marketIcon` 声明过**的文件，目录名本身没有魔法。

## 写这个插件的三条纪律

1. **颜色走主题变量**——CSS 里一律 `var(--xxx)`，**禁硬编码 hex**。理由：LinkDesk 支持整套主题替换，写死颜色 = 换主题后你的插件不跟着变。
2. **UI 文案走 `t()`**——`t("中文原文")`，英文放 `i18n/en.json`，**不建 `zh.json`**（中文 key 自带兜底）。**只加你真的用 `t()` 读过的 key**——没人读的 key 是死 key。代码标识符（`src/index.tsx` 这类）不是文案，别包进 `t()`。
3. **插件身份只来自 `plugin.json` 的声明字段**——需要什么能力就声明什么字段（`contributes` / `tabBehavior` / `icon` …），**不要靠目录名或文件位置让别人猜你的插件是什么**。

## 发布

```bash
npm run publish     # 建 GitHub Release + 上传 .linkdesk-plugin + 更新 catalog
```

首次发布需要 GitHub token（跑一次会引导你填，存在本机）。只预览不动作：`npm run publish -- --dry-run`。

> 完整作者文档见 LinkDesk 仓库的 `docs/03-插件制造/`（API 契约 / 生命周期 / contributes / 分发 / UI 写法规约）。
