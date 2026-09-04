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
 * E6#7（1.2-4）：单根 → 有序双根。用户安装的 .linkdesk-plugin 解压家 = {userData}/plugins
 *   （env-service.userPluginsDir），与只读 app 插件根（dev 项目 plugins/、prod resources/plugins）
 *   分开（AI执行守则 陷阱 1「不要混」）。根表 = [appPluginsDir, userPluginsDir]——
 *   app 在前 → 同名插件 app 遮蔽 userData（dev 项目源码零回归；市场更新覆盖旧版本留 #11→#13 后续轮）。
 */

import * as fs from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import * as path from 'path';
import { envService } from './env-service.js';
// E6#9a/c：IPC 返回形状共享 src 契约类型（主进程 type-only import——编译期擦除，无运行时依赖）
import type { PluginManifest } from '../../src/core/api/types.js';
import type { PluginDiscoveryEntry, PluginEntryInfo } from '../../src/core/api/linkdesk-api/types.js';
// E6#55：作者 plugin.json JSONC——全仓唯一解析入口，主进程发现读盘同走（壳 helper 对齐，不另写解析）
import { parseManifestJson } from '../../src/pluginLoader/jsonc.js';

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

/** E6#7（1.2-4）：插件所在位置——root = 代码根（第几根）、sub = 插件子目录（'' = root-direct 遗留） */
interface PluginDirLocation {
  rootIndex: number;
  sub: string;
}

class PluginFileService {
  // ── 工具 ──

  /** E6#7：有序代码根表——app 只读根在前（与旧单根字节一致），userData 用户安装家在后。 */
  private pluginRoots(): string[] {
    return [envService.appPluginsDir(), envService.userPluginsDir()];
  }

  /**
   * 查找插件所在位置——E5.7#69 扫描全部子目录；E6#7 逐根（app 先命中先赢）。
   * 每个根内先 SUBDIR_PRIORITY 子目录、再 root-direct 遗留（旧 readManifest/resolvePath
   * 的 root-direct fallback 并入此处，语义不变）。未找到返回 null。
   */
  private _findPluginDir(pluginId: string): PluginDirLocation | null {
    for (let i = 0; i < this.pluginRoots().length; i++) {
      const root = this.pluginRoots()[i];
      for (const sub of scanPluginSubdirs(root)) {
        if (existsSync(path.join(root, sub, pluginId))) return { rootIndex: i, sub };
      }
      if (existsSync(path.join(root, pluginId))) return { rootIndex: i, sub: '' };
    }
    return null;
  }

  /** 插件目录绝对路径（未转正斜杠）——found 时 join 实际位置；未找到回退首根 root-direct（旧语义）。 */
  private _pluginDirAbs(loc: PluginDirLocation | null, pluginId: string): string {
    if (loc) return path.join(this.pluginRoots()[loc.rootIndex], loc.sub, pluginId);
    return path.join(this.pluginRoots()[0], pluginId);
  }

  // ── 列出插件（对标 Rust list_plugin_dirs）──

  async listPluginDirs(): Promise<string[]> {
    const names: string[] = [];
    const seen = new Set<string>();
    // E5.7#69：扫描全部子目录（新子目录插件自动可见，无需改代码）
    // E6#7：逐根收集 + app 先 dedupe（同名插件 app 遮蔽 userData）
    for (const root of this.pluginRoots()) {
      if (!existsSync(root)) continue;
      for (const sub of scanPluginSubdirs(root)) {
        const subDir = path.join(root, sub);
        const entries = await fs.readdir(subDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.')) continue;
          if (seen.has(entry.name)) continue;
          if (existsSync(path.join(subDir, entry.name, 'plugin.json'))) {
            seen.add(entry.name);
            names.push(entry.name);
          }
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
          origin: loc ? { home: roots[loc.rootIndex] === userDataRoot ? 'userData' : 'app', subdir: loc.sub || null } : undefined,
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
