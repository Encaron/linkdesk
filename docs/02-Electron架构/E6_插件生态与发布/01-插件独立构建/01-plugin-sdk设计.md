# plugin-sdk 设计——`@linkdesk/plugin-sdk`

> 对标 `@types/vscode`。插件作者 `npm install @linkdesk/plugin-sdk` 后获得：类型定义、Vite 构建配置、验证工具。
> 对应任务：E6#1-#5。

---

## 一、要解决什么问题

当前插件作者写代码时：

```typescript
// ❌ 现在：没有类型，全靠猜
(window as any).linkdesk.tabs.create({ pluginId: "xxx" });  // 参数对不对？不知道
(window as any).linkdesk.configuration.get("key");           // 返回值是什么？不知道
```

有了 SDK 之后：

```typescript
// ✅ 以后：有类型，有提示
window.linkdesk.tabs.create({ pluginId: "xxx" });  // tsc 检查参数
window.linkdesk.configuration.get("key");           // 返回值类型明确
```

---

## 二、包结构

```
packages/plugin-sdk/
  ├── package.json           # @linkdesk/plugin-sdk
  ├── tsconfig.json
  ├── README.md
  └── src/
      ├── index.ts           # barrel 导出
      ├── types.ts           # Window.linkdesk 类型定义（核心）
      ├── vite-config.ts      # defineLinkdeskPluginConfig()
      └── validate.ts        # validatePluginJson()
```

---

## 三、types.ts——类型定义

### 3.1 设计原则

1. **只暴露公开 API。** 内部实现（如 `_getValue`、`_menus`）不暴露给插件作者
2. **对标 `@types/vscode` 的 API surface。** 命名一致、注释风格一致
3. **从 `src/core/api/linkdesk-api.ts` 提取。** 已有完整实现，SDK 只暴露声明

### 3.2 命名空间覆盖

```
window.linkdesk.
  ├── configuration    # get/set/getAll/onChange
  ├── tabs             # create/openOrFocus/focus/close
  ├── commands         # executeCommand/getCommands
  ├── menu             # registerItems
  ├── dialog           # alert/confirm/showConfirm
  ├── filesystem       # readTextFile/writeTextFile/listDir/exists/createDir/remove/copy/watch
  ├── path             # normalize/join/basename/dirname/extname
  ├── workspace        # getFolders/getActive
  ├── clipboard        # readText/writeText
  ├── events           # emit/on/off
  ├── p2p              # send/on
  ├── pluginState      # get/set/onChange
  ├── contextKey       # set
  ├── language         # getCurrent
  ├── env              # isDev
  └── window           # minimize/maximize/close
```

> `serial` / `pluginViews` / `bridge` / `lsp` 等命名空间暂不暴露给第三方——它们是内部或高权限能力。

### 3.3 全局类型增强

```typescript
// types.ts 末尾
declare global {
  interface Window {
    linkdesk: LinkDeskAPI;
  }
}
```

插件作者只需在 `tsconfig.json` 中包含 SDK 的 types，`window.linkdesk.` 自动有智能提示。

---

## 四、vite-config.ts——构建配置

### 4.1 设计原则

1. **基于现有 `scripts/build-plugins.mjs` 改造。** 已有 Vite library mode + 独立 plugin 构建，复用核心逻辑
2. **React/react-dom 标记为 external。** 壳提供——插件不重复打包
3. **其他依赖 inline。** 插件完全自包含
4. **产出 `.linkdesk-plugin` 目录 → zip 为单个文件**

### 4.2 API

```typescript
// vite-config.ts
export function defineLinkdeskPluginConfig(options?: {
  entry?: string;           // 入口文件，默认 "src/index.tsx"
  outDir?: string;          // 输出目录，默认 "dist"
  external?: string[];      // 额外的 external 依赖
}): UserConfig;
```

### 4.3 构建产物

```
输入：my-plugin/src/index.tsx + plugin.json + i18n/en.json + icon.svg
输出：my-plugin.linkdesk-plugin（zip 文件）
  ├── plugin.json
  ├── icon.svg            （如果有）
  ├── i18n/en.json         （如果有）
  └── index.bundle.js      ← Vite 打包后的 ES module
```

---

## 五、validate.ts——验证工具

### 5.1 检查项

```typescript
export function validatePluginJson(path: string): ValidationResult {
  // 1. 必填字段：name, version, entry
  // 2. name 格式：小写+连字符（npm 惯例）
  // 3. contributes 结构：viewsContainers/views/commands/menus/keybindings/i18n
  // 4. i18n 声明一致性：contributes.i18n 声明的文件是否存在
  // 5. entry 文件是否存在
  return { valid: boolean, errors: string[] };
}
```

### 5.2 错误信息格式

模仿 ESLint 风格——文件:行号: 错误描述：

```
plugin.json:0: 缺少必填字段 "name"
plugin.json:5: contributes.viewsContainers.sidePanel 缺少 "title"
i18n/en.json: 在 contributes.i18n 中声明但文件不存在
```

---

## 六、版本升级——作者获取新能力

作者升级 SDK：

```bash
npm update @linkdesk/plugin-sdk
```

SDK 版本升级是**纯增量**的：
- 新 types.ts 加新的 `window.linkdesk.*` API 类型 → 作者有新 API 可用
- 新 validate.ts 加新的 plugin.json 字段检查 → build 时自动验证
- 新 vite-config.ts 优化构建 → 作者无感受益
- 旧代码不受影响——SDK 不删已有类型、不改已有验证规则

**对标 `@types/vscode`：** VS Code 每次更新，扩展作者升级类型包就能用新 API。不升级也能继续用旧 API。

## 七、发布

```bash
cd packages/plugin-sdk
npm publish --access public
```

发布后：
- `npm install @linkdesk/plugin-sdk` → 插件作者获得类型 + 构建工具
- 脚手架模板（E6#10）的 `package.json` 依赖此项

---

## 八、涉及文件

| 文件 | 改动性质 |
|:--|:--|
| `packages/plugin-sdk/package.json` | 新建 |
| `packages/plugin-sdk/tsconfig.json` | 新建 |
| `packages/plugin-sdk/src/index.ts` | 新建——barrel 导出 |
| `packages/plugin-sdk/src/types.ts` | 新建——从 linkdesk-api.ts 提取 |
| `packages/plugin-sdk/src/vite-config.ts` | 新建——从 build-plugins.mjs 改造 |
| `packages/plugin-sdk/src/validate.ts` | 新建 |
| `packages/plugin-sdk/README.md` | 新建 |

---

> **→ 下一文档：** `02-linkdesk-plugin格式规范.md`
