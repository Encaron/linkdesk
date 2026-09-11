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
      "plugins/**/*.test.ts",
      "plugins/**/*.test.tsx",
      "electron/**/*.test.ts",
      // packages/*（作者侧 npm 包）——E6#91e 起收进来：SDK 的纯函数（CHANGELOG 切段等）与壳同一次 `npm run check` 跑
      "packages/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@src": resolve(__dirname, "src"),
      "@": resolve(__dirname, "src"),
    },
  },
});
