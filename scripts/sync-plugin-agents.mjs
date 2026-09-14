#!/usr/bin/env node
/**
 * sync-plugin-agents——给 18 只官方插件仓铺 / 校验 **AGENTS.md**（＋ `.vscode/settings.json`）。
 *
 * ── 为什么要有它（而不是手改 18 遍）──
 * 插件源码外移之后，**每个插件仓都是自己那只插件的真源**（壳仓没有源码了）。作者（也就是我们）
 * 未来会**在那个仓里直接开 AI 干活**——那时 AI 面对的是一个陌生工程，它需要快速知道：
 * 「这个仓是什么 / 这只插件是什么 / 规矩在哪 / 命令怎么敲」。
 * 脚手架的 `template/AGENTS.md` 已经把这套写给第三方作者了；**官方这 18 只仓当时没有补**
 * （它们比脚手架换代更早，是同一形状的历史工程）。
 *
 * 🔴 **为什么是"模板 ＋ 每只一段事实"，不是 18 份手抄**：
 * 18 份手抄 = 18 份会各自漂移的副本，而且「脚手架改了、18 只没跟」这类漂移**没有任何门禁能发现**
 * （插件仓不在壳仓 `npm run check` 的扫描域里）。所以本脚本把共享骨架**只写一份**，
 * 每只仓只提供**它自己的那段事实**（是什么 / 出现在哪 / 关键路径 / 注意），
 * 并且提供 `--check` 当漂移门禁。⇒ 与 `sync-plugin-ci.mjs` 同一套思路（同源靠机械动作，不靠自觉）。
 *
 * ── 自动派生的字段（绝不手抄第二份）──
 *   pluginId / name / version / description  ← 现场读该仓的 `plugin.json`
 *   是否随包出厂（seed）                      ← 壳仓 `bundled-plugins.lock.json`（**唯一真相源**）
 *   有哪些命令                               ← 现场读该仓的 `package.json` 的 scripts
 *   是否有 src/ 与 i18n/                      ← 现场看目录
 *   ⇒ 这些一漂，`--check` 就红；**人写的只有「事实」那段**。
 *
 * ── 用法 ──
 *   node scripts/sync-plugin-agents.mjs --dry-run   # 只报「要写哪几只、差在哪」，不落盘
 *   node scripts/sync-plugin-agents.mjs             # 落盘（AGENTS.md + .vscode/settings.json）
 *   node scripts/sync-plugin-agents.mjs --check     # 只校验、不改：漂移 / 缺文件 / 出现内部任务号 ⇒ exit 1
 *   LINKDESK_PLUGIN_CONTAINER=<dir> 覆盖容器位置（默认 E:\linkdesk-plugins\official）
 *
 * 🔴 `--check` **已挂进 `npm run check`**（2026-09-15 用户拍板补的门禁缺口——此前这条漂移两个
 *   会话都漏过：bump 之后 AGENTS.md 里那句「当前版本 x.y.z」会过期，而没有任何门禁在看它）。
 *   正因如此，**容器不存在时必须跳过而不是判红**：CI / 别的克隆上没有那个仓库外目录。
 *   两种「读不到仓」要分开——目录不在 = 跳过（exit 0）；目录在但零仓 = 位置配错（exit 1）。
 *
 * ⚠️ 本脚本只改**本地容器**；**不碰 git、不 commit、不推送**（推 18 个仓等用户点头）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanText } from "./lib/author-symbols.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:\\linkdesk-plugins\\official";
const LOCK = join(ROOT, "bundled-plugins.lock.json");
const TEMPLATE_VSCODE = join(ROOT, "packages", "create-linkdesk-plugin", "template", ".vscode", "settings.json");
const DRY = process.argv.includes("--dry-run");
const CHECK = process.argv.includes("--check");

/* ── 命令注释：壳/插件的统一命令表（现场读 scripts，只给存在的那些写注释） ── */
const SCRIPT_NOTE = {
  dev: "浏览器预览宿主（改码热重载）",
  "dev:real": "真机环——写进 {userData}/plugins/<id> 并 CDP 重载（要真 IPC / 串口 / 文件时用）",
  validate: "校验 plugin.json / 主题配方 / 声明的字典文件真的在",
  lint: "SDK 规则腿（硬编码颜色 / 字号 / 4px 网格 / 自定义 eslint 规则）——**只报告、不拦**",
  test: "单元测试（vitest）",
  verify: "🔴 **交付前严格腿** = 本仓 CI 跑的那条（lint 判红 + 跨插件 import + 字典完整性 + 声明自洽）",
  build: "产出 `<pluginId>.linkdesk-plugin`（装进 LinkDesk / 发布都用它）",
  publish: "发版到本仓自己的 GitHub Release（**上架两步里的第一步**）",
};

