/**
 * windows-state.json——E6#47f 冷启动恢复的落盘面（对标 VS Code storage.json 的
 * `windowsState.lastActiveWindow`，我们只取需要的一个字段 + 窗状态 key）。
 *
 * 语义：
 *   · **只记最后活跃窗**（D7 拍板：无参数启动只恢复它，对标 `window.restoreWindows: "one"` 档）；
 *   · `wsWindowId` 一并记下——恢复时把它带回该窗（`?wsWindow=`），否则恢复出来的窗拿的是
 *     ws-1 的持久化 key，标签页/布局/工作区全对不上（「恢复了个空壳」）；
 *   · 文件损坏/不存在/字段缺失一律回落 null（不崩启动，也不弹窗——恢复失败静默空窗，同 launch-args 口径）。
 *
 * 纯 fs + 可注入目录（单测传临时目录；生产走 app.getPath('userData')）。
 */

import fs from 'node:fs';
import path from 'node:path';

export interface WindowsState {
  lastActiveWindow: {
    workspaceFolder: string | null;
    /** 该窗的状态 key（'ws-1' = 首窗隐式）；null/缺省 = 当场用首窗 */
    wsWindowId: string | null;
  } | null;
}

const FILE_NAME = 'windows-state.json';

function statePath(dir: string): string {
  return path.join(dir, FILE_NAME);
}

export function readWindowsState(dir: string): WindowsState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(dir), 'utf8')) as unknown;
    const w = (raw as WindowsState | null)?.lastActiveWindow;
    if (!w || typeof w !== 'object') return { lastActiveWindow: null };
    const folder = typeof w.workspaceFolder === 'string' && w.workspaceFolder ? w.workspaceFolder : null;
    const wsWindowId = typeof w.wsWindowId === 'string' && /^ws-\d+$/.test(w.wsWindowId) ? w.wsWindowId : null;
    return { lastActiveWindow: { workspaceFolder: folder, wsWindowId } };
  } catch {
    return { lastActiveWindow: null }; // 不存在/坏文件——静默空窗
  }
}

export function writeWindowsState(dir: string, state: WindowsState): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(statePath(dir), JSON.stringify(state, null, 2));
  } catch (e) {
    // 写失败只 warn——恢复信息是便利不是正确性的一环（同 update 缓存口径）
    console.warn('[windows-state] 写入失败（不影响运行）:', e);
  }
}
