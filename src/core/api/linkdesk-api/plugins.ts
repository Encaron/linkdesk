/**
 * linkdesk-api 插件管理域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9d）。
 * plugins + pluginManager 二命名空间面 verbatim。
 * 依赖方向：plugins → ./types（PluginListEntry/PluginInstallResult/PluginInfoEntry）；被聚合器交叉组装。
 */

import type {
  PluginListEntry,
  PluginInstallResult,
  PluginInstallRequestOpts,
  PluginInstallJobRef,
  PluginUpdateResult,
  PluginUpdateCheckResult,
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
    /** E6#11/#13（1.2-5）：主进程真下载段——fetch .linkdesk-plugin 包 → {userData}/tmp/<原包名>（壳 preload 独有；loader 包安装流 packageOps 调）。
     *  E6#73c：可带 job 身份——主进程段的进度事件据此回填 jobId/pluginId（缺省 = 事件不带身份，N=1 时归活跃会话） */
    packageDownload?(url: string, job?: PluginInstallJobRef): Promise<{ zipPath: string; sizeBytes?: number }>;
    /** E6#11/#13（1.2-5）：主进程真解压段——共享 bundle-zip 语义 → {userData}/plugins/<id>/（2026-09-05 塌平单根；壳 preload 独有；目标已存在拒绝）。
     *  E6#73c：job 同 packageDownload——解压段进度事件回填身份 */
    packageExtract?(zipPath: string, expectedPluginId?: string, job?: PluginInstallJobRef): Promise<{ pluginId: string; version: string; targetDir: string }>;
    /** E6#13b（段 B）：主进程真网络段——fetch marketplace.json → 版本对比（不碰账本——current 由壳传）。prerelease 默认忽略。 */
    packageUpdateCheck?(pluginId: string, catalogUrl: string, currentVersion?: string): Promise<PluginUpdateCheckResult>;
    /** E6#13b/c（段 B）：主进程真下载+解压段——下载到 tmp → 解压到 {userData}/tmp/.stage-<id>（id 一致 + 版本方向校验，不碰旧目录）。
     *  E6#33c（锚①）：allowOlder 显式 true 放行「包内版本 < 当前」的降级（版本下拉选旧版 + F2 确认后传）；默认仍拒 <=；同版恒拒。 */
    packageStageUpdate?(pluginId: string, source: string, currentVersion?: string, allowOlder?: boolean): Promise<{ pluginId: string; newVersion: string; stagedDir: string }>;
    /** E6#13c（段 B）：主进程原子替换段——同卷 rename：target→.bak→staged→target→rm .bak（失败复原旧版） */
    packageCommitUpdate?(pluginId: string, stagedDir: string): Promise<{ pluginId: string; version: string }>;
  };

  /** 插件管理——桥接 IpcBridgeHandler → loader 函数。池权威（marketplace 插件消费），必选 */
  pluginManager: {
    list(): Promise<PluginListEntry[]>;
    enable(id: string): Promise<unknown>;
    disable(id: string): Promise<unknown>;
    uninstall(id: string): Promise<unknown>;
    /** E6#73q：opts 携带请求侧身份（pluginId/displayName/origin）——job 表去重 + job 行显示名 */
    install(path: string, opts?: PluginInstallRequestOpts): Promise<PluginInstallResult>;
    /** E6#13（1.2-5）：url/.linkdesk-plugin 包安装流显式名（installPlugin 路由别名；壳与池 preload 双面同款——池经 plugins:call 代理）。进度走 plugin:installProgress 通道 */
    installWithProgress?(path: string, opts?: PluginInstallRequestOpts): Promise<PluginInstallResult>;
    reinstall(id: string): Promise<unknown>;
    getDisabled(): Promise<PluginInfoEntry[]>;
    getUninstalled(): Promise<PluginInfoEntry[]>;
    isDisabled(id: string): Promise<boolean>;
    /** E6#11c（段 B）：安全更新（#11c 原子 + unload 机械路径）——opts: { catalogUrl?（走 check 选最新） | url?（直给更新包） }。
     *  E6#33c（锚①）：allowOlder 显式 true 放行降级（版本下拉选旧版 + F2 确认后传）；默认拒 <=。 */
    update?(pluginId: string, opts?: { catalogUrl?: string; url?: string; allowOlder?: boolean }): Promise<PluginUpdateResult>;
    /** E6#13b（段 B）：只读查更新——有新版返回 downloadUrl（UI 徽标数据源；更新动作走 update） */
    checkUpdates?(pluginId: string, catalogUrl: string): Promise<PluginUpdateCheckResult>;
    /** E5.7#48：装/卸/重装成功 → 通知主进程全量重扫三表 */
    notifyManifestChanged?(): void;
  };
}
