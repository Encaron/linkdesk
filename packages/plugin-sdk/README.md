# @linkdesk/plugin-sdk

LinkDesk 插件作者 SDK——对标 `@types/vscode`：装一个包，拿到 **`window.linkdesk.*` 类型提示 + 一键构建 `.linkdesk-plugin` + plugin.json 验证**。零壳源码依赖。

> 类型真相源 = `@linkdesk/contracts`（本包依赖转发，不复制生成物——契约漂移 → 你的 tsc 立即红）。
> 插件作者写代码一律走 `window.linkdesk.*`（preload 注入），**禁止 `import @src/core`**。

## 安装

```bash
npm install -D @linkdesk/plugin-sdk
```

## 使用

### 1. tsconfig——让 `window.linkdesk.` 有类型

```jsonc
{
  "compilerOptions": {
    "types": ["@linkdesk/plugin-sdk"], // 全局 window.linkdesk 声明随契约注入
    "jsx": "react-jsx"
  }
}
```

不建任何 global.d.ts。`.ts/.tsx` 里 `window.linkdesk.tabs.create({...})` 直接有参数类型与返回类型检查。

### 2. plugin.json——声明插件（必填 `name`+`version`，可注释/尾逗号）

```jsonc
{
  "name": "My Plugin",        // 显示名
  "version": "1.0.0",
  "entry": "src/index.tsx",   // view/card/protocol 型插件必需
  "contributes": { "i18n": { "en": "i18n/en.json" } }
}
```

### 3. 构建——产出 `.linkdesk-plugin` 分发文件

```bash
npm run build   # 包自带 bin，等价 linkdesk-plugin-sdk build
```

构建自动完成：**validate plugin.json → Vite 打包 `src/index.tsx` 为 `index.bundle.js` → 收拢 manifest/图标/i18n/README 进 `dist/<id>.linkdesk-plugin/` → zip 成项目根 `<id>.linkdesk-plugin`**。

- `react` / `react-dom` / `react-i18next` / `i18next` 由壳提供，**不打包**——其他依赖全部 inline，插件自包含。
- 插件 id = `plugin.json` 的 `pluginId` 字段；不声明则以**项目目录名**兜底（对齐壳加载契约）。
- 想自定义入口/输出目录/额外 external：
  ```js
  // vite.config.ts
  import { defineLinkdeskPluginConfig } from "@linkdesk/plugin-sdk";
  export default defineLinkdeskPluginConfig({ entry: "src/index.tsx", outDir: "dist" });
  ```

### 单独校验

```bash
npm run validate          # 或 linkdesk-plugin-sdk validate ./plugin.json
```

### 主题/图标数据文件 schema（E6#60——主题/图标作者 npm 通道）

`schemas/theme.schema.json` + `schemas/icon-theme.schema.json` 随包分发（与仓库 `public/schemas/` live 字节同步，漂移由 `check-plugin-schema-sync` 守卫）。主题/图标作者在数据 JSON 首行引 `$schema` 拿 IntelliSense：

```jsonc
// themes/my-glass.json（相对插件根）
{
  "$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/theme.schema.json",
  // …
}
```

数据文件**非 JSONC**（严格 JSON，同引擎加载）。构建期/CI 可用 validate 家族拦格式错（与仓库 `check-theme-schema.mjs` 同一 schema 文件，规则永不漂移）：

```js
import { validateThemeJson, validateIconThemeJson } from "@linkdesk/plugin-sdk";

validateThemeJson("themes/my-glass.json");      // theme.schema.json
validateIconThemeJson("icons/my-icons.json");   // icon-theme.schema.json（匹配表双形态契约）
```

### index.bundle.js 约定

打包产物 `export default` 一个 React 组件——壳以 `{ isActive }` 渲染它：

```tsx
export default function MyView({ isActive }: { isActive: boolean }) {
  return <div>Hello LinkDesk</div>;
}
```

## 限制

- **dev 预览**（壳内源码 glob 加载）对 plugin.json 走严格 JSON 解析；本 SDK validate 容忍注释/尾逗号是发布向能力——若插件要在 dev 预览跑，plugin.json 请保持无注释。
- plugin.json 若带注释直接放进壳 `plugins/` dev 目录，预览加载会崩（壳侧 jsonc 支持是后续轮）。
