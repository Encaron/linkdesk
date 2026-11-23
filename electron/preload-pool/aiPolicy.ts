/**
 * Pool preload —— `aiPolicy` 命名空间（2026-11-24 · AI 安全 · 权限档位与提权）。
 *
 * 三个来源各自单一：档位/矩阵/风险表 = 主进程 `app:getAiPolicy`；变更事件 = **既有**
 * `config.changed` 广播（⛔ 不新造第二条策略事件流）；键名 = `AI_POLICY_MODE_KEY` 常量
 * （壳侧唯一常量源，⛔ 不写字面量——`check-ai-policy` P5 会红）。
 *
 * 只读：⛔ 本文件没有任何写入口（写档位 = 壳命令 `aiPolicy.setMode`，`userOnly`）。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';
import type { AiPolicyStateDto } from '../../src/core/types/ipc/aiPolicy';
import { AI_POLICY_MODE_KEY } from '../../src/core/types/ipc/aiPolicy';

export function buildAiPolicy(events: EventSystemApi) {
  const getState = (): Promise<AiPolicyStateDto> =>
    ipcRenderer.invoke(IPC.app.getAiPolicy) as Promise<AiPolicyStateDto>;
  return {
    getState,
    onChange: (cb: (state: AiPolicyStateDto) => void) => {
      const off = events.on(IPC.config.changed, ((d: { key?: string } | undefined) => {
        if (!d || d.key !== AI_POLICY_MODE_KEY) return;
        // 事件只带新值；契约回调要的是**整份快照** ⇒ 重读一次（失败静默：下一次变更/挂载会再读）
        void getState().then(cb).catch(() => {});
      }) as (payload: unknown) => void);
      return typeof off === 'function' ? off : () => {};
    },
  };
}
