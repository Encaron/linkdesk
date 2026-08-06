# E6 — 插件生态与发布

> 2026-08-07。**E5 78 任务全部完成。E5-收尾 31/39。** 壳内部已经干净了。
> E6 的主题：**让软件能出门。** 插件作者能独立开发、构建、发布插件。用户能下载安装包、浏览市场、一键安装插件。
>
> **E5 vs E6：** E5 是内部装修——归一化、去胶水、架构清理。E6 是开门营业——工程化收尾、插件独立构建、市场分发、文档。

---

## 零、为什么有 E6——用户拿到的是一个不能装插件的壳

### 0.1 触发点——"第三方作者怎么做一个插件？"

Encaron 在 2026-08-07 发现了一个根本问题：

**现状：**
```
插件作者想做插件 → 没有脚手架 → 没有独立 build → 没有 SDK 类型提示
→ 不知道从哪开始 → 即使写出来了 → 不知道怎么分发给用户
→ 即使分发 → 用户怎么安装？
```

**对话核心发现：**
- 插件源码在 `plugins/builtin/` 和 `plugins/user/` 里，依赖全局 `node_modules/`——第三方作者不能 `npm install` 自己的依赖
- 插件和壳在同一个 Vite build 里——第三方插件要源码放进仓库才能跑
- `window.linkdesk.*` API 存在但没有类型定义文件——作者写代码无智能提示
- 没有 `npm create linkdesk-plugin` 脚手架——作者手动创建目录结构
- 没有独立 build 命令——作者不知道 `npm run build` 后产出什么
- 插件市场有前端 UI 但没有后端存储和分发流水线

**一句话：LinkDesk 现在是一个工程师的工具，不是一个产品。**

### 0.2 三个用户角色

```
┌─────────────────────────────────────────────────────────────┐
│                       LinkDesk 的用户                        │
│                                                             │
│  ① 插件作者                                                 │
│     下载脚手架 → 写 React → npm run dev 预览                │
│     → npm run build → 上传到市场                            │
│                                                             │
│  ② 普通用户                                                  │
│     下载 LinkDesk.exe → 启动 → 打开插件市场                  │
│     → 浏览 → 点安装 → 直接用                                 │
│                                                             │
│  ③ 你自己（维护者）                                          │
│     npm run check → git push → GitHub Actions               │
│     → 自动 build → 自动发布到官网                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

E6 要确保这三个人各自有一条完整链路。

### 0.3 关键矛盾——插件源码 vs 插件分发

```
现在：
  插件源码 ──→ 和壳一起 Vite build ──→ 全部打进 dist/

问题：
  第三方插件怎么办？源码放哪？谁来做 build？
  用户能不能不重新编译壳就装插件？

答案（E6）：
  插件 = 独立 build 产物 = .linkdesk-plugin 文件
  壳 build 时不包含插件
  用户启动壳后从市场下载 .linkdesk-plugin → 安装 → 用
