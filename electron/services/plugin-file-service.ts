/**
 * 插件文件服务——插件目录扫描 / manifest 读取 / 路径解析
 *
 * E1 步 3：逐函数映射 Rust `src-tauri/src/plugins.rs`。
 *
 * E5.7#81：安装/卸载/重装三方法整删——全仓零调用方死代码（装/卸/重装唯一实现
 *   = 壳 loader（src/pluginLoader/loader.ts），文件操作走 linkdesk.filesystem bridge，
 *   壳侧统一处理注册/热加载/toast）。本文件只保留主进程直答面：
 *   目录扫描 / manifest 读取 / 路径解析（正斜杠——Windows 反斜杠在 Vite /@fs/ URL 中不兼容）。
 */

import * as fs from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import * as path from 'path';
import { fileService } from './file-service.js';
// E6#9a/c：IPC 返回形状共享 src 契约类型（主进程 type-only import——编译期擦除，无运行时依赖）
import type { PluginManifest } from '../../src/core/api/types.js';
import type { PluginDiscoveryEntry } from '../../src/core/api/linkdesk-api/types.js';

/**
 * E5.7#69：插件子目录白名单消灭——运行时扫描全部子目录，不再写死 ['builtin', 'user']。
 * 唯一保留的政策常量（政策 ≠ 能力限制）：
 *   - SUBDIR_PRIORITY：同名插件冲突时的优先级——builtin > user > 其他（字母序）
 */
const SUBDIR_PRIORITY = ['builtin', 'user'] as const;

/**
 * 扫描 plugins/ 下所有插件子目录。
 * 排除 . 开头（.disabled 卸载坟场等）；顺序 = SUBDIR_PRIORITY 在前 + 其余字母序。
 * protocol.ts 同源复用——协议解析与文件服务一致（新子目录插件两端同时可见）。
 */
export function scanPluginSubdirs(pluginsDir: string): string[] {
  if (!existsSync(pluginsDir)) return [];
  const priority: string[] = [];
  const others: string[] = [];
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if ((SUBDIR_PRIORITY as readonly string[]).includes(entry.name)) priority.push(entry.name);
    else others.push(entry.name);
  }
  others.sort();
  return [...priority, ...others];
}

class PluginFileService {
  // ── 工具 ──

  /** 解析 plugins/ 目录路径 */
  private pluginsDir(): string {
    return fileService.pluginsDir();
  }

  /** 查找插件所在的子目录——E5.7#69 扫描全部子目录，未找到返回 null */
  private _findPluginDir(pluginId: string): string | null {
    const dir = this.pluginsDir();
    for (const sub of scanPluginSubdirs(dir)) {
      if (existsSync(path.join(dir, sub, pluginId))) return sub;
    }
    return null;
  }

  // ── 列出插件（对标 Rust list_plugin_dirs）──

  async listPluginDirs(): Promise<string[]> {
    const dir = this.pluginsDir();
    if (!existsSync(dir)) return [];

    const names: string[] = [];
    // E5.7#69：扫描全部子目录（新子目录插件自动可见，无需改代码）
    for (const sub of scanPluginSubdirs(dir)) {
      const subDir = path.join(dir, sub);

      const entries = await fs.readdir(subDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        if (existsSync(path.join(subDir, entry.name, 'plugin.json'))) {
          names.push(entry.name);
        }
      }
    }

    names.sort();
    return names;
  }

  // ── 全量发现（E6#9a：listAll——替代渲染进程 import.meta.glob）──
  // 打包/市场安装的插件不在源码树（glob 发现不了）——主进程读盘为唯一真源，dev/prod 同一面。
  // 复用 listPluginDirs（扫描策略单源：SUBDIR_PRIORITY + 排除 .disabled/隐藏）+ readManifest（查找策略单源）。
  async listAllPlugins(): Promise<PluginDiscoveryEntry[]> {
    const out: PluginDiscoveryEntry[] = [];
    for (const pluginId of await this.listPluginDirs()) {
      try {
        const manifest = JSON.parse(await this.readManifest(pluginId)) as PluginManifest;
        out.push({ pluginId, entry: manifest.entry, manifest });
      } catch {
        // 单个插件 plugin.json 损坏不阻断全量发现——loader 启动诊断会报具体插件
      }
    }
    return out;
  }

  // ── 全量 manifest（E6#9c：readAllManifests——pluginManifests glob 的 IPC 替代）──
  // 从 listAllPlugins 投影（manifest 已在条目内）——两端点共用一份读盘逻辑，不各写一遍。
  async readAllPluginManifests(): Promise<Record<string, PluginManifest>> {
    const out: Record<string, PluginManifest> = {};
    for (const entry of await this.listAllPlugins()) out[entry.pluginId] = entry.manifest;
    return out;
  }

  // ── 列出已卸载插件（对标 Rust list_disabled_plugin_dirs）──

  async listDisabledPluginDirs(): Promise<string[]> {
    const dir = path.join(this.pluginsDir(), '.disabled');
    if (!existsSync(dir)) return [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (existsSync(path.join(dir, entry.name, 'plugin.json'))) {
        names.push(entry.name);
      }
    }

    names.sort();
    return names;
  }

  // ── 读取 manifest（对标 Rust read_plugin_manifest）──

  async readManifest(pluginId: string): Promise<string> {
    const subdir = this._findPluginDir(pluginId);
    const manifestPath = subdir
      ? path.join(this.pluginsDir(), subdir, pluginId, 'plugin.json')
      : path.join(this.pluginsDir(), pluginId, 'plugin.json');

    // 如果不在主目录，检查 .disabled/
    if (!existsSync(manifestPath)) {
      const disabledPath = path.join(this.pluginsDir(), '.disabled', pluginId, 'plugin.json');
      if (!existsSync(disabledPath)) {
        throw new Error(`插件 "${pluginId}" 的 plugin.json 不存在`);
      }
      return fs.readFile(disabledPath, 'utf-8');
    }
    return fs.readFile(manifestPath, 'utf-8');
  }

  // ── 解析路径（对标 Rust resolve_plugin_path——返回正斜杠路径）──

  resolvePath(pluginId: string): string {
    const subdir = this._findPluginDir(pluginId);
    const p = subdir
      ? path.join(this.pluginsDir(), subdir, pluginId)
      : path.join(this.pluginsDir(), pluginId);
    // 正斜杠——Windows 反斜杠在 Vite /@fs/ URL 中不兼容
    return p.replace(/\\/g, '/');
  }
}

export const pluginFileService = new PluginFileService();
