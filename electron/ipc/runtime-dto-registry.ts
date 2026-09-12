/**
 * 运行期契约校验注册表——E5.8#22.5（生成器输入，非产物）。
 *
 * 声明「接收边界通道 → DTO 契约类型」映射：生成器读取本表发射 contracts/runtime-shapes.ts
 * 的形状断言函数（validateWire 查表）。加通道 = 加一行；漏注册 = 该通道无断言（安全降级）。
 *
 * 通道名来源：
 *   - 有 IPC 常量的走 IPC.* 引用（config/theme/pool.*、serial.stats）——与 channels.ts 单一同源；
 *   - 事件频道名（accent/plugin-state/tab/workspace/settings.*）是 plugin:push 信封内的数据名，
 *     代码库两端以裸字符串消费（无 IPC 常量）——此处为唯一权威来源，生成器按字面量嵌入产物。
 *     改频道名 = 改这里 + 双侧 producer/consumer（grep 同名字符串）。
 *
 * 设计：docs/02-Electron架构/E5.8_归一化基建/契约生成/04-运行期校验设计.md §2
 */

import { IPC } from './channels';
import type {
  ConfigurationChangedPayload,
  ThemeChangedPayload,
  AccentChangedPayload,
  PluginStateChangedPayload,
  TabActivatedPayload,
  WorkspaceActiveChangedPayload,
  SettingsRequestGroupPayload,
  SettingsScrollToPayload,
} from '../../src/core/types/ipc/events';
import type { PoolLayout } from '../../src/core/types/pool/poolLayout';
import type { PoolQuickPickData } from '../../src/core/types/pool/poolQuickPick';
import type { PoolDialogData } from '../../src/core/types/pool/poolDialog';
import type { PoolFloatingPanelData } from '../../src/core/types/pool/poolFloatingPanel';
import type {
  SerialDataPayload,
  SerialStatsPayload,
  SerialSystemPayload,
} from '../../src/core/types/ipc/serial';
import type { UpdateState, DownloadProgress } from '../../src/core/types/ipc/update';

/** 注册表行——channel = 接收边界实际到达的通道名；type = 契约类型名（须在本文件 import 声明） */
export interface RuntimeDtoRow {
  channel: string;
  type: string;
}

export const RUNTIME_DTO_REGISTRY: readonly RuntimeDtoRow[] = [
  // ── plugin:push 分发事件（池/壳 events.on 订阅面）──
  { channel: IPC.config.changed, type: 'ConfigurationChangedPayload' },
  { channel: IPC.theme.changed, type: 'ThemeChangedPayload' },
  { channel: 'accent:changed', type: 'AccentChangedPayload' },
  { channel: 'plugin-state:changed', type: 'PluginStateChangedPayload' },
  { channel: 'tab:activated', type: 'TabActivatedPayload' },
  { channel: 'workspace:activeChanged', type: 'WorkspaceActiveChangedPayload' },
  { channel: 'settings:requestGroup', type: 'SettingsRequestGroupPayload' },
  { channel: 'settings:scrollTo', type: 'SettingsScrollToPayload' },
  // E6#57.8：主软件更新两推流——stateChanged 全量态（07 §4.2）+ progress 进度（服务层已节流）
  { channel: IPC.update.stateChanged, type: 'UpdateState' },
  { channel: IPC.update.progress, type: 'DownloadProgress' },
  // E5.8#28：serial 三推流通道全部注册——旧插件 vs 新壳载荷错配 dev 报错可诊断（#22.5 兜错配）
  { channel: IPC.serial.data, type: 'SerialDataPayload' },
  { channel: IPC.serial.stats, type: 'SerialStatsPayload' },
  { channel: IPC.serial.system, type: 'SerialSystemPayload' },
  // ── 池直收（主进程 view.webContents.send 直达）──
  { channel: IPC.pool.layout, type: 'PoolLayout' },      // 壳发 push-layout → 主进程转 pool:layout → 池 layout.ts 收
  { channel: IPC.pool.quickpick, type: 'PoolQuickPickData' },
  { channel: IPC.pool.dialog, type: 'PoolDialogData' },
  // E5.8#37（Phase 8 类型 B）：壳内悬浮面板——池直收（浮层哑渲染单实例 DTO）
  { channel: IPC.pool.floatingPanel, type: 'PoolFloatingPanelData' },
];
