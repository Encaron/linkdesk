import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * @linkdesk/ui 库构建（E6#54b）
 *
 * 机制要点：
 * - 组件源码在壳 `src/components/shared/`——vite 对跨包**相对路径** import 不解析，
 *   → 用 resolve.alias 把共享目录映射成逻辑名 @shared（54b 实测：相对跨根失败、alias 成功）。
 * - react 系外部化（壳提供，不重复打）；lucide-react/@linkdesk/contracts(纯类型) 内联。
 * - css 聚合单文件（cssCodeSplit:false + cssFileName）——SelectBoxDropdown 靠 SelectBox.css
 *   等 intra-closure 耦合被聚合自动覆盖。dist/index.js **不自带 css import**（vite lib 特性）
 *   → scripts/build.mjs 注入 `import "./index.css";`（消费方是 vite build，JS 图可达即随包）。
 * - copyPublicDir:false——root 在仓库根时勿把壳 public/(schemas/themes/…) 带进 dist。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@shared": resolve(__dirname, "../../src/components/shared") },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    cssCodeSplit: false,
    cssFileName: "index",
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "react-i18next", "i18next"],
    },
    sourcemap: false,
    minify: "esbuild",
  },
});
