/**
 * Pool preload —— `aiPolicy` 命名空间（2026-11-24 · AI 安全 · 权限档位与提权）。
 *
 * 三个来源各自单一：档位/矩阵/清单 = 主进程 `app:getAiPolicy`；变更事件 = **既有**
 * `config.changed` 广播（⛔ 不新造第二条策略事件流）；键名 = `AI_POLICY_MODE_KEY` 常量
 * （壳侧唯一常量源，⛔ 不写字面量——`check-ai-policy` P5 会红）。
 *
 * 返工 v4：`onChange` 用**事件里的新档位值**覆盖快照的 mode 再回调——
 * 不再「回读 settings.json」（写入是异步落盘的，回读会拿到旧值 ⇒ 徽标与设置页不同步）。
 *
 * 只读：⛔ 本文件没有任何写入口（写档位 = 壳命令 `aiPolicy.setMode`，`userOnly`）。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';
import type { AiPolicyModeDto, AiPolicyStateDto } from '../../src/core/types/ipc/aiPolicy';
import { AI_POLICY_MODE_KEY } from '../../src/core/types/ipc/aiPolicy';

const MODES: readonly AiPolicyModeDto[] = ['read', 'ask', 'auto', 'full'];
const isMode = (v: unknown): v is AiPolicyModeDto => typeof v === 'string' && (MODES as readonly string[]).includes(v);

export function buildAiPolicy(events: EventSystemApi) {
  const getState = (): Promise<AiPolicyStateDto> =>
    ipcRenderer.invoke(IPC.app.getAiPolicy) as Promise<AiPolicyStateDto>;
  return {
    getState,
    onChange: (cb: (state: AiPolicyStateDto) => void) => {
      const off = events.on(IPC.config.changed, ((d: { key?: string; value?: unknown } | undefined) => {
        if (!d || d.key !== AI_POLICY_MODE_KEY) return;
        // 矩阵/清单要整份快照，但档位以**事件值**为准（写入尚未落盘时回读会拿到旧值）
        void getState()
          .then((state) => cb(isMode(d.value) ? { ...state, mode: d.value } : state))
          .catch(() => {});
      }) as (payload: unknown) => void);
      return typeof off === 'function' ? off : () => {};
    },
  };
}