/**
 * 每只插件的「事实」——**人写的那一半**。键 = pluginId（现场目录名说话，不另立名单）。
 * 写什么：① 这是什么 ② 用户在哪看到它 ③ 关键路径住哪 ④ 动它之前必须知道的。
 */
const FACTS = {
  editor: {
    what: "Monaco 代码编辑器。双击文件打开标签页，提供语法高亮、智能提示、并排 Diff。**它是主区（标签页）插件，不是侧栏插件。**",
    where: "主区标签页（`appearsIn.tabBar`）；图标栏不出现。入口 = 文件树双击 / 命令面板。",
    layout:
      "`src/index.tsx` 只做一件事：把 `filePath` 按 `|||` 拆开，决定渲染 `EditorTab` 还是 `DiffEditor`。\n" +
      "真正的实现在 `src/views/EditorView/`、`src/views/DiffEditor/`；能力面在 `src/services/`（Monaco 引导、LSP 桥、语言映射、主题同步、热退出、导航桥）。",
    notes: [
      "🔴 **绝不调 `monaco.editor.defineTheme` / `setTheme`**——Pool 下 `window.monaco` 是共享单例，任何插件设主题都会**全局污染**（壳仓 CLAUDE.md「常发已知问题」有这条）。",
      "`contributes.fileAssociations` 45 条扩展名 → 语言，是「新扩展名归哪个语言」的第一落点；真正的语言能力（LSP）在 `python` 插件里。",
      "`tabBehavior.identityField: \"filePath\"` —— 同一个文件不会开出第二个标签页（改这里会影响「重复打开」的行为）。",
    ],
  },
  "file-tree": {
    what: "文件树 / 资源管理器。图标栏进侧栏，含「资源管理器」与「搜索」两个视图。",
    where: "侧栏（`viewsContainers.explorer.location: \"sidebar\"`）；图标栏顶部有入口按钮。",
    layout:
      "`src/index.tsx` 只有一行 re-export，**本体在 `src/views/FoldersView.tsx`**（新同学最容易在这里找错地方）；\n搜索在 `src/views/SearchView.tsx`；模型 / 拖放 / 键盘 / 剪贴板 / 排除规则都在 `src/services/FileTree*/`。",
    notes: [
      "🔴 **侧栏 sticky 与双层滚动不兼容**——动 `position: sticky` 之前先读壳仓 memory `evolution-chronicle` 的「e4-sticky 重做前提」，那一节记着当年为什么放弃重做。",
      "三张图标各司其职：`icon-bar.svg`（图标栏剪影）/ `icon.svg`（市场身份图）/ `cover.svg`（封面）。",
      "`explorer.*` 21 条命令 + 键位（`Ctrl+Shift+E` 资源管理器 / `Ctrl+Shift+F` 搜索）**都在 `plugin.json` 的 `contributes` 里声明**，别在代码里另起一套。",
    ],
  },
  marketplace: {
    what: "插件市场——浏览 / 安装 / 卸载 / 更新 / 禁用插件。本软件的内置商店。",
    where: "侧栏（`marketplace` 容器：搜索 / 已安装 / 探索 / 已禁用 / 内置）+ 主区（`main` 容器：插件详情页）。",
    layout:
      "`src/views/sidebar/*` 侧栏几段；`src/views/detail/DetailView/*` 详情页；\n数据面在 `src/services/`：`marketCatalog/*`（目录读取与缓存）、`marketSources/*`（多源）、`installJobs` + `installGate`（安装流水）、`updateDiscovery/*`（更新发现）、`downloadCounts`、`marketCategories`。",
    notes: [
      "🔴 **本仓 README 就是市场「详情」页渲染的那份**——改 README 等于改产品文案。",
      "🔴 目录条目的 `icon` / `marketIcon` 一律是**绝对 URL**（未装态要能解析）；列表行图标裁决序 = **已装 → 目录 → 默认块**，别改成只看目录（会破「已装不读远程图」，断网就裂图）。",
      "两个 `viewsContainers` 是它独有的，**全仓只有它用 `location: \"main\"`**。",
      "`i18n/` 有 en + zh 两份（官方插件里只有它这样）。",
    ],
  },
  python: {
    what: "Python 语言支持。**纯声明式插件**：给编辑器挂 pyright LSP，自己没有任何界面。",
    where: "不出现在任何区域（没有 `views`、没有 `appearsIn`）。它的「界面」是编辑器里的高亮、跳转、补全。",
    layout:
      "`src/index.tsx` 是**单文件**、返回 `null` 的声明式组件——**改它通常不需要写代码**，改的是 `plugin.json` 的 `contributes.langDefs`。",
    notes: [
      "🔴 LSP 命令是 `node node_modules/pyright/dist/pyright-langserver.js --stdio` —— `pyright` 是**真依赖**，打出来的 `.linkdesk-plugin` 必须把它带进去（别把它当成「只是类型包」）。",
      "它是 `pluginRole: \"data\"` 却有 `entry` 的形态：声明式插件也可以有 entry。",
    ],
  },
  "serial-monitor": {
    what: "串口监视器——接收区（CM6）+ 发送栏（Monaco）+ 侧栏会话与设置。**它是本软件的第一只视图插件**，也是「后门 IPC 数据管道」的第一个消费者。",
    where: "图标栏顶部 ＋ 侧栏 ＋ 标签页 ＋ 状态栏——四处都有它（全仓出现区域最多的一只）。",
    layout:
      "`src/index.tsx` 做顶层菜单注册与「关闭前回调」；\n接收区在 `src/cm6/*`（追加行 / 装饰 / 滚动 / 搜索 / 主题）；\n主视图 `src/views/SerialMonitorView/*`、设置 `src/views/SerialSettingsView/*`、会话列表 `src/views/SessionListView/*`；\n数据面 `src/services/SerialContext/*`；**独立环形缓冲 `src/utils/RingBuffer`**。",
    notes: [
      "🔴 `statusBar` 是**顶层字段**（不在 `contributes` 里）——**全仓只此一例**，照它写。",
      "`menus` / `commands` 有一半是在**模块顶层**用 `window.linkdesk.menu.registerItems` 注册的（`contributes` 之外）——改菜单要**两边都看**。",
      "🔴 **串口数据是「流」不是「事件」**：多个消费者各拿一份完整历史，别把它改成发布 / 订阅。",
      "`tabBehavior.invokeBeforeClose: \"close_port\"` —— 关标签页前要先关串口。",
      "`suggests: protocol-bracket` / `recommends: workspace`：跨插件的「推荐搭配」声明。",
    ],
  },
  settings: {
    what: "设置——外观 / 字体 / 语言 / 快捷键 / 插件管理。**它就是软件的控制面板**，只是以插件形态存在。",
    where: "图标栏底部按钮 ＋ 右栏（`location: \"auxiliarybar\"`）＋ 悬浮面板（`floatingPanel`）。",
    layout:
      "`src/index.tsx` 一行 re-export；本体在 `src/views/SettingsView.tsx` ＋ `src/views/SettingsView/*`（分组 / 对象编辑器 / 每行控件渲染 / 来源徽标 / 数据加载），快捷键那半在 `src/views/keybinding-settings/*`。",
    notes: [
      "数据全部走 `window.linkdesk.*` IPC（配置 / 键位 / 插件管理），**本仓不持有任何存储**。",
      "🔴 `floatingPanel.viewId` 指向 `views.settings` 的 viewId —— 三向自洽（`floatingPanel.viewId` ↔ `views[].id` ↔ `render`）由本仓 `npm run verify` 的「声明自洽」段守着。",
      "**全仓只有它用 `floatingPanel`**；本仓没有 `i18n/`（key 就是中文原文，英文由 `lang-defaults` 提供）。",
    ],
  },
  "lang-defaults": {
    what: "官方语言包——中文 / English 两份词典。**纯数据插件，没有源码。**",
    where: "不出现在任何区域。它的作用是让 `t()` 有译文。",
    layout:
      "词典在**仓根**：`zh.json` / `en.json`，由 `plugin.json` 的 `contributes.languages[].path` 指过去。\n**没有 `src/`、没有 `entry`** —— 这不是缺陷，是「数据插件」的正常形态。",
    notes: [
      "🔴 **可卸载**：卸载后 `t(key)` 退回 key 原文（不是崩）——这是刻意的边界，别改成不可卸。",
      "语序：**key 就是中文原文**，本仓只提供**目标语言**的译文（不反过来）。",
      "改词典不用动代码；`build` 走 SDK 的 `pack` 通道（**整树打包**）。",
    ],
  },
  "lang-test-ja": {
    what: "日语测试语言包——**验证载体**，故意只译了一部分。",
    where: "不出现在任何区域。",
    layout: "`ja.json` 在**仓根**；本仓**没有 `resources/`**，`plugin.json` 里也**没有 `icon`**。",
    notes: [
      "🔴 它是**测试载体不是完整翻译**：缺译是设计，别去「补全」它（补全了就失去验证价值）。",
      "它同时是「语言包可以是插件」这条机制的活证据。",
    ],
  },
  "theme-defaults": {
    what: "官方主题——出厂亮色 / 暗色配色。",
    where: "外观主题：在设置 → 外观里切换；不出现在图标栏 / 侧栏。",
    layout:
      "配方在 `themes/defaults.json`（**主题配方只住 `themes/`**）。\n一个文件里装着亮色与暗色两套 colorway，但 `contributes.themes` 只声明了一条 —— 这是现状，不是笔误。",
    notes: [
      "🔴 **未决**：本仓 README 写「出厂自带（`core: true`）——不显示卸载按钮」，但 `plugin.json` 里**没有 `core` 字段** —— 照当前清单，卸载按钮**是显示的**。要么补字段、要么改 README（改了要发版）。",
      "本仓**没有 `resources/`**、`plugin.json` 里**没有 `icon`**（市场侧走默认块）。",
      "配方 json 的顶层键是 `id / name / type / colorways`（老形态，用 `type` 不用 `appearance`）。",
    ],
  },
  "theme-mint-soda": {
    what: "薄荷苏打——四套薄荷系亮色配色（薄荷冰露 / 海盐薄荷 / 青柠薄荷 / 薄荷苏打），Claymorphism 软萌风。",
    where: "外观主题：在设置 → 外观里切换。",
    layout: "配方在 `themes/mint-soda.json`（一个文件四套 colorway）。",
    notes: [
      "🔴 本仓 `plugin.json` **是 18 只里唯一没有 `$schema` 键的** —— 补它能让编辑器有字段补全，属于小账。",
      "配方顶层键用 `type`（不是 `appearance`）。",
      "只有 `resources/icon.svg`，没有封面图。",
    ],
  },
  "theme-aurora-glass": {
    what: "极光玻璃——极光夜空配色 ＋ 液态玻璃表面 ＋ **全窗极光背景图**。它是壳「玻璃 / 全窗背景」机制的第一个真实消费者。",
    where: "外观主题：在设置 → 外观里切换。",
    layout:
      "配方在**仓根** `aurora-glass.json`（`contributes.themes[].path` 指的就是它）。\n" +
      "🔴 **已知偏差**：作者文档要求「配方只住 `themes/`、不许摊到仓根」，本仓是外移前的历史形态。改它要动路径 ＋ 发版，记在账上。",
    notes: [
      "资源在 `resources/`：`aurora-bg.svg` 是**全窗背景图**（本体），另有 `cover.svg` / `icon.svg`。",
      "配方顶层键用 `appearance`（与用 `type` 的老主题不同）。",
      "玻璃参数与色板在 README 里有专节——改数值前先读那份。",
    ],
  },
  "theme-zones": {
    what: "分区纹理示例主题——演示 **per-surface 背景**两条路：纸纹分区（`surface.texture` 平铺纹理）与影像分区（`background.mode: zones` 连续切片）。",
    where: "外观主题：在设置 → 外观里切换（本仓声明了**两只**主题）。",
    layout:
      "两份配方在**仓根**：`paper-zones.json` / `image-zones.json`。\n" +
      "🔴 **已知偏差**：作者文档要求「配方只住 `themes/`、不许摊到仓根」，本仓是外移前的历史形态。改它要动路径 ＋ 发版，记在账上。",
    notes: [
      "**全仓唯一声明两只主题**的插件（`contributes.themes` 两条）——它是「一只插件可以带多套主题」的活样本。",
      "资源：`resources/paper-texture.svg`（纸纹平铺图）、`resources/zones-bg.svg`（分区切片图）、`icon.svg`。",
    ],
  },
  "theme-panorama": {
    what: "整窗主视觉——把 `background` 域拉到极限：一张全窗低遮罩主视觉图，chrome 半透明让位。",
    where: "外观主题：在设置 → 外观里切换。",
    layout: "配方在 `themes/panorama.json`。",
    notes: [
      "`resources/sailor-moon.jpg` 是**全仓唯一提交进来的位图**（.jpg）——其它仓的资源都是 svg。",
      "本仓**没有 `icon`**、也没有封面图（资源目录只有那张 jpg）。",
    ],
  },
  "theme-pill": {
    what: "全胶囊——把 `radius` 域拉满：圆角八档全部 999px，配合悬浮形态，泡泡糖配色。",
    where: "外观主题：在设置 → 外观里切换。",
    layout: "配方在 `themes/pill-bubble.json`。",
    notes: ["本仓**没有 `resources/`**、`plugin.json` 里**没有 `icon`**（市场侧走默认块）。", "配方顶层键用 `appearance`。"],
  },
  "theme-songti": {
    what: "宋体印刷体——字族轴：整个 UI 走宋体（SimSun），纸白墨黑的文档感。",
    where: "外观主题：在设置 → 外观里切换。",
    layout: "配方在 `themes/songti-print.json`。",
    notes: [
      "它是「字族轴」的极限样本：改 `font` 相关 token 时照它看边界。",
      "本仓**没有 `resources/`**、`plugin.json` 里**没有 `icon`**。",
    ],
  },
  "theme-terminal": {
    what: "终端机——字族轴：`ui` / `mono` 双键全指等宽族（Cascadia Mono），绿字黑底的终端配色。",
    where: "外观主题：在设置 → 外观里切换。",
    layout: "配方在 `themes/terminal-monofont.json`。",
    notes: ["少数带完整封面的主题之一（`resources/cover.svg` ＋ `icon.svg`）。", "配方顶层键用 `appearance`。"],
  },
  "theme-twilight-forest": {
    what: "暮色森林——四套森林系暗色配色（青澜 / 暮紫 / 翠微 …）。",
    where: "外观主题：在设置 → 外观里切换。",
    layout: "配方在 `themes/twilight-forest.json`（一个文件四套 colorway）。",
    notes: [
      "本仓 author 是**仓主本人**（不是「官方」），是「第三方作者也能做主题插件」的样本。",
      "本仓**没有 `resources/`**、`plugin.json` 里**没有 `icon`**；配方顶层键用 `type`。",
    ],
  },
  "theme-iconset-pastel": {
    what: "粉彩图标集——139 条文件 / 文件夹图标映射，从 Material Icon Theme 精选（MIT）。",
    where: "外观主题：在设置 → 外观里切换（**文件图标**那一档，不是配色主题）。",
    layout:
      "映射表在 `icons/pastel.json`，99 个 SVG 在 `icons/material/`（**图片资产形态**，走 `imagePath`）。\n" +
      "这是**全仓唯一走 `contributes.iconThemes`** 的插件。",
    notes: [
      "README 的「来源与许可」写着一个转换脚本 `scripts/convert-material-icons.mjs` —— **它不在本仓**（在壳仓 `scripts/`）。",
      "本仓有 `LICENSE.md`（全仓唯一带许可证文件的）——与上游 MIT 对齐，别删。",
      "本仓**没有 `resources/`**、`plugin.json` 里**没有 `icon`**。",
    ],
  },
};

