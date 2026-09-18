# 03-任务——SDK external 化 + vendor 正式接线（E6#123）

> **第 9.2 轮 · 前置：#122 probe 四断言全绿（🔴 闸）· 发版轴：壳仓内（软件版本不 bump，等 #127）**
> **一句话**：把 spike 的临时改动正式化 + 补齐三条通道（打包 JS / 打包 CSS / dev 兜底），并让 SDK 把 `@linkdesk/ui` 从「内联」改判为「external」。

## 一、JS 通道（插件 bundle 里不再有组件代码）

1. **`packages/plugin-sdk/src/vite-config.ts:57`**：`DEFAULT_EXTERNAL` 追加 `"@linkdesk/ui"`（该清单头注释写明它是「宿主运行时契约」——同笔更新注释：+@linkdesk/ui，指向 L9 档案）。`options.external` 逃生口（`:422` 汇合处）不动。
2. **`scripts/build-pool-vendor.mjs`**：`MAP_KEYS` 正式加 `"@linkdesk/ui"`（与 DEFAULT_EXTERNAL 的「同步维护」注释约束本就覆盖此项）；vendor 入口构建前自动先跑 ui 包 build（`npm run build --workspace @linkdesk/ui` 或脚本内直接 execSync——选后者，vendor 脚本内聚，不污染根链）。
3. **根 `package.json` build 链无需改**（vendor 脚本已是末棒，ui 包 build 被 vendor 脚本内聚）。

## 二、CSS 通道（🔴 本批唯一形态决策，#122 probe 已证可行后正式化）

**定案：组件 CSS 随 JS 走 vendor 单实例，插件源码不再 import css**——否则组件样式仍烤在各插件 `index.bundle.css` 里，「壳改样式全生态跟随」破产一半。

1. **`build-pool-vendor.mjs` 步 3** 正式注入 `<link rel="stylesheet" href="./pool-vendor/<ui css 产物名>">`（与 import-map 同点注入、同「只进池窗」铁律）。
2. **插件源码侧**：四只消费仓删 `import "@linkdesk/ui/index.css"` 行（#125 执行；本格先在 SDK 加红拦截）。
3. **SDK 加机械判据**：`packages/plugin-sdk` 的 build/lint 判据对插件源码 `import "@linkdesk/ui/index.css"` **判红**（报文指向作者面文档新语义）——照 `check-pool-css-imports.mjs` 的壳仓形状，随 SDK 下发（#126 文档同笔）。
4. **dev 兜底（保 dev 预览不丢样式）**：壳 `vite.config.ts` 加 dev-only `transformIndexHtml` 钩子给 **pool.html** 注入 ui css（resolve 自 workspace `@linkdesk/ui/dist/index.css`）——仅 dev 轨道；打包轨道由 vendor link 承担。⛔ 不碰壳窗口 index.html。
5. **消费面侦察（本格子步，先做）**：`grep -rn "linkdesk/ui/index.css" plugins/ bundled-plugins/` + 四只消费仓——实际 import 形态以侦察结果为准；若**无人 import css**（样式已随 JS 图进各 bundle），2/3 两步简化为「SDK 防回归判据照立」，4 步 dev 兜底仍要（dev 下 JS external 化后 css 不再随图走）。侦察结论写进本档执行记录。

## 三、验收

- 用四只消费仓任一只（本地 link SDK）重新 build：产物 grep 组件实现标记（如 `createRoot` 之外的组件内部函数名/`data-overlay-wrapper`）**零命中**；产物内 `import "@linkdesk/ui"` 为裸 specifier。
- 安装版实机：该插件 UI 与改前同款（token 跟随完好）。
- dev 轨道：`npm run dev` 下插件 UI 样式正常（dev 兜底生效）。
- `npm run check` 全绿。

## 四、回勾要求

- 本档执行记录（侦察结论 + 三通道读数）+ 清单回勾 + 交接本一段。SDK 改动随 #127 真发（本格 bump 不 publish，照 0.3.1 先例）。
