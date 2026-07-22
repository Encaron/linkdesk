import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync, readFileSync } from "fs";

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
    for (const dir of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const pluginJsonPath = resolve(pluginsDir, dir.name, "plugin.json");
      if (!existsSync(pluginJsonPath)) continue;

      try {
        const manifest = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));
        if (!manifest.entry) continue;  // 检测 entry（不再依赖 type 字段）

        const entryPath = resolve(pluginsDir, dir.name, manifest.entry);
        if (existsSync(entryPath)) {
          // key = "plugins/terminal" → output = dist/plugins/terminal.js
          entries[`plugins/${dir.name}`] = entryPath;
        }
      } catch {
        // plugin.json 解析失败，跳过
      }
    }
  } catch {
    // plugins/ 目录读取失败，跳过
  }
  return entries;
}

export default defineConfig(async () => {
  const pluginEntries = scanPluginEntries();

  return {
    plugins: [react()],
    clearScreen: false,
    server: {
      port: 1420,
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
    resolve: {
      alias: {
        // 插件统一用 @src/ 引用 src/，替代手工数 ../ 的相对路径
        "@src": resolve(__dirname, "src"),
        "@": resolve(__dirname, "src"),
      },
    },
  };
});
