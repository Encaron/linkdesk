/**
 * 插件文件服务——插件目录扫描 / manifest 读取 / 路径解析
 *
 * E1 步 3：逐函数映射 Rust `src-tauri/src/plugins.rs`。
 *
 * E5.7#81：安装/卸载/重装三方法整删——全仓零调用方死代码（装/卸/重装唯一实现
 *   = 壳 loader（src/pluginLoader/loader.ts），文件操作走 linkdesk.filesystem bridge，
 *   壳侧统一处理注册/热加载/toast）。本文件只保留主进程直答面：
 *   目录扫描 / manifest 读取 / 路径解析（正斜杠——Windows 反斜杠在 Vite /@fs/ URL 中不兼容）。
 *
 * 2026-09-05 塌平单根（用户拍板「全面塌平」）：builtin/user 双目录废除——每个代码根（app /
 *   userData）**直接**含插件目录（目录名 = pluginId），无子目录层。根表 = [appPluginsDir,
 *   userPluginsDir]——app 在前 → 同名插件 app 遮蔽 userData（dev 项目源码零回归）。
 */

import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { envService } from './env-service.js';
// E6#9a/c：IPC 返回形状共享 src 契约类型（主进程 type-only import——编译期擦除，无运行时依赖）
import type { PluginManifest } from '../../src/core/api/types.js';
import type { PluginDiscoveryEntry, PluginEntryInfo } from '../../src/core/api/linkdesk-api/types.js';
// E6#55：作者 plugin.json JSONC——全仓唯一解析入口，主进程发现读盘同走（壳 helper 对齐，不另写解析）
import { parseManifestJson } from '../../src/pluginLoader/jsonc.js';

/**
 * 2026-09-05 塌平单根：无 builtin/user 子目录层——每个代码根直接含插件目录（目录名 = pluginId）。
 * .disabled 卸载坟场仍属 app 根（listDisabledPluginDirs 单独处理）。
 */
/** 插件所在位置——root = 代码根（第几根）；根内直接含插件目录，无 sub 层 */
interface PluginDirLocation {
  rootIndex: number;
}

class PluginFileService {
  // ── 工具 ──

  /** 有序代码根表——app 只读根在前（同名遮蔽），userData 用户安装家在后。 */
  private pluginRoots(): string[] {
    return [envService.appPluginsDir(), envService.userPluginsDir()];
  }

  /**
   * 查找插件所在位置——逐根检查 `根/<pluginId>`（2026-09-05 塌平单根：无子目录层，app 先命中先赢）。
   * 未找到返回 null。
   */
  private _findPluginDir(pluginId: string): PluginDirLocation | null {
    for (let i = 0; i < this.pluginRoots().length; i++) {
      if (existsSync(path.join(this.pluginRoots()[i], pluginId))) return { rootIndex: i };
    }
    return null;
  }

  /** 插件目录绝对路径（未转正斜杠）——found 时 join 实际位置；未找到回退首根（旧语义）。 */
  private _pluginDirAbs(loc: PluginDirLocation | null, pluginId: string): string {
    if (loc) return path.join(this.pluginRoots()[loc.rootIndex], pluginId);
    return path.join(this.pluginRoots()[0], pluginId);
  }

  // ── 列出插件（对标 Rust list_plugin_dirs）──