/* ─────────────────────────── 渲染 ─────────────────────────── */

/** 现场读一只仓的 `plugin.json` / `package.json`（读不到 ⇒ 抛出，让调用方报红） */
function readRepo(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return { manifest, pkg };
}

/** 随包出厂集——**读壳仓的账**，不在这里另立名单 */
function seedIds() {
  const lock = JSON.parse(readFileSync(LOCK, "utf8"));
  return new Set(lock.plugins.filter((p) => p.seed === true).map((p) => p.id));
}

/** 能力面 → 一句「用户在哪看到它」的兜底（FACTS 没写时用） */
function render(pluginId, manifest, pkg, seed, hasSrc, hasI18n) {
  const f = FACTS[pluginId];
  if (!f) throw new Error(`FACTS 表里没有 ${pluginId}——新增插件仓时要补一段事实（这正是这份表的意义）`);

  const scripts = Object.keys(pkg.scripts || {});
  const cmdLines = scripts.map((s) => `npm run ${s}`.padEnd(19) + `# ${SCRIPT_NOTE[s] || "（见 package.json）"}`).join("\n");

  const seedBlock = seed
    ? `> 🔴 **这只插件随软件出厂（工厂种子）**。壳仓的 \`bundled-plugins.lock.json\` 里它 \`seed: true\`——\n` +
      `> 打包那一刻，壳会把**本仓已发布的最新版**拉进安装包。⇒ **发版不是可选项**：新用户装到的就是本仓的发布件。\n`
    : `> 这只插件**不随软件出厂**（\`seed: false\`）：用户从插件市场装上它。发版照常走下面的两步。\n`;

  return `# ${manifest.name}（${pluginId}）——LinkDesk 插件仓

> **本文件是给在这个仓里干活的 AI 看的**（Claude Code / Codex / Cursor / …）。人看 \`README.md\`。
> 插件身份的唯一来源 = \`plugin.json\` 顶层的 \`pluginId\`（本仓：\`${pluginId}\`）。当前版本 \`${manifest.version}\`。

## 1. 这是什么

${f.what}

**用户在哪看到它**：${f.where}

**🔴 本仓就是这只插件的真源。** 插件源码后来从壳仓整体外移，现在**壳仓没有它的源码**了——
改这只插件，只能在这个仓里改；壳仓那边只有它**已发布的产物**（\`bundled-plugins/\` 里的 zip 或官方目录的条目）。

${seedBlock}
## 2. 铁律（破了就坏插件，或者坏壳）

1. **颜色一律走 \`var(--xxx)\`** —— 禁止硬编码 hex，否则切主题时你的 UI 不跟。
2. **UI 文案一律走 \`t()\`**（key = 原文；英文译文放 \`i18n/en.json\`）—— 禁止硬编码显示字符串。
3. **系统能力只走 \`window.linkdesk.*\`** —— 不要 \`import\` 壳内部（\`@src/core/...\`）；SDK 的 lint 会判这条。
4. **插件身份只来自 \`plugin.json\` 的声明** —— 不要让任何人从目录名 / 文件位置去推断它是什么。
5. **右键菜单声明式**（\`contributes.menus\` ＋ \`<ContextMenu>\`）；**弹窗 portal 到 \`document.body\`**；**持久化走 \`window.linkdesk.configuration\`**（不要 \`localStorage\`）。
6. **keep-alive：每个标签页始终挂载** —— 不要用 \`isActive\` 把内容整块 blank 掉；它只用来 gate「聚焦才跑」的副作用。

## 3. 本仓的结构与关键路径

${f.layout}

${hasSrc ? "" : "**本仓没有 `src/`** —— 它是「数据插件」：能力全在 `plugin.json` 的声明 ＋ 数据文件里。\n"}
${hasI18n ? "" : "**本仓没有 `i18n/`** —— 文案 key 就是中文原文，英文由语言包插件（`lang-defaults`）提供。\n"}
${f.notes.map((n) => `- ${n}`).join("\n")}

## 4. 规矩去哪找

- **在线（作者文档，按「我想做什么」组织）**：<https://github.com/Encaron/linkdesk/tree/electron/docs/03-plugin-authoring>，从 \`00-readme.md\` 进。
- **离线（永远可用，不用联网）**：\`node_modules/@linkdesk/plugin-sdk/schemas/plugin.schema.json\` —— **字段级权威**；同目录的 \`theme.schema.json\` 管主题配方。
- **编辑器补全**：\`plugin.json\` 的 \`$schema\` 指向它，打字就有补全与诊断。
- **改完自查**：\`npm run validate\`（清单 / 格式 / 声明的文件在不在）＋ \`npm run lint\`（SDK 规则腿）。
- 中文版作者文档（维护者面原文）：<https://github.com/Encaron/linkdesk/tree/electron/docs/03-插件制造>

## 5. 本仓的命令

\`\`\`bash
${cmdLines}
\`\`\`

## 6. 发布与版本纪律

**🔴 上架是两步，别只做第一步**：\`npm run publish\` 只写**本仓自己的** GitHub Release
（只有手动加过本仓地址的人看得见）；**第二步是收录进官方目录**——只有收录之后，
默认设置的全体用户才找得到它。两步都做完，才算「上架」。

**版本号**：\`plugin.json\` 的 \`version\` 与 \`package.json\` 的 \`version\` **必须同值**；
且每次 bump 都要在 \`CHANGELOG.md\` 里配一段 \`## v<新版本>（YYYY-MM-DD）\`——
缺了这段，市场详情页的「更改日志」页签会是空的。

## 7. 本仓自带的门禁

- \`.github/workflows/ci.yml\` —— push / PR 时跑 \`validate\` → \`verify\` → \`build\` → \`test\`。
- \`scripts/ci-verify.mjs\`（\`npm run verify\`）—— **严格腿**：SDK lint 全腿**判红** ＋ 跨插件 import ＋
  字典完整性 ＋ 声明自洽。⚠️ SDK 自带的 \`npm run lint\` 是**只报告不拦**的（那是有意给作者本地留的），
  **别把 \`verify\` 里的这段删了换成 \`npm run lint\`**。
- 🔴 **壳仓的 \`npm run check\` 够不着本仓**（源码搬出去之后就不在它的扫描域里了）——
  本仓的绿灯只由本仓的这两条腿给出。
`;
}

