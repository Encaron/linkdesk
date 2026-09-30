# .linkdesk-plugin 格式规范

> 对应任务：E6#3、E6#6。定义插件分发文件的标准格式。

> **非新能力声明（设计流程 §8.4 ③）**：零新增 `window.linkdesk.*` API / `app.*` 配置键 / contributes 贡献点字段（minHeight 补录在 schema 副本，非本文引入）。多表面模型 / `render` 改写 / css 聚合 = **既有契约的打包实现扩展**——`contributes.views[].render` 字段与 schema 原样，作者视角源码 plugin.json 不变，`render` 改写是分发态内部表示（指向编译 chunk），loader 走既有 glob 外回退分支零新分支。文中 `contributes.` 提及均为既有契约描述引用。

---

## 一、这是什么

`.linkdesk-plugin` 是 LinkDesk 插件的分发格式——对标 VS Code 的 `.vsix`。

**本质：** 一个 zip 文件，改后缀名。包含插件运行所需的全部文件。

---

## 二、内部结构

```
hello-world.linkdesk-plugin          ← zip 文件，后缀 .linkdesk-plugin
  ├── plugin.json                    ← 插件声明（必需；分发态为严格 JSON——源可注释/尾逗号，SDK 构建时 jsonc 归一）
  │                                    🔥 render 字段已改写指向编译表面路径（见 §四）
  ├── icon.svg                       ← 插件图标（可选）
  ├── i18n/                          ← 翻译文件（可选）
  │   ├── en.json
  │   └── zh-CN.json
  ├── index.bundle.js                ← 主入口编译产物（有 entry 才带；见 §四「入口约定」）
  ├── views/                         ← 每个 contributes.views[].render 一个编译表面（有视图才带）
  ├── statusBar.bundle.js            ← 自绘状态栏表面（appearsIn.statusBar 声明 .tsx 才有；E6#62d）
  │   ├── SearchView.bundle.js
  │   └── InstalledListView.bundle.js
  ├── <模块名>-<hash>.js             ← 跨表面共享模块的去重 chunk（E6#159；各表面按相对 specifier 引它；无共享模块则无）
  ├── index.bundle.css               ← 全插件聚合 CSS（有 css 才带；loader `<link>` 注入，对标 VS Code 扩展 css）
  ├── assets/                        ← Vite emit 静态资源（可选；字体/精灵图/音效/worker chunk，import 即自动 emit）
  ├── README.md                      ← 附带说明文档（可选；插件详情/市场数据源，K2）
  └── CHANGELOG.md                   ← 更改日志（可选；详情页已装态变更数据源，K2）
```

