/**
 * linkdesk-api 类型域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9a）。
 * 独立类型接口（非 LinkDeskAPI 成员）：LinkDeskCommand/LinkDeskTheme/LinkDeskLanguage/LinkDeskConfigSchema/
 * PluginListEntry/PluginInstallResult/PluginInfoEntry/PluginListSubset/EnvInfo/FileDecoration/
 * FileDecorationProvider/MenuItemDescriptor/NotificationHandle 13 接口 verbatim。
 * DialogOpenOptions 保路径 re-export 留在聚合器（../../types/ipc/dialogs）。
 * 依赖方向：types → ../types（PluginManifest）；被 10 个命名空间域文件 import（依赖基座，无反向）。
 */

import type { PluginManifest } from "../types";
import type { ThemeSurface, ThemeBackground } from "../../services/ui/ThemeEngine";

export interface LinkDeskCommand {
  id: string;
  title: string;
  category?: string;
}

export interface LinkDeskTheme {
  name: string;
  type: "dark" | "light";
  /** E5.8#50.6：玻璃/悬浮质感——主题 JSON `surface`（缺省 = 无玻璃无悬浮） */
  surface?: ThemeSurface;
  /** E5.8#50.6：图片背景——主题 JSON `background`（缺省 = 无图） */
  background?: ThemeBackground;
  pluginId?: string;
}

export interface LinkDeskLanguage {
  id: string;
  label: string;
  pluginId: string;
}

/** 配置 schema 中的单个属性定义——E5.8#41.14 🛤 补全 uiHint/minimum/maximum/renderHint/dependsOn
 * （壳 SettingsView renderControl/SettingRow 官方控件切换 + 依赖显隐字段，与 SettingsView/types ConfigProperty 对齐） */
export interface LinkDeskConfigProperty {
  type: string;
  default?: unknown;
  description?: string;
  enum?: string[];
  enumDescriptions?: string[];
  /** 控件提示——uiHint 优先：plugin.json 声明式控件选择（renderControl 读它切 combobox/textarea/color 等） */
  uiHint?: string;
  /** 数值下限——uiHint 数值控件 min 校验 */
  minimum?: number;
  /** 数值上限——uiHint 数值控件 max 校验 */
  maximum?: number;
  /** 渲染提示——renderControl 第二判据（"action" 渲染操作按钮 / "color" 渲染色块预览） */
  renderHint?: string;
  /** 依赖条件——本项仅在 dependsOn.key 配置值 === value 时显示（SettingRow 读它显隐整行） */
  dependsOn?: { key: string; value: unknown };
}

/** 配置 schema——key → 属性定义（index signature 保持现有消费方） */
export interface LinkDeskConfigSchema {
  [key: string]: LinkDeskConfigProperty;
}

/** 配置贡献条目——configuration.getConfigurationContributions() 返回形状（E5.8#41.14 🛤 命名）。
 * 与壳 ConfigurationRegistry 组装的 [pluginId, { title, properties }] 对齐——第三方设置 UI 不再 need cast */
export type LinkDeskConfigurationContribution = [string, { title: string; properties: Record<string, unknown> }];

/** 插件列表条目——pluginManager.list() 返回（主进程序列化后的 manifest 子集）。
 *  E5.7#98：Partial<PluginManifest> 过宽（component 等字段 IPC 不可达）——收窄为
 *  IpcBridgeHandler.handlePluginsCall "list" 分支实际序列化的 7 字段，marketplace 消费。
 *  E5.8#15.5：pendingReason——缺依赖挂起原因（"等待依赖: xxx"）；无挂起 = undefined。
 *  有值 = 插件已安装但依赖未就绪（PENDING），列表/详情显示等待状态。 */
export interface PluginListEntry {
  pluginId: string;
  manifest: PluginListSubset;
  /** 缺依赖挂起原因——marketplace 显示 PENDING 徽标 + 详情提示条（E5.8#15.5） */
  pendingReason?: string;
}

