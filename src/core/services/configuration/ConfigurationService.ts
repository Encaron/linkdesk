/**
 * 配置服务——对标 VS Code IConfigurationService（聚合器门面）。
 * Phase 5 柱子 2 + 柱子 6.3：User/Workspace scope 三层合并 + settings.json 读写。
 *
 * 三层优先级（对标 VS Code）：Workspace > User > Default
 * - Default：  plugin.json 里写的 default 值
 * - User：     全局 settings.json（appDataDir）
 * - Workspace： .linkdesk/settings.json（项目级）
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2 + §6.3
 * VS Code 对标：IConfigurationService.getValue / inspect
 * VS Code 源码：src/vs/platform/configuration/common/configuration.ts
 *
 * E5.8#0.4a：拆 ConfigurationService/ 子模块后，本文件 = 聚合器——全量 re-export 19 公开符号，
 * 外部消费方 import 路径零变更（"../configuration/ConfigurationService" 命中文件，子模块相对只在本夹内）。
 * 单域属主（0d.10-8 KeybindingRegistry 同型——模块级 mutable 状态各归单域 + 跨域读走 accessor + 依赖单向无环）：
 *   5 子模块：cache（三层缓存属主）· applier-registry（_configApplier 属主）· change-listener（_changeListeners 属主）·
 *   value-access（纯读域）· settings-io（持久化/初始化/写路径属主，含跨域组合 clearConfigurationCache）。
 * 分层（单向无环）：cache/applier-registry/change-listener（叶子）→ value-access（读层）→ settings-io（写/IO 层）→ 聚合器。
 */

export { registerConfigApplier } from "./ConfigurationService/applier-registry";

export { onDidChangeConfiguration } from "./ConfigurationService/change-listener";

export { getConfigurationValue, hasConfigurationValue, inspectConfiguration } from "./ConfigurationService/value-access";

export {
  initConfigurationService,
  diffUserSettings,
  reloadUserSettings,
  initUserSettingsWatcher,
  setConfigurationValue,
  resetConfigurationValue,
  setConfigurationValueBatch,
  resetConfigurationValueBatch,
  setWorkspaceRoot,
  applyRemoteConfigChange,
  clearConfigurationCache,
} from "./ConfigurationService/settings-io";

export { getUserSettings, getWorkspaceSettings, getWorkspaceRoot } from "./ConfigurationService/cache";
