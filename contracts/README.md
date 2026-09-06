# @linkdesk/contracts

LinkDesk 插件契约类型——`window.linkdesk.*` 全量类型定义。

> 本包由 LinkDesk 壳的**契约生成器**（`scripts/generate-contract.mjs`）从 `src/core/api/linkdesk-api.ts` 自动生成，**唯一**类型真相源。第三方插件作者用它拿到与壳完全同步的 API 类型——漂移即编译错误。

## 安装

```bash
npm install -D @linkdesk/contracts
```

## 使用

包只含类型（`linkdesk.d.ts`，`types` 入口直指它），零运行时。装完后：

```ts
import type { LinkDeskAPI } from "@linkdesk/contracts";

// window.linkdesk 自动有类型（声明内置 global Window 接口），无需额外 global.d.ts
window.linkdesk.configuration.get("editor.fontSize"); // 智能提示 + 类型检查
```

- **纯类型**：不含 `getLinkDesk`/`linkdesk` 值导出——运行时走 `window.linkdesk`（preload 注入）。
- **自包含**：无任何 `@src/core` 依赖，拷一个 d.ts 进项目即完整类型。
- **版本轴独立（2026-09-06 拆焊，反向 E5.8#22.6）**：包版本不再随壳——壳升级 ≠ 契约升级（软件升级是用户轴，与本包无关）。只有当 `window.linkdesk.*` API 面变了、作者要拿新类型时才升版发布。**内容仍与壳源码逐字节同步**（生成器比对，漂移即 `contracts:check` 红）——类型永远描述当前壳，只是版本号不绑壳。`npm update @linkdesk/contracts` 在版本升后拿新类型。

## 与仓库产物双轨

- **推荐**：`npm i -D @linkdesk/contracts`（真实发布链，类型随版本走）
- **备选**：从 LinkDesk 仓库 `contracts/linkdesk.d.ts` 拷贝（无 npm 环境时兜底）

## 协议

MIT
