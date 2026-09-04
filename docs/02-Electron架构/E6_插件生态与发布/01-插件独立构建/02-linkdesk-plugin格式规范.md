# .linkdesk-plugin 格式规范

> 对应任务：E6#3、E6#6。定义插件分发文件的标准格式。

---

## 一、这是什么

`.linkdesk-plugin` 是 LinkDesk 插件的分发格式——对标 VS Code 的 `.vsix`。

**本质：** 一个 zip 文件，改后缀名。包含插件运行所需的全部文件。

---

## 二、内部结构

```
hello-world.linkdesk-plugin          ← zip 文件，后缀 .linkdesk-plugin
  ├── plugin.json                    ← 插件声明（必需；分发态为严格 JSON——源可注释/尾逗号，SDK 构建时 jsonc 归一）
  ├── icon.svg                       ← 插件图标（可选）
  ├── i18n/                          ← 翻译文件（可选）
  │   ├── en.json
  │   └── zh-CN.json
  ├── index.bundle.js                ← 编译后的插件代码（必需）
  │                                    React + 第三方依赖 + 插件代码全打包
  │                                    不包括 React/react-dom/i18next→壳提供
  ├── assets/                        ← Vite emit 静态资源（可选；字体/精灵图/音效，import 即自动 emit）
  ├── README.md                      ← 附带说明文档（可选；插件详情/市场数据源，K2）
  └── CHANGELOG.md                   ← 更改日志（可选；详情页已装态变更数据源，K2）
```

## 三、如何生成

```
插件源码                      构建（plugin-sdk build）        分发文件
────────                     ──────────────────────        ────────
my-plugin/
  plugin.json ─────────┐
  icon.svg ────────────┤
  i18n/en.json ────────┤──→ Vite build ──→ my-plugin.linkdesk-plugin
  src/index.tsx ───────┘                     (zip)
  node_modules/xxx/ ───┘
```

Vite 配置（`defineLinkdeskPluginConfig`）：
1. `plugin.json` → jsonc 解析后以严格 JSON 归一写入（源文件可注释/尾逗号，产物干净供壳加载）；`icon.svg` / `i18n/*.json` / `README.md` / `CHANGELOG.md` → 源码原样复制（存在才带）
2. `src/index.tsx` → Vite 打包为 `index.bundle.js`
   - `react` / `react-dom` / `react-i18next` / `i18next` → external（壳提供）
   - 其他依赖 → inline（自包含）
   - Vite emit 的 `assets/` 整目录随包
3. 整个输出目录 → zip → `.linkdesk-plugin`（zip 条目顶层 = plugin.json，无外层目录）

## 四、index.bundle.js 约定

```javascript
// index.bundle.js 导出一个 React 组件作为 default export
export default function HelloWorldView({ isActive }: { isActive: boolean }) {
  // ...
}
```

壳加载时：
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

## 六、与现有插件目录的区别

| | 源码目录（builtin/user） | 打包格式（.linkdesk-plugin） |
|:--|:--|:--|
| 存放位置 | `plugins/builtin/` / `plugins/user/` | `{userData}/plugins/<id>/` |
| 加载方式 | Vite import.meta.glob + /@fs/ | import() ES module |
| 谁构建 | 壳的 Vite build | 插件作者自己的 Vite build |
| 依赖来源 | 全局 node_modules | inline 打包在 index.bundle.js |
| 何时用 | 开发 + 内置插件 | 第三方分发 |

---

> **← 上一文档：** `01-plugin-sdk设计.md`
> **→ 下一文档：** `03-loader改造方案.md`
