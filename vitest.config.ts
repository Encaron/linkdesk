import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      // E6#99（L7 第 7.2 轮）：`plugins/**/*.test.ts(x)` 两条 glob 随 18 只发货插件源码外移而摘除——
      // 那 25 个测试文件（marketplace 10 / file-tree 6 / settings 6 / editor 2 / serial-monitor 1）
      // 已随各自插件仓搬走，运行环境（vitest + jsdom + vitest.setup.ts 的 window.linkdesk mock）
      // 由 7.5 轮随插件仓补齐。仓内夹具 panel-demo 本来就没有测试文件。
      "electron/**/*.test.ts",
      // packages/*（作者侧 npm 包）——E6#91e 起收进来：SDK 的纯函数（CHANGELOG 切段等）与壳同一次 `npm run check` 跑
      "packages/**/*.test.ts",
      // cli/linkdeskctl（`AI#59` 起收进来）：它是**随机出货的产品码**（extraResources 进安装包），
      // 此前一行测试都没有 ⇒ 「status 吞真实错误」「status 跳过认人」两条一路活到 0.2.23 出厂版，
      // 靠真机边界扫描才扫出来。纯报告面拆进 lib/status-report.mjs，测试用 .mjs（node ESM）。
      "cli/**/*.test.mjs",
    ],
  },
  resolve: {
    alias: {
      "@src": resolve(__dirname, "src"),
      "@": resolve(__dirname, "src"),
    },
  },
});