> 🔥 **多表面模型（E6#15 定义 ／ E6#159 改型定案）**：一个插件 = 主入口 + 每 `contributes.views[].render`
> 一个编译表面（＋ `appearsIn.statusBar` 的自绘状态栏表面，E6#62d）。
> 单入口单 bundle 会把贡献的侧栏/面板视图静默丢掉（壳对源码树视图靠 glob 解析，zip 内无源码树——单入口 zip 装进
> userData 后那些视图无从渲染，E6#15 实证）。
> **构建 = 单次多入口 lib build**（`lib.entry` 一次收全部表面，共享一个 rollup 模块图）——跨表面共享的模块只产
> **一份** chunk，各表面按 rollup 自己算出的相对 specifier（包根表面 `./x.js`、`views/` 内表面 `../x.js`）引它
> ⇒ **ESM「模块身份 = URL」的前提复位，「模块级 = 跨表面唯一真相」重新成立**，且**作者零改动**。
> 两条机械判据随构建跑（SDK `surface-chunk-guard.ts`）：**入口齐备**（产物路径 = dist manifest 所指，防装上 404）
> ＋ **共享模块唯一**（同一源模块只在 ≤1 个入口 chunk 里，防退回多份实例）——不成立即真红拦 build。
> ⚠️ 与 E6#15 时代的两处差异（如实记账）：①**逐表面失败隔离退场**——整批原子成败，作者见红即修，
> 不再悄悄产出「缺一个表面」的包；②**「空 facade」旧结论已订正**——那只对**非 lib** 的 `rollupOptions.input`
> 多入口成立（lib 多入口的入口导出与跨入口去重都正常，E6#159 实测）。
>
> **无 entry 插件**（纯 contributes.views 的 view-only）→ zip 无 `index.bundle.js`，只 `views/*.bundle.js`。
> **纯 JSON 插件**（theme/lang，无 React）→ zip 无任何 bundle.js，只有 `plugin.json` + JSON 资源（语言包/主题）→
> 无需 build（无编译表面），loader 只注册贡献不加载入口（#15b JSON 12）。
>
> 🔴 **多表面共享状态的成规（2026-09-30——marketplace 1.1.4 实机事故换来的，E6#159 已从根上消掉）**：ESM 模块身份 = URL ⇒
> 同源 `services/...` 若在 N 份表面 bundle 里各内联一份 ⇒ **模块级可变状态（store / 守卫 / 去重表 / 订阅计数）在表面之间各长一个**——
> 「模块级 = 跨视图唯一真相」这条单表面时代的前提会**不成立且静默失效**（症状：侧栏翻了、主区详情不翻，须重启）。
> **现况**：单次多入口构建保证共享模块单实例 ⇒ 多表面插件**不再需要**任何原语；存量包与特殊场景（如跨 realm 兜底）
> 仍可用 realm 级原语（现例：marketplace `realmSlot`，SDK 原语版待发，E6#158）。现场取证 → [12-多表面共享状态塌缩-立案.md](./12-多表面共享状态塌缩-立案.md)。
>
> ✅ **终局解已实施（E6#159，2026-09-30）**：本节旧文「各表面单文件自包含 ／ 共享模块在表面间重复打包 ／ zip 大一点换正确性」
> 与 §三 旧步骤「每个表面一次独立 lib build（产物 `surface.bundle.js`）」**一并作废**——现为「共享 chunk 单实例 ＋ 相对 import」。
> 两轨道（dev `/@fs` ／ prod `linkdesk://`）相对 import 可解析已验；旧 assemble 的落位错位（chunk 落包根而表面被移入 `views/`
> ⇒ 相对引用 404）随「产物直落终局位置」一并消失，**壳侧零改动**。设计与 8 维度前置 ／ 实测读数 → [13-跨表面共享chunk-设计前置.md](./13-跨表面共享chunk-设计前置.md)。

## 三、如何生成

```
插件源码                      构建（plugin-sdk build）        分发文件
────────                     ──────────────────────        ────────
my-plugin/
  plugin.json ─────────┐
  icon.svg ────────────┤
  i18n/en.json ────────┤──→ Vite build ──→ my-plugin.linkdesk-plugin
  src/index.tsx ───────┤                     (zip)
  src/views/*.tsx ─────┘
  node_modules/xxx/ ───┘
```

Vite 配置（`defineLinkdeskPluginConfig`）：
1. `plugin.json` → jsonc 解析后以严格 JSON 归一写入（源文件可注释/尾逗号，产物干净供壳加载）；`icon.svg` / `i18n/*.json` / `README.md` / `CHANGELOG.md` → 源码原样复制（存在才带）
2. 收集可编译表面 = [主入口?] + 每唯一 `contributes.views[].render`（去重；同名去 `.tsx` 基名 + `_2` 防撞）
   + `appearsIn.statusBar` 声明的 `.tsx`（E6#62d）
