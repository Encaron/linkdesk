# E4 后 — 插件 SDK（开发者工具）

> **类型：开发者工具** — 独立的 npm 包，不随壳版本发布。E4 之后壳 API 稳定了再做。

---

## 三步

| # | 做什么 | 交付物 |
|:--:|------|------|
| 1 | **CLI 脚手架** | `npx create-linkdesk-plugin my-plugin` → 生成目录 + `plugin.json` + `index.tsx` |
| 2 | **TypeScript 类型包** | `npm install @linkdesk/types` → IDE 自动补全所有 `linkdesk.*` API |
| 3 | **沙箱测试** | `npm run dev:plugin` → 空壳 + 你的插件 → 热重载 |

---

## 对标

VS Code 的 `yo code` 生成器 + `@types/vscode` + Extension Host 调试。

---

## 为什么 E4 之后

E3 还在收尾壳——API 还在变。壳稳定了再写脚手架。VS Code 也是在 1.0 后才出 `yo code` 的。

---

## CLI 脚手架生成物

```
npx create-linkdesk-plugin my-plugin
  → my-plugin/
      ├── plugin.json          ← 模板，填了 name/version/entry
      ├── src/
      │   └── index.tsx        ← 最小 React 组件
      ├── package.json
      └── README.md
```

## 类型包覆盖

```typescript
// @linkdesk/types
declare namespace LinkDesk {
  // 窗口
  function createTab(pluginId: string, options?: TabOptions): void;
  function showNotification(message: string): void;

  // 命令
  function executeCommand(command: string, ...args: any[]): Promise<any>;

  // 配置
  const settings: ConfigurationService;

  // 主题
  function applyTheme(themeId: string): void;
  // ...
}
```
