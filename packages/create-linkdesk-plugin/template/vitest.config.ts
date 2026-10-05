import { defineConfig } from "vitest/config";

/**
 * 插件工程测试环境。
 *
 * 🔴 三条**静默生效**的配置——`globals` / `environment: "jsdom"` / `setupFiles`：缺了会报错
 * （那还算好），配错了则是「本地绿、CI 红」，是这类迁移最典型的坑。口径与壳仓 `vitest.config.ts` 对齐。
 *
 * 🔴 **本文件是模板原件**：官方各仓这份由壳仓 `npm run sync:plugin-ci` 从
 * `packages/create-linkdesk-plugin/template/` **机械铺设**——⛔ 手改仓内那份会被下次同步覆盖
 * （要改先改模板）；第三方工程是自建工程，按需自改即可。
 *
 * 两条**刻意不抄**壳仓的地方（写了就是错）：
 *   - **不设 `@src` / `@` 别名**：壳仓别名是给「与壳同仓的插件」用的；插件源码已外移，
 *     `@src` 在本仓物理不可达。插件代码只经 `window.linkdesk.*` 与 `@linkdesk/ui` 拿能力。
 *   - **不 include `plugins/**`**：本仓就是一只插件，源码在 `src/`。
 *
 * 🔴 **`server.deps.inline` 是为「仓外形态」新加的一条**（壳仓没有、也不需要）：壳仓里
 *   `@linkdesk/ui` 解析到**同仓源码**，CSS 由 Vite 顺手处理；插件仓解析到**已发布的 dist**，
 *   而 `dist/index.js` 里有 `import "./index.css"` —— Node 的外部依赖加载器读不了 `.css`，
 *   于是凡经 `@linkdesk/ui` 的测试全部倒在
 *   `TypeError: Unknown file extension ".css"`（实测：marketplace 6 个文件 / 12 例）。
 *   把 `@linkdesk/ui` 交给 Vite 内联处理后即恢复。**别删这一条**——删了只会在有 UI 组件的
 *   仓里以「莫名其妙的环境错」重现。
 *
 * `passWithNoTests`：还没有测试的工程跑 `vitest run` 不该红——它是「没写」不是「写错了」。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    passWithNoTests: true,
    server: { deps: { inline: ["@linkdesk/ui"] } },
  },
});
