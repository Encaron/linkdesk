/**
 * linkdesk-api 系统插槽域——E5.8#41.14（Phase 8.2 方案 A）：factorySlots 通用枚举面。
 * #41.12 建 settings 命名空间（settings 角色专用面 list/getActive/setActive）——本面槽位无关，
 * 收 role 参数：串口/市场/设置任何 factoryRole ≥2 候选都可枚举/切换。
 * 用途：设置插件「通用区」列出全部 N 套设置 UI（含自身）+ 切换激活套（#41.13 切换按钮 UI）。
 * 落位：池 preload 注入（设置 UI 在池内渲染）——壳侧 IpcBridgeHandler/factory-slots 域实现。
 * 依赖方向：factory-slots → types 基座；被聚合器交叉组装。域接口零互依赖。
 */

/** 插槽条目——factorySlots.list(role) 返回的一行。
 * 非导出（模块内接口）——契约生成器经 list 传递引用自动收集并 emit export；
 * 壳内无第三方消费方，导出会被 knip 报未用（linkdesk-api.ts 排除域不算消费）。 */
interface FactorySlotEntry {
  /** 插件 ID——getActive/setActive 的句柄 */
  pluginId: string;
  /** 插件显示名（manifest.name 原文，消费方自做 i18n） */
  title: string;
}

/** factorySlots 命名空间面——双端注入（池内渲染侧实现走 IPC 桥） */
export interface FactorySlotsAPI {
  factorySlots: {
    /** 全部声明指定 factoryRole 的候选插件 [{pluginId, title}]，注册序 */
    list(role: string): Promise<FactorySlotEntry[]>;
    /** 指定角色的活动插件 ID——读持久化激活（#41.12 落盘），无记录/已卸载回退默认（内置） */
    getActive(role: string): Promise<string | undefined>;
    /** 切换指定角色活动插件——校验候选后落盘持久化（重启保持）。非候选 fail-loud 抛错 */
    setActive(role: string, pluginId: string): Promise<void>;
  };
}
