/**
 * linkdesk-api 插件管理域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9d）。
 * plugins + pluginManager 二命名空间面 verbatim。
 * 依赖方向：plugins → ./types（PluginListEntry/PluginInstallResult/PluginInfoEntry）；被聚合器交叉组装。
 */

import type {
  PluginListEntry,
  PluginInstallResult,
  PluginInfoEntry,
  PluginDiscoveryEntry,
  PluginEntryInfo,
} from "./types";
import type { PluginManifest } from "../types";

/** 插件发现/管理命名空间面——桥接 IpcBridgeHandler → loader 函数 */
export interface PluginsAPI {
  /** 插件发现——双端注入：resolvePath 双端同面；读面（listDirs/listAll/readAllManifests/listDisabledDirs/readManifest）壳 preload 独有（loader 只在壳跑） */
  plugins: {
    resolvePath(id: string): Promise<string>;
    /** E6#7（1.2-4）：resolvePath 的兄弟（discovery 族）——返回 { root, entry, bundle }（bundle 入口恒 index.bundle.js）。
     *  可选——保 state.ts 守卫与两 preload 面（壳/池）编译不裂；调用方先判存在再调用。 */
    resolveEntry?(id: string): Promise<PluginEntryInfo>;
    listDirs?(): Promise<string[]>;
    /** E6#9a：全量发现——[{ pluginId, entry, manifest }]（替代 import.meta.glob；打包插件不在源码树，主进程读盘唯一真源） */
    listAll?(): Promise<PluginDiscoveryEntry[]>;
    listDisabledDirs?(): Promise<string[]>;
    /** 返回 plugin.json 原始 JSON 文本——消费方自行 JSON.parse */
    readManifest?(id: string): Promise<string>;
    /** E6#9c：全量 manifest——Record<pluginId, PluginManifest>（pluginManifests eager glob 的 IPC 替代） */
    readAllManifests?(): Promise<Record<string, PluginManifest>>;
    /** E6#11/#13（1.2-5）：主进程真下载段——fetch .linkdesk-plugin 包 → {userData}/tmp/<原包名>（壳 preload 独有；loader 包安装流 packageOps 调） */
    packageDownload?(url: string): Promise<{ zipPath: string; sizeBytes?: number }>;
    /** E6#11/#13（1.2-5）：主进程真解压段——共享 bundle-zip 语义 → {userData}/plugins/user/<id>/（壳 preload 独有；目标已存在拒绝） */
    packageExtract?(zipPath: string, expectedPluginId?: string): Promise<{ pluginId: string; version: string; targetDir: string }>;
  };

  /** 插件管理——桥接 IpcBridgeHandler → loader 函数。池权威（marketplace 插件消费），必选 */
  pluginManager: {
    list(): Promise<PluginListEntry[]>;
    enable(id: string): Promise<unknown>;
    disable(id: string): Promise<unknown>;
    uninstall(id: string): Promise<unknown>;
    install(path: string): Promise<PluginInstallResult>;
    /** E6#13（1.2-5）：url/.linkdesk-plugin 包安装流显式名（installPlugin 路由别名；壳与池 preload 双面同款——池经 plugins:call 代理）。进度走 plugin:installProgress 通道 */
    installWithProgress?(path: string): Promise<PluginInstallResult>;
    reinstall(id: string): Promise<unknown>;
    getDisabled(): Promise<PluginInfoEntry[]>;
    getUninstalled(): Promise<PluginInfoEntry[]>;
    isDisabled(id: string): Promise<boolean>;
    /** E5.7#48：装/卸/重装成功 → 通知主进程全量重扫三表 */
    notifyManifestChanged?(): void;
  };
}
