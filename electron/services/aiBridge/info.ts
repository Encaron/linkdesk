/**
 * AI 接入状态读取口（M4 `AI#38.4`/`#38.9`/`#38.11` 数据源）——main 直答 IPC `app:getAiBridge` 的正文。
 *
 * 分工铁律：**这里只出数据，不出显示文字**——「运行中」「已关闭」这类人话由壳命令（渲染进程）
 * 用 t() 拼装（硬约束 2）；本文件给的是原始状态位 ＋ 白名单操作表（`opCatalog()` 唯一真相源）。
 *
 * 通道先例：`app:getAiManual`（`manual-handlers.ts`）——main 直答、**不进 PROXY_CHANNELS**
 * （双登记会抛 second handler）、只暴露给壳（`preload-shell.ts`，池 preload 不注入）。
 * 与 ai-manual 的差别：本通道带一个**动作**参数（`get` 读 / `regenerateToken` 改）——
 * 拆两条通道没必要（同一份数据的读与写）。
 */

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { bridgeSnapshot, regenerateBridgeToken } from './index.js';
import { opCatalog } from './whitelist.js';
import { extractDebugSwitches } from '../debug-switches.js';

/* `app:getAiBridge` 回包的形状**单一真相源** = `src/core/types/ipc/aiBridge.ts`（渲染进程那份）——
 * electron 侧 type-only import（编译期擦除，零运行时依赖）；两端各写一份会被 jscpd 判克隆且早晚漂移。 */
import type { AiBridgeInfo, AiBridgeInfoRequest, AiBridgeOpDesc as OpDesc } from '../../../src/core/types/ipc/aiBridge.js';

export type { AiBridgeInfo, AiBridgeInfoRequest };

function buildAiBridgeInfo(): AiBridgeInfo {
  const snap = bridgeSnapshot();
  const userData = app.getPath('userData');
  const logPath = path.join(userData, 'ai-bridge-log.jsonl');
  // CDP 调试端口实况：argv 是唯一真相（applyDebugSwitches 会把 append 的推回 argv，M5 AI#17）
  const portSwitch = extractDebugSwitches(process.argv.slice(1)).find((s) => s.startsWith('--remote-debugging-port='));
  let auditLogEnabled = false;
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')) as Record<string, unknown>;
    auditLogEnabled = settings['ai.auditLog.enabled'] === true;
  } catch {
    // 读不到 = 默认关
  }
  return {
    present: snap.present,
    pid: snap.pid,
    enabled: snap.enabled,
    listening: snap.listening,
    mode: snap.mode,
    endpoint: snap.endpoint,
    lastError: snap.lastError,
    startedAt: snap.startedAt,
    uptimeMs: snap.uptimeMs,
    debugPort: portSwitch ? Number(portSwitch.split('=')[1]) : null,
    auditLogEnabled,
    logFileExists: fs.existsSync(logPath),
    ops: opCatalog() as OpDesc[],
    ledger: snap.ledger,
    tokenFile: 'ai-bridge.token',
    userData,
  };
}

export function handleAiBridgeRequest(req: AiBridgeInfoRequest | undefined): AiBridgeInfo {
  if (req && req.action === 'regenerateToken') {
    regenerateBridgeToken();
  }
  return buildAiBridgeInfo();
}
