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
        // 🔥 E5.8#116 根因修复（2026-08-27）：Tauri 时代遗留的 plugins/ 忽略已删除——
        //   当时 Rust 命令操作插件文件，忽略避免全量 reload；Electron 时代（src-tauri/ 已删）
        //   插件源码 = 壳源码同级 dev 资产，改 CSS/TS 必须被 Vite watcher 检测后失效模块图缓存。
        //   实证：忽略 plugins/ 时模块图缓存永不失效，改 SettingsView.css 经 Page.reload 不生效
        //   （同一物理文件 /@fs/E: 大写缓存旧版、/@fs/e: 小写新 URL 读盘新版 = 双 key 分歧）。
        //   移除后插件热更与壳 src/ 一致；src-tauri/ 目录已不存在，一并清空。
        ignored: [],
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
