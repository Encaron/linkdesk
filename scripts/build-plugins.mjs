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

// Core modules that must use the singleton instance from window.__v3_core__
// (registry functions, hooks with React context, ConfigurationService state)
// These paths are intercepted and replaced with a virtual module that
// re-exports from window.__v3_core__.
const CORE_SHARED_PATHS = [
  "../../src/core/CommandRegistry",
  "../../src/core/useConfiguration",
  "../../src/core/ConfigurationService",
  "../../src/core/useSendData",
  "../../src/hooks/useTauriEvent",
  "../../src/core/SerialContext",
  "../../src/core/MenuRegistry",
  "../../src/core/KeybindingRegistry",
  "../../src/core/ConfigurationRegistry",
];

/**
 * Vite plugin: redirect core module imports to window.__v3_core__.
 * Plugins built independently would otherwise bundle their own copy of
 * singleton registries (CommandRegistry, etc.) — causing two instances.
 */
function v3CoreExternalPlugin() {
  const VIRTUAL_ID = "\0v3-core-shared";
  return {
    name: "v3-core-external",
    enforce: "pre",
    resolveId(id, _importer) {
      // Intercept resolves for modules that must be shared with core.
      // Vite passes the id as-written (e.g. "../../src/core/CommandRegistry").
      const normalized = id.split("?")[0];
      for (const p of CORE_SHARED_PATHS) {
        if (normalized === p || normalized.endsWith("/" + p)) {
          return VIRTUAL_ID;
        }
      }
      return null;
    },
    load(id) {
      if (id === VIRTUAL_ID) {
        // Re-export all API members from window.__v3_core__
        return `
const api = window.__v3_core__;
export const {
  React,
  registerCommand,
  registerMenuItems,
  registerKeybinding,
  registerConfiguration,
  unregisterConfiguration,
  registerConfigurationDefaults,
  unregisterConfigurationDefaults,
  useConfiguration,
  useConfigurationValue,
  useSendData,
  useTauriEvent,
  useSerialContext,
  getConfigurationValue,
  setConfigurationValue,
  onDidChangeConfiguration,
} = api;
`;
      }
      return null;
    },
  };
}

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
    plugins: [react(), v3CoreExternalPlugin()],
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
        external: [...EXTERNALS, ...CORE_SHARED_PATHS],
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