3. **全部表面 → 单次多入口 vite lib build**（`lib.entry` 一次给全，共享一个 rollup 模块图；产物直落终局位置）：
   - `react` / `react-dom` / `react-dom/client` / `react/jsx-runtime` / `react-i18next` / `i18next` / `@linkdesk/ui` → external（壳池提供）
   - 其他依赖 → inline（自包含）
   - `worker: { format: "es" }`——monaco 等真 worker 需 code-split，lib 默认 iife 撞「worker 不支持 code-split」报错
   - `base: "./"`——worker/资产引用锚 `import.meta.url`（缺则烤成宿主绝对路径 ⇒ Monaco worker 全灭，E6#15o）
   - **跨表面共享模块 → 去重 chunk**（`<模块名>-<hash>.js` 落包根，各表面相对引它）；聚合 css 一份 → `index.bundle.css`
4. 主入口表面 → `index.bundle.js`；视图表面 → `views/<key>.bundle.js`；状态栏表面 → `statusBar.bundle.js`；
   dist 内 `plugin.json` 的每 `render` 改写指向 `views/<key>.bundle.js`（**源码 plugin.json 保持作者视角 `src/views/X.tsx`**）
5. 整个输出目录 → zip → `.linkdesk-plugin`（zip 条目顶层 = plugin.json，无外层目录）

## 四、入口与视图表面约定

**主入口**（有 `plugin.json.entry` 才产出）：导出一个 React 组件作为 default export——

```javascript
// index.bundle.js
export default function HelloWorldView({ isActive }: { isActive: boolean }) { /* ... */ }
```

**视图表面**（每 `contributes.views[].render` 一个）：同样 default 导出组件，壳按 dist manifest 的 `render`
路径 dynamic-import——编译后 `render` 值是 `views/SearchView.bundle.js`，不再是源码 `src/views/SearchView.tsx`。
壳既有 glob 外回退分支（`dynamic-import ${pluginRoot}/${render}`）读 dist manifest 即命中，无新代码。

**CSS**：`index.bundle.css` 由壳 loader 在激活 bundle 插件时 `<link rel=stylesheet>` 注入、卸载时移除（对标 VS Code
扩展 css 由宿主 link 的架构模型；chunk 无 html 消费方，vite 不会 style-inject，入口 css 只能等宿主注入）。⚠️
loader 注入实现随消费切换相（#15d/后续 loader 消费 dist）落地——当前 zip 内 css 已正确聚合，运行时注入待接。

壳加载主入口时：
```typescript
const module = await import("./index.bundle.js");
const Component = module.default;
// Component 是 React 组件，壳渲染它
```

## 五、壳侧加载流程

```
用户点"安装"
  ↓
下载 .linkdesk-plugin → 解压到 {userData}/plugins/<pluginId>/
  ↓
壳重启（或热加载）
  ↓
loader.ts loadPlugin():
  1. 读 {userData}/plugins/<pluginId>/plugin.json → 获取 manifest
  2. 读 {userData}/plugins/<pluginId>/index.bundle.js → import()
  3. 正常走 loadPluginLifecycle（注册命令/菜单/视图/配置...）
```

## 六、与开发源码形态的区别（2026-09-05 塌平单根——无 builtin/user 双目录）

| | 源码形态（dev 源树） | 打包格式（.linkdesk-plugin） |
|:--|:--|:--|
| 存放位置 | `plugins/<id>/`（repo 平铺根） | `{userData}/plugins/<id>/`（安装）或 `bundled-plugins/<id>.linkdesk-plugin`（发货夹，同样平铺） |
| 加载方式 | Vite import.meta.glob + /@fs/ | import() ES module |
| 谁构建 | 壳的 Vite build（dev 期，`#15f` 后移出） | 插件作者自己的 Vite build |
| 依赖来源 | 全局 node_modules | inline 打包在 index.bundle.js |
| 何时用 | 开发 + 壳随带插件 | 分发安装 |

> 两种形态是同一批插件的两种呈现——**不是两类插件**。core:true 与否（plugin.json 声明）与形态、目录都无关（见 `06-builtin-user-语义规范.md`）。

---

> **← 上一文档：** `01-plugin-sdk设计.md`
> **→ 下一文档：** `03-loader改造方案.md`
