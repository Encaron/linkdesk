# plugin-sdk-example

`@linkdesk/plugin-sdk` 作者形态验收工程（对应 E6#1-#6）。源码入库；`node_modules/`、`package-lock.json`、构建产物不入库（见根 `.gitignore`）。

作者只用 npm 包能力，零壳源码依赖：

```bash
npm install                     # 装 devDeps（file: 指 ../packages/plugin-sdk，本地 dev 循环）
npx tsc --noEmit                # #2b 类型验收——window.linkdesk.* 有提示
npm run build                   # #4b build 验收——= linkdesk-plugin-sdk build
npm run validate                # #5b —— linkdesk-plugin-sdk validate ./plugin.json
```

`npm run build` 产出两件：

- 项目根 `plugin-sdk-example.linkdesk-plugin`（zip 单文件，分发态）
- `dist/plugin-sdk-example.linkdesk-plugin/`（解包目录，#4a 目录产物）

插件的 `pluginId` 未在 plugin.json 声明 → 以**项目目录名** `plugin-sdk-example` 兜底（对齐壳加载契约）。zip 内条目顶层 = `plugin.json`（+ icon.svg / i18n/en.json / index.bundle.js / README.md）。