/* ─────────────────────────── 主流程 ─────────────────────────── */

const seed = seedIds();

// 🔴 容器不在 ⇒ **跳过（exit 0）**，不是红。
// 本脚本扫的是「本机插件容器」——一个**仓库外**目录（默认 E:\linkdesk-plugins\official，可用
// LINKDESK_PLUGIN_CONTAINER 覆盖）。CI、别的克隆、没做过源码外移的机器上本来就没有它。
// 既然它已挂进 `npm run check`（2026-09-15 用户拍板补的门禁缺口），在这里判红就会在那些机器上
// 产生**假红**——而假红让真红失效，是本仓最贵的坏法（同 check-bundled-freshness / audit-i18n 的判例）。
// 注意与下面「目录在、但一个插件仓都读不到」**区分开**：那是真的配错了位置，仍然判红。
if (!existsSync(CONTAINER)) {
  console.log(`⏭️  [plugin-agents] 本机插件容器不存在（${CONTAINER}）——跳过（本机专有门禁，非失败）。`);
  console.log(`     要跑它：LINKDESK_PLUGIN_CONTAINER=<容器根> node scripts/sync-plugin-agents.mjs --check`);
  process.exit(0);
}

const ids = readdirSync(CONTAINER, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(CONTAINER, e.name, "plugin.json")))
  .map((e) => e.name)
  .sort();

