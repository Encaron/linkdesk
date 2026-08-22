/**
 * linkdesk-api 设置套域——E5.8#41.12（Phase 8.2 方案 A）：设置插件枚举/切换。
 * settings 命名空间 = factoryRole:"settings" 多套并存时的查询/切换面。
 * 第三方设置插件可在自己的 UI 里列出全部设置套 + 切换激活套（#41.13 切换按钮 UI）。
 * 落位：池 preload 注入（设置 UI 在池内渲染）——壳侧 IpcBridgeHandler/settings 域实现。
 * #41.14 ⑤：此面泛化 → window.linkdesk.factorySlots.* 枚举面（本文件保持兼容别名）。
 * 依赖方向：settings → types 基座；被聚合器交叉组装。域接口零互依赖。
 */

/** 设置套条目——settings.list() 返回的一行。
 * 非导出（模块内接口）——契约生成器经 SettingsAPI.list 传递引用自动收集并 emit export；
 * 壳内无第三方消费方，导出会被 knip 报未用（linkdesk-api.ts 排除域不算消费）。 */
interface SettingsPluginInfo {
  /** 插件 ID——getActive/setActive 的句柄 */
  pluginId: string;
  /** 插件显示名（manifest.name 原文，消费方自做 i18n） */
  title: string;
}

/** 设置套命名空间面——双端注入（设置 UI 在池内渲染，壳侧实现走 IPC 桥） */
export interface SettingsAPI {
  settings: {
    /** 全部声明 factoryRole:"settings" 的设置套（含默认/内置），注册序 */
    list(): Promise<SettingsPluginInfo[]>;
    /** 当前活动设置套 ID——读持久化激活（#41.12 落盘），无记录/已卸载回退默认（内置） */
    getActive(): Promise<string | undefined>;
    /** 切换活动设置套——校验候选后落盘持久化（重启保持）。非候选 fail-loud 抛错 */
    setActive(pluginId: string): Promise<void>;
  };
}
