import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { DEV_SERVER_PORT } from "./electron/constants";

/**
 * E6#15d 消费切换相 G2（form②）—— 池窗口专用独立构建 pass。
 *
 * 主 `vite build`（index.html 壳 + dist/plugins/*.js）不 external 任何东西 —— 壳窗 chrome 用 bundle 内 react，
 * 壳 glob chunk 自包含、永不撞裸 import（壳想池画：壳只消费声明）。
 *
 * 本 pass 只构建 pool.html（插件代码唯一执行者），并把 plugin-sdk DEFAULT_EXTERNAL 全集 external 成裸 specifier，
 * 运行时由 dist/pool.html 的 <script type="importmap">（scripts/build-pool-vendor.mjs 注入）解析到 dist/pool-vendor/。
 * 池 chrome 与运行时安装/发货插件 bundle 因此从**同一 URL** 取 react → 单实例（hooks/context 不裂）由结构保证。
 *
 * 为什么不能并进主 build：壳与池共享 src/ 组件图，rollup external 是全局的，一个 pass 无法只对池 external。
 * 产物与主 build 同写 dist/ —— emptyOutDir:false，绝不冲掉壳/插件产物。
 */
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: {
    port: DEV_SERVER_PORT,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(dirname(fileURLToPath(import.meta.url)), "pool.html"),
      // 宿主运行时契约：map 覆盖集 = plugin-sdk DEFAULT_EXTERNAL 全集
      external: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-i18next",
        "i18next",
      ],
    },
  },
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "@src": resolve(dirname(fileURLToPath(import.meta.url)), "src"),
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
});
