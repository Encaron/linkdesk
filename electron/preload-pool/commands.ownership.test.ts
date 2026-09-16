/**
 * E6#111b 单测——池侧命令归属（判据⑤⑥ 的池侧半程）。
 *
 * 覆盖：
 *  - N9（判据⑥ / 根因 H3）：`editor.selectForCompare` 池内 miss ⇒ on-command 激活取**壳解析出的真属主**
 *    （file-tree），**不再**从名字第一段推（旧实现会去 import 不相干的 `editor` 插件）；
 *  - 推定档不进池侧缓存：壳答「inferred」时照用（兼容老第三方），但下次 miss 重新问壳——声明/自报晚到能翻盘；
 *    壳答「declared/reported」才入缓存，第二次不再问壳；
 *  - 判据⑤（根因 H2）池侧半程：`unregisterCommands` 按**真属主**摘——自报档、壳回执档两条来源都验；
 *    旧实现按 `id.startsWith(pluginId + '.')` 整片删 ⇒ 借了本插件前缀的他人命令被连带删掉。
 *
 * 命令 id 除一个例外恒虚构（硬约束 21）。例外是 `editor.selectForCompare`——它是 H3 的**真实形态样本**
 * （真属主 = file-tree 插件，名字前缀 = editor），单测必须用真形态才抓得到这类错。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IPC } from '../ipc/channels';

// ── electron ipcRenderer 假实现（commands.ts 顶层 import ipcRenderer，必须先行 mock）──
vi.mock('electron', async () => (await import('./commands.test-harness')).electronMock());

import { buildCommands } from './commands';
import { ipcMock, fakeEvents, stubShell, resetMissHandler, type InvokeArgs } from './commands.test-harness';

type Commands = ReturnType<typeof buildCommands>;

/** 问壳「这命令谁的」的次数（池侧只该在缓存 miss 时问） */
const ownerQueries = (): InvokeArgs[] =>
  ipcMock.invoke.mock.calls.filter((c) => c[0] === IPC.plugins.call && c[1] === 'resolveCommandOwner');

/** 某命令是否 fallback 到了壳执行（= 池侧 handler 已不在） */
const fellBackToShell = (id: string): boolean =>
  ipcMock.invoke.mock.calls.some((c) => c[0] === IPC.commands.execute && c[1] === id);

describe('池侧命令归属（E6#111b）', () => {
  beforeEach(() => {
    ipcMock.invoke.mockReset();
    ipcMock.invoke.mockImplementation(() => Promise.resolve(undefined));
    resetMissHandler(buildCommands(fakeEvents()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('N9 借前缀命令 miss ⇒ 激活真属主（file-tree），不 import 不相干的 editor 插件', async () => {
    stubShell({ 'editor.selectForCompare': { pluginId: 'file-tree', source: 'declared' } });
    const events = fakeEvents();
    const commands: Commands = buildCommands(events);
    const activated: string[] = [];
    commands._setCommandMissHandler(async (pluginId) => {
      activated.push(pluginId);
      commands.registerCommand(`${pluginId}.selectForCompare`, () => 'ok');
      return true;
    });

    await events.triggerAsync({ requestId: 'r-n9', commandId: 'editor.selectForCompare', args: [] });

    expect(activated).toEqual(['file-tree']); // 🔴 旧实现这里激活的是 ['editor']（根因 H3）
    expect(ownerQueries()).toHaveLength(1); // 归属只在壳一处解析，池侧不自己从名字推
  });

  it('壳答「inferred」⇒ 照用但不缓存：下次 miss 重新问壳（声明/自报晚到能翻盘）', async () => {
    let answer: { pluginId: string; source: string } = { pluginId: 'legacy', source: 'inferred' };
    ipcMock.invoke.mockImplementation((channel: string, ...args: InvokeArgs) => {
      if (channel === IPC.plugins.call && args[0] === 'resolveCommandOwner') return Promise.resolve(answer);
      return Promise.resolve(undefined);
    });
    const events = fakeEvents();
    const commands: Commands = buildCommands(events);
    const activated: string[] = [];
    commands._setCommandMissHandler(async (pluginId) => {
      activated.push(pluginId);
      return false; // 激活不成（entry 顶层也没这命令）→ 归还控制权
    });

    await events.triggerAsync({ requestId: 'r-1', commandId: 'legacy.thing', args: [] });
    answer = { pluginId: 'real-owner', source: 'declared' }; // 壳此时已从声明面知道真属主
    await events.triggerAsync({ requestId: 'r-2', commandId: 'legacy.thing', args: [] });

    expect(activated).toEqual(['legacy', 'real-owner']); // 推定档没被钉成身份
    expect(ownerQueries()).toHaveLength(2);
  });

  it('壳答「declared」⇒ 入缓存：第二次 miss 不再问壳', async () => {
    stubShell({ 'demo.cached': { pluginId: 'demo', source: 'declared' } });
    const events = fakeEvents();
    const commands: Commands = buildCommands(events);
    commands._setCommandMissHandler(async () => false);

    await events.triggerAsync({ requestId: 'c-1', commandId: 'demo.cached', args: [] });
    await events.triggerAsync({ requestId: 'c-2', commandId: 'demo.cached', args: [] });

    expect(ownerQueries()).toHaveLength(1);
  });

  it('H2 池侧半程：自报属主档 ⇒ 卸载借前缀的属主不动他人命令', async () => {
    const events = fakeEvents();
    const commands: Commands = buildCommands(events);
    commands.registerCommand('alpha.own', () => 'alpha-handler'); // 无申报 → 推定档 = alpha
    commands.registerCommand('alpha.borrowed', () => 'beta-handler', { pluginId: 'beta' }); // 自报档 = beta

    commands.unregisterCommands('alpha');

    // alpha 自己的：handler 已摘 ⇒ 落回壳 IPC
    expect(await commands.executeCommand('alpha.own')).toBeUndefined();
    expect(fellBackToShell('alpha.own')).toBe(true);
    // beta 借 alpha 前缀的：**必须仍在**（旧实现整片删 ⇒ 这里会落回壳 IPC）
    expect(await commands.executeCommand('alpha.borrowed')).toBe('beta-handler');
    expect(fellBackToShell('alpha.borrowed')).toBe(false);
  });

  it('H2 池侧半程：壳回执档 ⇒ 名字不带本插件前缀的命令也按真属主摘', async () => {
    stubShell({ 'explorer.copy': { pluginId: 'file-tree', source: 'declared' } });
    const events = fakeEvents();
    const commands: Commands = buildCommands(events);
    commands.registerCommand('explorer.copy', () => 'copy-handler'); // 无自报，真属主靠壳回执落地
    await new Promise((r) => setTimeout(r, 0)); // 等回执 promise 链跑完

    commands.unregisterCommands('file-tree');

    expect(await commands.executeCommand('explorer.copy')).toBeUndefined();
    expect(fellBackToShell('explorer.copy')).toBe(true);
  });
});
