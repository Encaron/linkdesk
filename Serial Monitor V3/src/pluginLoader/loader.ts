/**
 * 插件加载器。
 * Phase 4：Vite 构建时独立打包 + import() 运行时加载。
 * 设计依据：[[phase4-design-decisions]] 第 1-3 条。
 *
 * 加载时机：App 启动 initPrefs() 完成后调用 initPluginLoader()。
 * 加载顺序：先出厂预装 → 再用户安装 → 错误不阻断。
 */

import type { PluginManifest, ViewPluginEntry } from "../core/types";
import { registerViewPlugin } from "./viewRegistry";

/* ── 插件入口文件映射（Vite import.meta.glob） ── */

// Vite 在构建时展开此 glob，生成所有插件的入口映射
const pluginModules = import.meta.glob<{ default: React.ComponentType<{ isActive: boolean }> }>(
  "../../plugins/*/index.tsx",
  { eager: false }
);

const pluginSidebarModules = import.meta.glob<{ default: React.ComponentType }>(
  "../../plugins/*/sidebar.tsx",
  { eager: false }
);

const pluginManifests = import.meta.glob<PluginManifest>(
  "../../plugins/*/plugin.json",
  { eager: true }  // plugin.json 需要立即读取——决定注册表结构
);

/* ── 辅助：从路径提取 pluginId ── */

function extractPluginId(path: string): string {
  // "../../plugins/<pluginId>/index.tsx" → "<pluginId>"
  const parts = path.split("/");
  return parts[parts.length - 2];
}

/* ── 初始化 ── */

let _initialized = false;

export async function initPluginLoader(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  const errors: string[] = [];

  // 1. 收集所有已安装插件
  const installed = new Set<string>();
  for (const path of Object.keys(pluginManifests)) {
    installed.add(extractPluginId(path));
  }

  // 2. 加载每个插件
  for (const pluginId of installed) {
    try {
      await loadPlugin(pluginId);
    } catch (e: any) {
      errors.push(`${pluginId}: ${e?.message || e}`);
    }
  }

  // 3. 错误汇总
  if (errors.length > 0) {
    console.warn("[pluginLoader] 以下插件加载失败:", errors);
    // Phase 4 toast 框架就绪后改为 toast 通知
  }
}

async function loadPlugin(pluginId: string): Promise<void> {
  // 找到对应的 glob key
  const manifestKey = Object.keys(pluginManifests).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (!manifestKey) {
    throw new Error(`找不到 plugin.json`);
  }

  const manifest = pluginManifests[manifestKey];

  // 校验类型
  if (!manifest.type) {
    throw new Error("plugin.json 缺少 type 字段");
  }

  // 按类型分发注册
  switch (manifest.type) {
    case "view":
      await loadViewPlugin(pluginId, manifest);
      break;
    case "theme":
    case "language":
      // Phase 4 预留：JSON 类型插件即时生效，无需 import()
      console.log(`[pluginLoader] ${manifest.type} 插件 "${pluginId}" — Phase 4 预留`);
      break;
    default:
      console.log(`[pluginLoader] 未知插件类型 "${manifest.type}" — 跳过 "${pluginId}"`);
  }
}

async function loadViewPlugin(pluginId: string, manifest: PluginManifest): Promise<void> {
  // 找到入口模块
  const entryKey = Object.keys(pluginModules).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (!entryKey) {
    throw new Error(`找不到入口文件（${manifest.entry ?? "index.tsx"}）`);
  }

  // 动态 import 组件
  const module = await pluginModules[entryKey]();
  const Component = module.default;

  if (!Component) {
    throw new Error("入口文件未导出 default 组件");
  }

  // 可选的侧栏组件
  let sidebarComponent: React.ComponentType | undefined;
  const sidebarKey = Object.keys(pluginSidebarModules).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (sidebarKey) {
    const sidebarModule = await pluginSidebarModules[sidebarKey]();
    sidebarComponent = sidebarModule.default;
  }

  const entry: ViewPluginEntry = {
    pluginId,
    manifest,
    component: Component,
    sidebarComponent,
  };

  registerViewPlugin(entry);
  console.log(`[pluginLoader] ✅ 视图插件 "${manifest.name}" (${pluginId}) 已注册`);
}

/** 是否已初始化 */
export function isPluginLoaderReady(): boolean {
  return _initialized;
}
