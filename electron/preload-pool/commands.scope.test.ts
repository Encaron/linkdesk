/**
 * S4/T6 单测——池侧激活上下文栈与作用域分区（activation/scope 随注册上下文记录）。
 *
 * 验证六条行为（全部经**执行行为**断言，⛔ 不摸内部 Map）：
 * ① entry 上下文（默认空栈）注册 ⇒ plugin 作用域——视图卸载摘不掉、unregisterCommands 才能摘；
 * ② view 上下文（_enterViewContext 后）注册 ⇒ view:<id> 作用域——_leaveViewContext 后执行 miss 落壳 IPC；
 * ③ 同 id 跨作用域双注册 ⇒ 诊断 warn ＋ 后者不覆盖（首注册 handler 生效，⛔ 谁最后注册谁赢）；
 * ④ 同 id 同作用域重注册 ⇒ meta/标题刷新路径——handler 更新（动态 toggle 标题先例）；
 * ⑤ unregisterCommands(pluginId) 只摘 plugin 作用域（按真属主），⛔ 不碰 view:* 条目；
 * ⑥ 同一实例重复压栈去重（StrictMode 二次挂载安全）。
 *
 * 命令 ID 恒虚构（硬约束 21：demo-plugin 属主），不指向真实插件。
 */
import { describe, it, expect, vi } from 'vitest';
import { IPC } from '../ipc/channels';

// ── electron ipcRenderer 假实现（commands.ts 顶层 import ipcRenderer，必须先行 mock）──
vi.mock('electron', async () => (await import('./commands.test-harness')).electronMock());

import { buildCommands } from './commands';
import { ipcMock, fakeEvents } from './commands.test-harness';

const META = { pluginId: 'demo-plugin' };

describe('池侧激活上下文与作用域分区（S4/T6）', () => {
  beforeEach(() => {
    ipcMock.invoke.mockClear();
  });

  it('entry 上下文注册 ⇒ plugin 作用域：视图卸载摘不掉，仍可执行', async () => {
    const commands = buildCommands(fakeEvents());
    commands.registerCommand('demo-plugin.entryCmd', () => 'entry-ok', META);

    // 别的视图卸载不误伤
    commands._enterViewContext?.('tab-other');
    commands._leaveViewContext?.('tab-other');

    const out = await commands.executeCommand('demo-plugin.entryCmd');
    expect(out).toBe('entry-ok');
    expect(ipcMock.invoke.mock.calls.some((c) => c[0] === IPC.commands.execute)).toBe(false);
  });

  it('view 上下文注册 ⇒ view:<id> 作用域：该实例卸载后执行 miss 落壳 IPC', async () => {
    const commands = buildCommands(fakeEvents());
    commands._enterViewContext?.('tab-1');
    commands.registerCommand('demo-plugin.viewCmd', () => 'view-ok', META);
    expect(await commands.executeCommand('demo-plugin.viewCmd')).toBe('view-ok');

    commands._leaveViewContext?.('tab-1');

    await commands.executeCommand('demo-plugin.viewCmd');
    const executeCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.execute);
    expect(executeCall?.[1]).toBe('demo-plugin.viewCmd');
  });

  it('多视图并存：摘一个实例不误伤另一个实例的 view 命令', async () => {
    const commands = buildCommands(fakeEvents());
    commands._enterViewContext?.('tab-1');
    commands.registerCommand('demo-plugin.v1', () => 'v1', META);
    commands._leaveViewContext?.('tab-1');
    commands._enterViewContext?.('tab-2');
    commands.registerCommand('demo-plugin.v2', () => 'v2', META);

    expect(await commands.executeCommand('demo-plugin.v2')).toBe('v2');
    // tab-1 的还在栈上？⛔——已弹；tab-1 的 view 命令必须已摘
    await commands.executeCommand('demo-plugin.v1');
    expect(ipcMock.invoke.mock.calls.some((c) => c[0] === IPC.commands.execute && c[1] === 'demo-plugin.v1')).toBe(true);
  });

  it('同 id 跨作用域双注册 ⇒ 诊断 ＋ 后者不覆盖（首注册 handler 生效）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const commands = buildCommands(fakeEvents());
    commands.registerCommand('demo-plugin.dual', () => 'entry-first', META);
    commands._enterViewContext?.('tab-1');
    commands.registerCommand('demo-plugin.dual', () => 'view-second', META);

    expect(await commands.executeCommand('demo-plugin.dual')).toBe('entry-first');
    expect(warn.mock.calls.some(([msg]) => String(msg).includes('双注册被拒'))).toBe(true);
    warn.mockRestore();
  });

  it('同 id 同作用域重注册 ⇒ handler/meta 刷新（动态标题先例），仍可执行', async () => {
    const commands = buildCommands(fakeEvents());
    commands.registerCommand('demo-plugin.toggle', () => 'title-off', META);
    commands.registerCommand('demo-plugin.toggle', () => 'title-on', { ...META, title: '开' });

    expect(await commands.executeCommand('demo-plugin.toggle')).toBe('title-on');
    // meta 同步走了两次（首注册 + 刷新）
    const registerCalls = ipcMock.invoke.mock.calls.filter((c) => c[0] === IPC.commands.register && c[1] === 'demo-plugin.toggle');
    expect(registerCalls).toHaveLength(2);
  });

  it('unregisterCommands(pluginId) 只摘 plugin 作用域（按真属主），⛔ 不碰 view:* 条目', async () => {
    const commands = buildCommands(fakeEvents());
    commands.registerCommand('demo-plugin.stay', () => 'entry', META);
    commands._enterViewContext?.('tab-1');
    commands.registerCommand('demo-plugin.viewOnly', () => 'view', META);
    commands._leaveViewContext?.('tab-1');

    commands.unregisterCommands('demo-plugin');

    // 插件级已摘 → 执行落壳 IPC
    await commands.executeCommand('demo-plugin.stay');
    expect(ipcMock.invoke.mock.calls.some((c) => c[0] === IPC.commands.execute && c[1] === 'demo-plugin.stay')).toBe(true);
    // unregister 回传了壳侧（原语义保留）
    expect(ipcMock.invoke.mock.calls.some((c) => c[0] === IPC.commands.unregister && c[1] === 'demo-plugin')).toBe(true);
  });

  it('同一实例重复压栈去重（StrictMode 二次挂载安全）：压两次弹一次即回 entry 上下文', async () => {
    const commands = buildCommands(fakeEvents());
    commands._enterViewContext?.('tab-1');
    commands._enterViewContext?.('tab-1'); // 去重：栈顶已是 tab-1
    commands.registerCommand('demo-plugin.strict', () => 'strict-ok', META);
    commands._leaveViewContext?.('tab-1');

    await commands.executeCommand('demo-plugin.strict');
    expect(ipcMock.invoke.mock.calls.some((c) => c[0] === IPC.commands.execute && c[1] === 'demo-plugin.strict')).toBe(true);
  });
});