  async listPluginDirs(): Promise<string[]> {
    const names: string[] = [];
    const seen = new Set<string>();
    // 2026-09-05 塌平单根：逐根直扫 `根/<id>`（含 plugin.json 才算插件）；app 先 dedupe（同名遮蔽）
    for (const root of this.pluginRoots()) {
      if (!existsSync(root)) continue;
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue; // .disabled 坟场等
        if (seen.has(entry.name)) continue;
        if (existsSync(path.join(root, entry.name, 'plugin.json'))) {
          seen.add(entry.name);
          names.push(entry.name);
        }
      }
    }
    names.sort();
    return names;
  }

  // ── 全量发现（E6#9a：listAll——替代渲染进程 import.meta.glob）──
  // 打包/市场安装的插件不在源码树（glob 发现不了）——主进程读盘为唯一真源，dev/prod 同一面。
  // 复用 listPluginDirs（扫描策略单源：根直扫 + 排除 .disabled/隐藏）+ readManifest（查找策略单源）。
  async listAllPlugins(): Promise<PluginDiscoveryEntry[]> {
    const roots = this.pluginRoots();
    const userDataRoot = roots[1];
    const out: PluginDiscoveryEntry[] = [];
    for (const pluginId of await this.listPluginDirs()) {
      try {
        const manifest = parseManifestJson(await this.readManifest(pluginId));
        const loc = this._findPluginDir(pluginId);
        const dir = this._pluginDirAbs(loc, pluginId);
        const entry: PluginDiscoveryEntry = {
          pluginId,
          entry: manifest.entry,
          manifest,
          // E6#7：index.bundle.js 存在 = SDK 打包产物（磁盘格式事实；非 manifest.entry——SDK 原样拷作者源码入口）
          bundle: existsSync(path.join(dir, 'index.bundle.js')),
          // 2026-09-05 塌平单根：subdir 恒 null（无 builtin/user 子目录层——字段保留供账本 source 派生统一映射）
          origin: loc ? { home: roots[loc.rootIndex] === userDataRoot ? 'userData' : 'app', subdir: null } : undefined,
        };
        out.push(entry);
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
    // E6#7：.disabled 坟场只属 app 根（卸载=移动进 appPluginsDir/.disabled 的旧语义）；
    // userData 插件卸载 = 真删（1.2-4 P7），不进坟场。
    const dir = path.join(this.pluginRoots()[0], '.disabled');
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
    const loc = this._findPluginDir(pluginId);
    const manifestPath = path.join(this._pluginDirAbs(loc, pluginId), 'plugin.json');

    // 如果不在主目录，检查 .disabled/（app 根）
    if (!existsSync(manifestPath)) {
      const disabledPath = path.join(this.pluginRoots()[0], '.disabled', pluginId, 'plugin.json');
      if (!existsSync(disabledPath)) {
        throw new Error(`插件 "${pluginId}" 的 plugin.json 不存在`);
      }
      return fs.readFile(disabledPath, 'utf-8');
    }
    return fs.readFile(manifestPath, 'utf-8');
  }

  // ── 解析路径（对标 Rust resolve_plugin_path——返回正斜杠路径）──

  resolvePath(pluginId: string): string {
    const loc = this._findPluginDir(pluginId);
    // 正斜杠——Windows 反斜杠在 Vite /@fs/ URL 中不兼容
    return this._pluginDirAbs(loc, pluginId).replace(/\\/g, '/');
  }

  // ── 解析入口（E6#7 resolveEntry——resolvePath 的兄弟）──

  /**
   * 返回 { root（插件目录绝对路径·正斜杠）, entry（入口文件名）, bundle（是否含 index.bundle.js） }。
   * 入口只含文件名/相对名——URL 由调用方按 dev（/@fs/）/prod（linkdesk://）拼接。
   * bundle → 恒 "index.bundle.js"；源码插件 → manifest.entry（缺省 "src/index.tsx"，与 PluginComponent 旧默认对齐）。
   */
  async resolveEntry(pluginId: string): Promise<PluginEntryInfo> {
    const loc = this._findPluginDir(pluginId);
    if (!loc) return { root: null, entry: null, bundle: false };
    const dir = this._pluginDirAbs(loc, pluginId);
    const root = dir.replace(/\\/g, '/');
    const bundle = existsSync(path.join(dir, 'index.bundle.js'));
    let entry: string | null;
    if (bundle) {
      entry = 'index.bundle.js';
    } else {
      try {
        const manifest = parseManifestJson(await this.readManifest(pluginId));
        entry = manifest.entry ?? 'src/index.tsx';
      } catch {
        entry = 'src/index.tsx';
      }
    }
    return { root, entry, bundle };
  }
}

export const pluginFileService = new PluginFileService();
