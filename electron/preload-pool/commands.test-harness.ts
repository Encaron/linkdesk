/**
 * 池侧命令单测共用夹具（E6#111b／1.32 提取）。
 *
 * 🔴 为什么要单独一个文件：`commands.test.ts`（E6#62e）与本轮新增的 `commands.ownership.test.ts`
 *   各自抄了一份「假 ipcRenderer ＋ 假事件系统」⇒ 20 行 / 133 tokens 的重复被 `npm run duplication`
 *   逮住（jscpd `minTokens: 60`）。夹具收成一份、两边 import——**不是**给 jscpd 打洞。
 *
 * ⚠️ `vi.mock('electron', …)` 的工厂仍在**各测试文件里**各写一行
 *   `async () => (await import('./commands.test-harness')).electronMock()`：vitest 把 `vi.mock` 提到
 *   import 之前，而工厂要等到首次 import 'electron' 才求值 ⇒ 那时本模块已就绪。**别**退回
 *   「`vi.hoisted` ＋ 跨文件共享变量」那套——静态 import 的求值顺序保证不了 `vi.hoisted` 的时序。
 */
import { vi } from 'vitest';
import type { IpcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';

/** ipcRenderer 假实现——`commands.ts` 顶层 import ipcRenderer，故每个测试文件都要 mock 'electron' */
export const ipcMock = {
  invoke: vi.fn(() => Promise.resolve(undefined)),
  on: vi.fn(),
} as unknown as {
  invoke: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

/** 给 `vi.mock('electron', …)` 工厂用的一行式 */
export function electronMock(): { ipcRenderer: IpcRenderer } {
  return { ipcRenderer: ipcMock as unknown as IpcRenderer };
}

/** invoke 调用实参（`unknown[]`）——供测试断言第 N 参 */
export type InvokeArgs = unknown[];

/** 假事件系统——捕获 executeRequest 单 handler；triggerAsync 等异步链跑完（sendExecuteResult 在其内） */
export function fakeEvents(): EventSystemApi & { triggerAsync: (payload: unknown) => Promise<void> } {
  let handler: ((payload: unknown) => void | Promise<void>) | undefined;
  const api = {
    on: vi.fn((_channel: string, cb: (payload: unknown) => void | Promise<void>) => {
      handler = cb;
      return () => {};
    }),
    triggerAsync: async (payload: unknown) => {
      if (handler) await handler(payload);
    },
  };
  return api as unknown as EventSystemApi & { triggerAsync: (payload: unknown) => Promise<void> };
}

/**
 * 假壳：按 channel 应答——`resolveCommandOwner` 与 `commands:register` 两个入口都返回预置归属
 * （与真壳一致：register 的回执就是注册面解析出的归属），其余 channel 回 `Promise.resolve(undefined)`。
 * 未预置的 id ⇒ 答 null / undefined（等价「壳不知道」→ 走名字推定兜底）。
 */
export function stubShell(owners: Record<string, { pluginId: string; source: string }>): void {
  ipcMock.invoke.mockImplementation((channel: string, ...args: InvokeArgs) => {
    if (channel === IPC.plugins.call && args[0] === 'resolveCommandOwner') {
      return Promise.resolve(owners[args[1] as string] ?? null);
    }
    if (channel === IPC.commands.register) {
      return Promise.resolve(owners[args[0] as string] ?? null);
    }
    return Promise.resolve(undefined);
  });
}

/**
 * 池侧注册表与 miss 钩是**模块级**状态（跨 `buildCommands` 实例共享）——逐测清 miss 钩，
 * 免得上一测装的激活回调混进下一测。
 *
 * ⚠️ 入参是**已建好的实例**（不是工厂）：本模块**不许** import `./commands`——那会与
 *   `vi.mock('electron', …)` 工厂里的 `import('./commands.test-harness')` 闭成环（vitest 实测**挂死**）。
 */
export function resetMissHandler(commands: unknown): void {
  (commands as { _setCommandMissHandler: (h: unknown) => void })._setCommandMissHandler(null);
}