```

---

## 一、E6 六层架构

```
┌─────────────────────────────────────────────────────────────┐
│ 第 1 层：插件独立构建——每个插件独立出 .linkdesk-plugin        │
│ @linkdesk/plugin-sdk（类型+Vite 配置+验证）。                │
│ loader 改造——支持加载打包格式。                               │
│ 插件作者 npm run build → 一个文件，包含所有依赖。              │
│                                                             │
│ 第 2 层：插件开发工具链——脚手架 + 预览 + build + 发布         │
│ npm create linkdesk-plugin → 写代码 → npm run dev 预览       │
│ → npm run build → 上传。零门槛。                             │
│                                                             │
│ 第 3 层：插件市场——存储 + 分发 + 安装                         │
│ GitHub Releases 存储。壳内 market 下载+安装+管理。            │
│ installed-plugins.json 记录。                               │
│                                                             │
│ 第 4 层：端到端验证——造一个真插件，在安装版里跑通              │
│ 测试插件覆盖侧栏/标签栏/右键菜单/快捷键。                      │
│ 开发模式验证 → 独立构建 → 生产安装版验证。                     │
│                                                             │
│ 第 5 层：文档与发布——开发者指南 + CI + 官网                   │
│ 从零到发布的完整文档。CI 自动构建+发布。                       │
└─────────────────────────────────────────────────────────────┘
```

### 执行顺序

**第 1 层是地基——必须先做。** 插件独立构建是第 2-4 层的前置——没有独立 build，脚手架没东西调，市场没东西发，验证插件没东西装。

**第 2 层在第 1 层之后。** `npm create linkdesk-plugin` 生成的模板里用的就是 `@linkdesk/plugin-sdk` 的配置。

**第 3 层可以和第 2 层并行。** 市场后端和 scaffold 不互依赖。

**第 4 层串行——在第 1-3 层之后。** 全链路验证需要 SDK + scaffold + 市场都就绪。

**第 5 层全程穿插。** 文档可以边做边写。

```
最长串行链：
  SDK(第1层) → scaffold(第2层) → 验证(第4层)
  市场(第3层) 可以和 scaffold(第2层) 并行
  文档(第5层) 全程穿插
```

**第 6 层随时可做。** 文档可以边做边写。

```
最长串行链：
  E5收尾(第1层) → SDK(第2层) → scaffold(第3层) → 验证(第5层)
  市场(第4层) 可以和 scaffold(第3层) 并行
  文档(第6层) 全程穿插
```

---

## 二、四步用户故事——Encaron 的需求

### 2.1 "整理好现有工程，给用户上传一个正常好用的软件"

```
你的电脑                       用户电脑
────────                      ────────
npm run electron:build        下载 LinkDesk Setup.exe
→ dist-electron/              安装 → 双击桌面图标
→ LinkDesk Setup.exe          启动 → 看到完整壳
                                → 文件树/编辑器/串口/设置 全正常
                                → 菜单/快捷键/右键 全正常
                                → 主题切换/语言切换 全正常
```

**对应任务：** 第 1 层 E5 收尾 + 生产构建验证。

### 2.2 "插件链自动下载和插件生产全流程"

```
插件作者                        市场                        用户
────────                      ────────                    ────────
npm create linkdesk-plugin    GitHub Releases             打开 LinkDesk
写 React 组件                  存储 .linkdesk-plugin       打开插件市场
npm run dev（预览）             marketplace.json           搜索插件
npm run build                  索引所有插件                 点"安装"
→ .linkdesk-plugin                                        → 下载 → 安装 → 用
上传到 GitHub Releases
```

**对应任务：** 第 2 层（SDK）+ 第 3 层（脚手架）+ 第 4 层（市场）。

### 2.3 "自己造个插件，运用到侧栏、标签栏、右键、快捷键"

```
创建一个测试插件 hello-world：
  plugin.json:
    contributes.viewsContainers.sidePanel: "Hello"
    contributes.commands: hello.sayHi / hello.openTab
    contributes.menus: EditorContext → hello.sayHi
    contributes.keybindings: Ctrl+Shift+H → hello.sayHi

功能验证清单：
  ✅ 图标栏出现 Hello 图标，点击打开侧栏
  ✅ 侧栏显示 Hello 视图
  ✅ 标签栏出现 Hello 标签页
  ✅ 标签页可以关闭、切换
  ✅ 编辑器右键菜单出现 "Say Hi"
  ✅ Ctrl+Shift+H 触发
  ✅ 切英文语言，所有 UI 文字变英文
```

**对应任务：** 第 5 层——验证插件。

### 2.4 "直接运用到安装版的软件中"

```
① npm run electron:build（构建安装包）
② 安装 LinkDesk.exe
③ 打开 LinkDesk → 插件市场 → 搜索 hello-world → 安装
④ 验证：所有功能在安装版里和开发版一样正常
⑤ hello-world.linkdesk-plugin 在 dist 外面——壳发货时不带它
   用户从市场下载安装后才出现