if (ids.length === 0) {
  console.error(`🔴 容器在、但一个插件仓都没读到：${CONTAINER}\n   （目录存在却没有 <id>/plugin.json ⇒ 位置配错了；用 LINKDESK_PLUGIN_CONTAINER=<dir> 覆盖）`);
  process.exit(1);
}

const vscodeBody = readFileSync(TEMPLATE_VSCODE, "utf8");
const drift = [];
const problems = [];
let wrote = 0;

for (const id of ids) {
  const dir = join(CONTAINER, id);
  let want;
  try {
    const { manifest, pkg } = readRepo(dir);
    if (manifest.pluginId !== id) {
      problems.push(`${id}: plugin.json 的 pluginId 是 \`${manifest.pluginId}\`，与目录名不一致（硬约束 11：身份只来自声明）`);
    }
    want = render(id, manifest, pkg, seed.has(id), existsSync(join(dir, "src")), existsSync(join(dir, "i18n")));
  } catch (e) {
    problems.push(`${id}: 渲染失败——${e.message}`);
    continue;
  }

  // 生成的文本自己也不许带内部坐标：① 任务号（与壳仓作者面同一把尺子）
  //                            ② 内部**层/轮**名（`L7` / `E6` / `第 7.9 轮` 这类——作者同样解析不了）
  const sym = scanText(want);
  if (sym.length > 0) problems.push(`${id}: 生成文本里有内部任务号 ${sym.map((s) => s.symbol).join("、")}`);
  const phaseHits = [...want.matchAll(/\b(?:E[0-9]+|L[0-9]+|第 ?[0-9.]+ ?轮)\b/g)].map((m) => m[0]);
  if (phaseHits.length > 0) {
    problems.push(`${id}: 生成文本里有内部层/轮名 ${[...new Set(phaseHits)].join("、")}——写成一句人话（"源码外移之后"）`);
  }

  const target = join(dir, "AGENTS.md");
  const before = existsSync(target) ? readFileSync(target, "utf8") : null;
  const changed = before !== want;
  if (changed) drift.push(`${id}/AGENTS.md（${before === null ? "新建" : "内容漂移"}）`);
  if (!DRY && !CHECK && changed) {
    writeFileSync(target, want);
    wrote++;
  }

  // .vscode/settings.json —— 与脚手架模板逐字节同源（只补不覆盖已有内容不同的仓 ⇒ 差异进 drift）
  const vsDir = join(dir, ".vscode");
  const vsTarget = join(vsDir, "settings.json");
  const vsBefore = existsSync(vsTarget) ? readFileSync(vsTarget, "utf8") : null;
  if (vsBefore !== vscodeBody) {
    drift.push(`${id}/.vscode/settings.json（${vsBefore === null ? "新建" : "与模板不同源"}）`);
    if (!DRY && !CHECK) {
      mkdirSync(vsDir, { recursive: true });
      writeFileSync(vsTarget, vscodeBody);
      wrote++;
    }
  }
}

