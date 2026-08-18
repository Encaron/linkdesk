/**
 * SettingsView 类型层——自 SettingsView.tsx 拆出（E5.8#0d.10-7a）。
 * 纯类型零逻辑。依赖方向：无（被聚合器 / useSettingsEvents / renderControl / SettingRow 消费）。
 */

interface SettingsViewProps {
  isActive: boolean;
}

interface GroupInfo {
  pluginId: string;
  title: string;
  keys: string[];
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
