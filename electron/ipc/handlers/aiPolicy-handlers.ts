/**
 * AI 权限档位 IPC 处理器——`app:getAiPolicy`（设置页四段控件 / 风险表的数据源）。
 *
 * main 直答（`ai-bridge-handlers.ts` 同款先例：**不进 PROXY_CHANNELS**——双登记会抛
 * "Attempted to register a second handler"；只暴露给壳，`preload-shell.ts` 注入、池 preload 不给）。
 *
 * 数据源 = `services/aiBridge/policy/state.ts`（只出数据与 i18n key；终稿文字由壳命令 `t()`）。
 * 只读面：**没有写动作**——档位写点只有壳侧 `aiPolicy.setMode`（`userOnly`）。
 */

import { ipcMain } from 'electron';
import { buildAiPolicyState } from '../../services/aiBridge/policy/state.js';
import { IPC } from '../channels.js';

// E5.7#36：壳崩重建复用——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerAiPolicyHandlers(): void {
  if (_registered) return;
  _registered = true;
  ipcMain.handle(IPC.app.getAiPolicy, () => buildAiPolicyState());
}