/* ─────────────────────────── 报告 ─────────────────────────── */

console.log(`[plugin-agents] 容器：${CONTAINER}`);
console.log(`[plugin-agents] 读到 ${ids.length} 只插件仓；随包出厂（seed）${ids.filter((i) => seed.has(i)).length} 只`);

if (problems.length > 0) {
  console.error(`\n❌ [plugin-agents] ${problems.length} 处硬问题：`);
  for (const p of problems) console.error(`  · ${p}`);
}

if (drift.length === 0 && problems.length === 0) {
  console.log(`\n✅ [plugin-agents] ${ids.length} 只仓的 AGENTS.md 与 .vscode/settings.json 全部与生成源一致。`);
  process.exit(0);
}

if (problems.length > 0) process.exit(1);

if (DRY || CHECK) {
  console.log(`\n${CHECK ? "❌" : "（--dry-run）"}待写 ${drift.length} 处：`);
  for (const d of drift) console.log(`  · ${d}`);
  if (CHECK) {
    console.error(`\n❌ [plugin-agents] 有漂移——跑 \`node scripts/sync-plugin-agents.mjs\` 重新生成（改的是本地容器，不推 git）。`);
    process.exit(1);
  }
  process.exit(0);
}

console.log(`\n✅ [plugin-agents] 已写 ${wrote} 个文件（AGENTS.md ＋ .vscode/settings.json），覆盖 ${drift.length} 处差异：`);
for (const d of drift) console.log(`  · ${d}`);
console.log(`\n⚠️ 本脚本**不碰 git、不推送**——18 个仓要提交 / 推送请自行决定（推送等用户点头）。`);
