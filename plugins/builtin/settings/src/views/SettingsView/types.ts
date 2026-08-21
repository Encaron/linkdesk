/**
 * SettingsView 类型层——自壳迁入（E5.8#41.14）。
 * 纯类型零逻辑。依赖方向：无（被聚合器 / useSettingsEvents / renderControl / SettingRow 消费）。
 */

interface SettingsViewProps {
  isActive: boolean;
  /** 所在标签页 id（E5.8#41.13 全插件侧换套）——由 PluginComponent 注入；浮动面板无标签页时为 undefined */
  tabId?: string;
}

interface GroupInfo {
  pluginId: string;
  title: string;
  keys: string[];
  /** 角色分组（#41.14 ⑤）——本组是 factoryRole 角色切换组：切换按钮在顶、激活套配置在下。未设置 = 普通配置分组 */
  role?: string;
  /** 角色候选 [{pluginId, title}]——切换按钮遍历渲染 */
  candidates?: { pluginId: string; title: string }[];
  /** 当前激活候选 pluginId——激活视觉标记 */
  activeId?: string;
}

/** ConfigurationProperty 精简版——IPC 序列化后使用的本地类型 */
interface ConfigProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  enumDescriptions?: string[];
  minimum?: number;
  maximum?: number;
  uiHint?: string;
  renderHint?: string;
  dependsOn?: { key: string; value: unknown };
  onApply?: ((v: unknown) => void) | null; // E4V#46 renderHint "action"
}

export type { SettingsViewProps, GroupInfo, ConfigProperty };
