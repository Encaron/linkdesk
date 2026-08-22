import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync, readFileSync } from "fs";
import { DEV_SERVER_PORT } from "./electron/constants"; // E5.7#45.5：shared/ 并入 electron/constants.ts
import { PLUGIN_SUBDIRS } from "./src/core/utils/plugin/pluginPaths"; // E5.8#0d.11：自 core/ 根归位 utils/plugin/

const __dirname = dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

/**
 * Phase 4：扫描 plugins/ 目录，收集所有视图插件的入口文件。
 * 构建时为每个插件生成独立 chunk（dist/plugins/<pluginId>.js）。
 */
function scanPluginEntries(): Record<string, string> {
  const pluginsDir = resolve(__dirname, "plugins");
  if (!existsSync(pluginsDir)) return {};

  const entries: Record<string, string> = {};
  try {
    // E5#35d: 子目录从 utils/plugin/pluginPaths.ts 导入——PLUGIN_SUBDIRS 为唯一权威来源（E5.8#0d.11 自 core/ 根归位）
    for (const sub of PLUGIN_SUBDIRS) {
      const subDir = resolve(pluginsDir, sub);
      if (!existsSync(subDir)) continue;

      for (const dir of readdirSync(subDir, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        const pluginJsonPath = resolve(subDir, dir.name, "plugin.json");
        if (!existsSync(pluginJsonPath)) continue;

        try {
          const manifest = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));
          if (!manifest.entry) continue;  // 检测 entry（不再依赖 type 字段）

          const entryPath = resolve(subDir, dir.name, manifest.entry);
          if (existsSync(entryPath)) {
            // key = "plugins/builtin/terminal" → output = dist/plugins/builtin/terminal.js
            entries[`plugins/${sub}/${dir.name}`] = entryPath;
          }
        } catch {
          // plugin.json 解析失败，跳过
        }
      }
    }
  } catch {
    // plugins/ 目录读取失败，跳过
  }
  return entries;
}

export default defineConfig(async ({ command }) => {
  const pluginEntries = scanPluginEntries();
  // E5.7#31.7：池开发预览入口——仅 vite dev（浏览器 mock 模式，Codex UI 设计通道）。
  // 生产构建（npm run build）零污染：preview.html + mock fixture 不进 dist。
  const devEntries = command === "serve"
    ? { preview: resolve(__dirname, "preview.html") }
    : {};

  return {
    plugins: [react()],
    // Electron loadFile 需要相对路径——绝对路径 /assets/ 会解析到文件系统根
    base: './',
    clearScreen: false,
    server: {
      port: DEV_SERVER_PORT,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // src-tauri/ 是 Rust 项目，plugins/ 插件由 Rust 命令操作文件（安装/卸载/重装）
        // 忽略两者避免 Vite 检测到文件系统变化后全量 reload
        ignored: ["**/src-tauri/**", "**/plugins/**"],
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          pool: resolve(__dirname, "pool.html"),
          ...devEntries,
          ...pluginEntries,
        },
        output: {
          // Phase 4：插件输出到 dist/plugins/<pluginId>.js
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name.startsWith("plugins/")) {
              return `${chunkInfo.name}.js`;
            }
            return "assets/[name]-[hash].js";
          },
        },
      },
    },
    worker: {
      format: "es",
    },
    resolve: {
      alias: {
        // 插件统一用 @src/ 引用 src/，替代手工数 ../ 的相对路径
        "@src": resolve(__dirname, "src"),
        "@": resolve(__dirname, "src"),
      },
    },
  };
});
