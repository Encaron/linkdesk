// Phase 5h Step 2: Plugin independent build script.
// Scans plugins directory for plugin.json, builds each with Vite library mode.
//
// Usage:
//   node scripts/build-plugins.mjs          # build all plugins
//   node scripts/build-plugins.mjs --watch  # watch mode
//   node scripts/build-plugins.mjs terminal # build specific plugin
//
// Key constraints:
//   - react/react-dom/react-i18next/i18next/@tauri-apps/api -> external
//   - Output: plugins/<id>/dist/index.js + style.css

import { build } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync, readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pluginsDir = resolve(root, "plugins");

// Shared dependencies -- plugins must NOT bundle these
const EXTERNALS = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react-i18next",
  "i18next",
  "@tauri-apps/api",
  "@tauri-apps/api/core",
  "@tauri-apps/plugin-fs",
  "@tauri-apps/plugin-dialog",
];

// Scan plugins directory for view plugins with entry field
function scanPlugins() {
  if (!existsSync(pluginsDir)) return [];

  const targets = [];
  for (const dirent of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;

    const manifestPath = resolve(pluginsDir, dirent.name, "plugin.json");
    if (!existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      console.warn(`[build-plugins] [WARN] Skip "${dirent.name}" -- plugin.json parse error`);
      continue;
    }

    if (!manifest.entry) continue;

    const entryPath = resolve(pluginsDir, dirent.name, manifest.entry);
    if (!existsSync(entryPath)) {
      console.warn(`[build-plugins] [WARN] Skip "${dirent.name}" -- entry ${manifest.entry} not found`);
      continue;
    }

    targets.push({
      id: dirent.name,
      entry: manifest.entry,
      entryPath,
    });
  }
  return targets;
}

// Build a single plugin
async function buildPlugin(plugin, watch) {
  const outDir = resolve(pluginsDir, plugin.id, "dist");
  const pluginRoot = resolve(pluginsDir, plugin.id);

  const config = {
    root: pluginRoot,
    plugins: [react()],
    build: {
      watch: watch ? {} : undefined,
      lib: {
        entry: resolve(pluginRoot, plugin.entry),
        formats: ["es"],
        fileName: () => "index.js",
      },
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        external: EXTERNALS,
        output: {
          assetFileNames: "style.[ext]",
        },
      },
      sourcemap: watch ? "inline" : false,
      minify: !watch,
    },
    resolve: {
      alias: {
        "@": resolve(root, "src"),
      },
    },
  };

  try {
    if (watch) {
      console.log(`[build-plugins] [WATCH] watching "${plugin.id}"...`);
    }
    await build(config);
    if (!watch) {
      console.log(`[build-plugins] [OK] "${plugin.id}" -> ${relative(root, outDir)}/index.js`);
    }
    return true;
  } catch (e) {
    console.error(`[build-plugins] [FAIL] "${plugin.id}" build error:`, e?.message || e);
    return false;
  }
}

// Main

async function main() {
  const args = process.argv.slice(2);
  const watch = args.includes("--watch");
  const filter = args.filter((a) => a !== "--watch");

  const plugins = scanPlugins();

  if (plugins.length === 0) {
    console.log("[build-plugins] No plugins found with entry field");
    return;
  }

  console.log(`[build-plugins] Found ${plugins.length} view plugins:`);
  for (const p of plugins) {
    console.log(`  - ${p.id} (${p.entry})`);
  }

  const targets = filter.length > 0
    ? plugins.filter((p) => filter.includes(p.id))
    : plugins;

  if (filter.length > 0 && targets.length === 0) {
    console.warn(`[build-plugins] [WARN] Plugin not found: ${filter.join(", ")}`);
    return;
  }

  if (watch) {
    console.log("[build-plugins] [WATCH] Watching for changes...");
  }

  let failed = 0;
  for (const plugin of targets) {
    const ok = await buildPlugin(plugin, watch);
    if (!ok) failed++;
  }

  if (!watch && failed > 0) {
    console.error(`[build-plugins] [FAIL] ${failed}/${targets.length} plugins failed`);
    process.exit(1);
  }

  if (!watch) {
    console.log(`[build-plugins] [DONE] All ${targets.length} plugins built`);
  }
}

main().catch((e) => {
  console.error("[build-plugins] Unexpected error:", e);
  process.exit(1);
});
