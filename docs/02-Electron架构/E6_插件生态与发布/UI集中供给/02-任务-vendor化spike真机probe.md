# 02-任务——vendor 化 spike：真机 probe（E6#122）

> **第 9.1 轮 · 前置：#121 ✅ · 零发版 · 🔴 全批 go/no-go 闸——probe 不过即停批**
> **性质**：可行性闸门格（用户令「不许做到一半发现做不下去」→ 全批唯一的技术不确定点收在本格，先证后铺）。改动是**临场验证用**的，通过后 #123 才正式化。

## 一、机制背景（为什么本格大概率一次过）

- vendor 机制现成：`scripts/build-pool-vendor.mjs` 对 `MAP_KEYS` 逐项 esbuild 多入口 split → `dist/pool-vendor/` + import-map 注入 `dist/pool.html`。react 系走「CJS facade」难路已由 G2b 趟平（2026-09-06 commit `a4042eedc`）。
- `@linkdesk/ui` 是**简单情形**：`packages/linkdesk-ui/dist/index.js` 是真 ESM（自家 vite lib 产），且 build 步骤 2 已向 JS 注入 `import "./index.css"` → esbuild 打包时 CSS 自动汇入 vendor 产物，**零 facade 工作**。

## 二、改动点

1. `scripts/build-pool-vendor.mjs` 的 `MAP_KEYS` 数组**临时加 `"@linkdesk/ui"`**；入口解析 = `createRequire` `require.resolve("@linkdesk/ui")`（workspace symlink → dist/index.js）。⚠️ 跑 vendor 前先 `npm run build --workspace @linkdesk/ui` 保证 dist 新鲜（#123 会把这步固化进根 build 链）。
2. 脚本步 3（import-map 注入处）**临时加一行 css link 注入**：`<link rel="stylesheet" href="./pool-vendor/linkdesk-ui.css">`（esbuild 对含 css import 的入口会产同名 .css——确认实际产物名后对齐）。
3. `electron-builder files` 无需动（`dist/**` 已含 pool-vendor）。

## 三、probe 四断言（判红即停批）

在打包产物（`vite build` + `vite build --config vite.pool.config.ts` + vendor 脚本后的 `dist/`）上，用真实 Chromium（照 G2b/E6#120 的结构探针法）：

1. **具名导出链接**：池内 `import("@linkdesk/ui")`（经 import-map）resolve 出 `SelectBox/ContextMenu/HintCard` 等 ≥5 个具名组件，全是真函数/对象（非 undefined——import-map 严格静态链接的死亡形态）。
2. **单实例**：两个不同入口（模拟两插件 bundle）各自 `import("@linkdesk/ui")` → `SelectBox` 引用**同一**（`===`，同 chunk URL = 同模块结构）。
3. **CSS + token 跟随**：vendor css link 生效（组件有样式）；改池 DOM 的 `--accent` → 组件外观跟随（token 层未被 vendor 化破坏）。
4. **无插件零成本**：map 里的 `@linkdesk/ui` 条目在无插件 import 时不产生任何网络/执行（import-map 是被动声明——确认 vendor chunk 不被预加载）。

## 四、验收与出口

- 四断言全绿 → 写本档 §执行记录（读数 + 截图/探针输出）→ **开闸**，#123 可做。
- 任一红 → **停批**：把红因、根因（file:line）、两条出路（修法 / 回退分发式）写进交接本顶部，等用户裁决。⛔ 不许带病改方案继续往后铺。
- 本格产物可留在工作区（#123 接手正式化）；不 commit 到主干则在本档注明工作区状态。