/** E5.7#81：安装结果——success:false 时 error 为中文失败原因（校验 / 版本冲突 / 复制失败）。
 *  安装进度事件：events.on("plugin:installProgress", ({ stage, pluginId, message }) => ...)
 *  stage: validating | copying | loading | done | error
 *  E5.7#83：装卸广播（壳 loader → 唯一 Pool）：
 *  events.on("plugin:installed", ({ pluginId, version, reason }) => ...) reason: install | reinstall
 *  events.on("plugin:uninstalled", ({ pluginId, reason }) => ...) reason: uninstall */
export interface PluginInstallResult {
  success: boolean;
  pluginId?: string;
  version?: string;
  needRestart?: boolean;
  error?: string;
}

/** 禁用/卸载列表条目——loader getDisabledPluginInfo/getUninstalledPluginInfo 序列化形状（PluginListSubset 的再子集） */
export interface PluginInfoEntry {
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
}

/** list() 的 manifest 序列化子集——与 handlePluginsCall "list" 7 字段对齐 */
export interface PluginListSubset {
  name?: string;
  description?: string;
  version?: string;
  core?: boolean;
  author?: string;
  statusBar?: PluginManifest["statusBar"];
  contributes?: PluginManifest["contributes"];
}

/** 环境信息——env.get() 返回（主进程 env-handlers 组装） */
export interface EnvInfo {
  appDataDir: string;
  pluginsRootDir: string;
  appPluginsDir: string;
  pluginDataDir?: string;
  pluginCacheDir?: string;
  pluginExportsDir?: string;
}

/** 文件装饰——E5.7#60 池内本地注册表。形状对标插件 API 契约 §3.24 */
export interface FileDecoration {
  badge?: string;
  tooltip?: string;
  color?: string;
  propagate?: boolean;
}

/** 文件装饰提供方——插件注册（registerProvider）。同步查询契约：跳过返回 Promise 的 provideDecoration */
export interface FileDecorationProvider {
  provideDecoration(uri: string): FileDecoration | null | undefined;
  onDidChangeFileDecorations?(cb: (uris: string[]) => void): () => void;
}

/** 菜单项描述——menu.getItems() 返回（壳侧 when 过滤 + t() 翻译 + 快捷键解析后） */
export interface MenuItemDescriptor {
  command: string;
  label?: string;
  group?: string;
  order?: number;
  when?: string;
  /** 壳侧解析后的命令标题（E5.7#14 显示文本铁律） */
  title?: string;
  /** 已解析快捷键 "ctrl+shift+p" 形式 */
  shortcut?: string;
  /** E5.8#37.7：当前项 √ 标记（单选语义——壳侧 getItems 动态解析，VS Code 菜单当前项同款）。
   *  位置/对齐子菜单（当前 edge/align 命中项）+ #37.7.1 视图显隐列表（visible 视图项）共用。 */
  checked?: boolean;
  /**
   * E5.8#37.7.1：每项命令载荷——动态菜单项（如面板视图显隐清单）携带数据传给命令 handler。
   * ContextMenu 的 context 是整菜单共享的（非 per-item），per-item 身份（如 containerId+viewId）
   * 必须走命令载荷：executeCommand(id, undefined, ...commandArgs, context) → 壳 handler 收 args
   * = [...commandArgs, context]。池哑渲染原文透传，不解释内容。
   */
  commandArgs?: unknown[];
  children?: Array<string | MenuItemDescriptor>;
}

/** 进度通知句柄——progress=true 时 show() 返回 */
export interface NotificationHandle {
  /** 更新进度消息 */
  update(message: string): Promise<void>;
  /** 完成——关闭进度通知，可选弹完成 toast */
  finish(message?: string): Promise<void>;
  /** 取消——直接关闭，不弹完成 toast */
  cancel(): Promise<void>;
}