```

**对应任务：** 第 5 层——生产安装验证。

---

## 三、对标 VS Code

| VS Code | LinkDesk E6 目标 |
|:--|:--|
| `@types/vscode` | `@linkdesk/plugin-sdk`——类型定义 + Vite 配置 + 验证 |
| `yo code` 脚手架 | `npm create linkdesk-plugin`——一键生成模板 |
| `vsce package` | `npm run build`——Vite 打包产出 `.linkdesk-plugin` |
| VS Code Marketplace | GitHub Releases + marketplace.json |
| Extension Host 独立进程 | 单 WebView pre-bundle（多 WebView 零改动复用） |
| `package.nls.json` 本地化 | `i18n/en.json`——每插件自带翻译 |
| `package.json` contributes | `plugin.json` contributes——已有 ✅ |
| VS Code 官网下载页 | linkdesk.io/download |

---

## 四、现状——E6 起跑线

### 已有的（E5 成果）

```
✅ plugin.json 字段规范（contributes/pluginRole/appearsIn/tabBehavior）
✅ 插件目录结构规范（views/components/services/i18n）
✅ window.linkdesk.* 26 命名空间 API
✅ i18n 每插件自带翻译（contributes.i18n + 渲染时 t()）
✅ ESLint no-restricted-imports（插件禁 import @src/core）
✅ 插件市场前端 UI（marketplace 插件）
✅ OverlayPortal 通用悬浮层
✅ Lucide 图标系统
✅ plugin-shell.html + dev:plugin 预览命令（E5#110 初版）
✅ 审计脚本 scripts/audit-i18n.mjs + scripts/check-spacing-grid.mjs
```

### 缺失的（E6 要做）

```
❌ 插件独立 Vite 构建——每个插件独立 build，产出 .linkdesk-plugin
❌ @linkdesk/plugin-sdk npm 包——window.linkdesk.* 类型定义
❌ create-linkdesk-plugin npm 包——脚手架
❌ 插件市场后端——文件存储 + API + 上传
❌ 插件安装机制——壳内下载 .linkdesk-plugin → 解压 → 注册
❌ installed-plugins.json——已安装插件记录
❌ 生产构建验证——npm run electron:build → 可安装 .exe → 全功能正常
❌ CI 自动构建发布——GitHub Actions
❌ 官网下载页——linkdesk.io/download
❌ 插件开发完整文档
❌ 测试插件（覆盖侧栏/标签栏/右键/快捷键/i18n）
❌ E5#111, E5#114, E5#118, E5#119, E5#120（E5 收尾剩余 6 项——E5#112-#113 已移至 E6）
```

---

## 五、文档导航

| 文档 | 内容 |
|:--|------|
| `E6-执行清单.md` | **🔥 唯一真相源。** 6 层完整任务，进度追踪 |
| `00-AI执行守则-必读.md` | AI 进场必读——陷阱、检查点、执行策略 |
| `01-工程化收尾/` | E5 收尾完成 + 生产构建验证 + CI |
| `02-插件独立构建/` | @linkdesk/plugin-sdk 设计 + Vite 配置 + .linkdesk-plugin 格式 |
| `03-插件开发全流程/` | create-linkdesk-plugin 脚手架 + 本地预览 + 发布流水线 |
| `04-插件市场/` | GitHub Releases 方案 + 安装卸载 + marketplace.json |
| `05-验证/` | 测试插件设计 + 生产安装验证 |
| `06-文档与发布/` | 插件开发指南 + 发布清单 + 官网 |

---

> **← 上一 Phase：** `../E5_核心归一化与壳重构_待执行/`
> **→ 下一 Phase：** `../../04-出厂制造/`（FloatingPanel / 终端系统 / 可拖出标签页——壳重构完成后火车上轨）
