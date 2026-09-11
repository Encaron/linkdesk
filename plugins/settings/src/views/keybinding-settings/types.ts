/**
 * 快捷键设置视图的类型——E6#87d 自 KeybindingSettingsView.tsx 逐字搬出（只搬家，零逻辑变更）。
 */

/** 表格一行（命令 + 其绑定 + 冲突标记由消费方叠加） */
export interface KeybindingRow {
  command: string;
  title: string;
  key: string;
  source: string;
  when?: string;
  pluginId?: string;
}

/** 壳快捷键注册表的一条绑定（IPC 面收窄后的形状） */
export interface KeybindingBinding {
  command: string;
  key: string;
  source: string;
  when?: string;
  pluginId?: string;
}

export interface KeybindingSettingsViewProps {
  initialQuery?: string;
}
