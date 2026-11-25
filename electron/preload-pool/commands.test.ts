/**
 * E6#62e 单测——池侧 on-command 激活（命令 miss → import 属主插件入口 → 重试一次）。
 *
 * 验证四条行为：
 * ① 壳占位转发（executeRequest → executeLocal）miss → _commandMissHandler(owner) import 属主入口
 *    （测试里 handler 模拟 entry 顶层副作用 registerCommand）→ 重试命中 → executeResult 回传结果；
 * ② 激活后仍 miss（entry 顶层无该命令——命令在视图组件注册的 inherent 边界）→ reject「未在池内注册」回传 error；
 * ③ executeCommand 直调（池→池/壳）miss：激活命中走池侧 handler，不 fallback 壳 IPC；
 * ④ executeCommand 直调二次 miss / 激活回调返回 false → fallback IPC.commands.execute，
 *    载荷恒归一成壳桥契约 `(id, token=undefined, ...realArgs)`——两种调用形（缺省形 / 池内形）等价。
 *
 * 命令 ID 恒虚构（硬约束 21：demo-plugin 属主 + .say/.ping/.nope 名），不指向真实插件。
 */
import { describe, it, expect, vi } from 'vitest';
import { IPC } from '../ipc/channels';

// ── electron ipcRenderer 假实现（commands.ts 顶层 import ipcRenderer，必须先行 mock）──
vi.mock('electron', async () => (await import('./commands.test-harness')).electronMock());

import { buildCommands } from './commands';
import { ipcMock, fakeEvents } from './commands.test-harness';

describe('池侧 on-command 激活（E6#62e）', () => {
  beforeEach(() => {
    ipcMock.invoke.mockClear();
  });

  it('壳占位转发 miss → handler import 属主入口注册后重试命中 → executeResult 回传结果', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    const activated: string[] = [];
    // 模拟池 renderer 注册的激活回调——handler 里 registerCommand 模拟 entry 顶层副作用
    commands._setCommandMissHandler(async (pluginId) => {
      activated.push(pluginId);
      commands.registerCommand(`${pluginId}.say`, () => 'pong');
      return true;
    });

    await events.triggerAsync({ requestId: 'r1', commandId: 'demo-plugin.say', args: [] });

    expect(activated).toEqual(['demo-plugin']);
    const resultCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    expect(resultCall?.[1]).toBe('r1');
    expect(resultCall?.[2]).toEqual({ result: 'pong' });
  });

  it('激活后仍 miss（命令在视图组件注册的 inherent 边界）→ reject 错误回传 executeResult', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    // entry import 完成但该命令 handler 不在 entry 顶层——激活重试仍 miss → 未在池内注册
    commands._setCommandMissHandler(async () => true);

    await events.triggerAsync({ requestId: 'r2', commandId: 'demo-plugin.nope', args: [] });

    const resultCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    expect(resultCall?.[1]).toBe('r2');
    expect((resultCall?.[2] as { error?: string })?.error).toContain('未在池内注册');
  });

  it('未注册激活回调 → executeRequest miss 直 reject', async () => {
    const events = fakeEvents();
    buildCommands(events); // 不注册 _setCommandMissHandler

    await events.triggerAsync({ requestId: 'r3', commandId: 'demo-plugin.nope', args: [] });

    const errorCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    expect(errorCall?.[1]).toBe('r3');
    expect((errorCall?.[2] as { error?: string })?.error).toContain('未在池内注册');
  });

  it('executeCommand 直调 miss → 激活命中走池侧 handler，不 fallback 壳 IPC', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    commands._setCommandMissHandler(async (pluginId) => {
      commands.registerCommand(`${pluginId}.ping`, () => 42);
      return true;
    });

    const result = await commands.executeCommand('demo-plugin.ping');

    expect(result).toBe(42);
    expect(ipcMock.invoke.mock.calls.some((c) => c[0] === IPC.commands.execute)).toBe(false);
  });

  it('executeCommand 直调二次 miss → fallback 壳 IPC 归一成 (id, token, ...realArgs)', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);

    await commands.executeCommand('demo-plugin.nope', undefined, 'realArg');

    const executeCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.execute);
    expect(executeCall?.[1]).toBe('demo-plugin.nope');
    expect(executeCall?.[2]).toBe(undefined); // token 占位槽
    expect(executeCall?.[3]).toBe('realArg');
  });

  it('作者形调用（不带 token 占位）→ 实参不许被壳当成 token 吃掉', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    const ctx = { pluginId: 'demo-plugin', scrollTo: 'demo.key' };

    await commands.executeCommand('demo-plugin.nope', ctx);

    const executeCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.execute);
    expect(executeCall?.[1]).toBe('demo-plugin.nope');
    expect(executeCall?.[2]).toBe(undefined); // 补出的 token 占位槽
    expect(executeCall?.[3]).toEqual(ctx); // ctx 落在真实实参位（core.openSettings 同形）
  });

  it('激活回调返回 false → 不重试直接 fallback', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    commands._setCommandMissHandler(async () => false);

    await commands.executeCommand('demo-plugin.nope');

    const executeCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.execute);
    expect(executeCall?.[1]).toBe('demo-plugin.nope');
  });

  // ── 🔴 载荷形状（2026-10-06 加：纠正案 V3 的机械判据）──────────────────────────────
  // 「事件里点一下菜单项」与「AI 直调」两条路的 handler 拿到的是**展开后的实参**，⛔ 不是整包数组。
  // 这两条钉死该语义：条数一变，所有按 `args[0]` 读载荷的插件（settings 管理器齿轮）立刻有据可查。
  it('池内命中的 handler 收**展开**实参——多枚各就各位，⛔ 不是整包数组', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    const got: unknown[] = [];
    commands.registerCommand('demo-plugin.echo', (...args: unknown[]) => {
      got.push(...args);
      return 'ok';
    });

    // ContextMenu 形：executeCommand(id, undefined, ...commandArgs, context)
    await commands.executeCommand('demo-plugin.echo', undefined, ['md', 'pdf'], { pluginId: 'demo-plugin' });

    expect(got).toEqual([['md', 'pdf'], { pluginId: 'demo-plugin' }]);
  });

  it('🔴 单参 handler 只收**第一枚**实参（丢 context）⇒ 数组型载荷必须写 rest 形式', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    let single: unknown = 'unset';
    commands.registerCommand('demo-plugin.single', (arg: unknown) => {
      single = arg;
      return 'ok';
    });

    await commands.executeCommand('demo-plugin.single', undefined, ['md', 'pdf'], { pluginId: 'demo-plugin' });

    // 只拿到 `commandArgs[0]`——settings 管理器齿轮的老写法正是此形：解析器要求「数组」，
    // 于是拿到 `['md','pdf']` 后读 `args[0]` 得到 `'md'`（字符串）⇒ 判空 ⇒ 菜单项静默空转。
    expect(single).toEqual(['md', 'pdf']);
  });
});

describe('S2/T14：池侧错误回传带 code/hint（结构化透传，裸 Error ⇒ EUNKNOWN）', () => {
  beforeEach(() => {
    ipcMock.invoke.mockClear();
  });

  const resultPayload = () => {
    const call = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    return call?.[2] as { error?: string; code?: string; hint?: string } | undefined;
  };

  it('带 code/hint 的插件错误 ⇒ 原样透传（⛔ 被压成裸字符串）', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    commands.registerCommand('demo-plugin.fail', () => {
      throw Object.assign(new Error('波特率非法'), { code: 'EBADBAUD', hint: '用 describe 看可选值' });
    });

    await events.triggerAsync({ requestId: 't14-1', commandId: 'demo-plugin.fail', args: [] });

    expect(resultPayload()).toEqual({ error: '波特率非法', code: 'EBADBAUD', hint: '用 describe 看可选值' });
  });

  it('裸 Error（无 code）⇒ code=EUNKNOWN（⛔ 壳侧猜语义）', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    commands.registerCommand('demo-plugin.bare', () => {
      throw new Error('随便失败了');
    });

    await events.triggerAsync({ requestId: 't14-2', commandId: 'demo-plugin.bare', args: [] });

    expect(resultPayload()).toEqual({ error: '随便失败了', code: 'EUNKNOWN' });
  });
});

describe('S2/T14 补充：错误形态宽容（错误对象不是 Error 实例也照样取 message）', () => {
  it('抛普通对象 {code, message, hint} ⇒ 原样透传，⛔ [object Object]', async () => {
    ipcMock.invoke.mockClear();
    const events = fakeEvents();
    const commands = buildCommands(events);
    commands.registerCommand('demo-plugin.plainObj', () => {
      // 故意模拟 pluginError 返回普通对象的形态（不是 Error 实例）
      throw { code: 'EPLUGIN', message: '插件说：参数不对', hint: '看 describe' };
    });

    await events.triggerAsync({ requestId: 't14-3', commandId: 'demo-plugin.plainObj', args: [] });

    const call = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    expect(call?.[2]).toEqual({ error: '插件说：参数不对', code: 'EPLUGIN', hint: '看 describe' });
  });
});

describe('2026-11-25：入口 import 强制上下文（齿轮命令丢失回归）', () => {
  it('视图挂载期间 import 入口 → 命令记 plugin 作用域，视图卸载后仍可执行', async () => {
    ipcMock.invoke.mockClear();
    const commands = buildCommands(fakeEvents());

    commands._enterViewContext('view-1');
    commands._beginEntryImport();
    commands.registerCommand('demo-plugin.entryScoped', () => 'ok');
    commands._endEntryImport();
    commands._leaveViewContext('view-1'); // 视图卸载：只摘 view:*，plugin 作用域必须留下

    await expect(commands.executeCommand('demo-plugin.entryScoped')).resolves.toBe('ok');
  });

  it('对照：同一路径不包 entry 上下文 → 记 view 作用域，视图卸载即摘（原有语义不变）', async () => {
    ipcMock.invoke.mockClear();
    const commands = buildCommands(fakeEvents());

    commands._enterViewContext('view-2');
    commands.registerCommand('demo-plugin.viewScoped', () => 'view');
    commands._leaveViewContext('view-2');

    // 已摘 ⇒ executeCommand miss → fallback 壳 IPC（mock 返回 undefined）
    await expect(commands.executeCommand('demo-plugin.viewScoped')).resolves.toBeUndefined();
  });
});

describe('2026-11-25：声明面命令 = 插件级（S4 作用域回归）', () => {
  it('声明过的命令即使先被视图注册，视图卸载时提升为 plugin，仍可执行', async () => {
    ipcMock.invoke.mockClear();
    const commands = buildCommands(fakeEvents());
    commands._setDeclaredCommandsForTest(['demo-plugin.declared']);

    commands._enterViewContext('view-3');
    commands.registerCommand('demo-plugin.declared', () => 'kept');
    commands._leaveViewContext('view-3');

    await expect(commands.executeCommand('demo-plugin.declared')).resolves.toBe('kept');
  });

  it('未声明的视图私有命令照旧随视图卸载清理', async () => {
    ipcMock.invoke.mockClear();
    const commands = buildCommands(fakeEvents());
    commands._setDeclaredCommandsForTest(['demo-plugin.declared']);

    commands._enterViewContext('view-4');
    commands.registerCommand('demo-plugin.private', () => 'gone');
    commands._leaveViewContext('view-4');

    await expect(commands.executeCommand('demo-plugin.private')).resolves.toBeUndefined();
  });

  it('view → plugin 重注册 = 提升（不因先来后到拒绝）', async () => {
    ipcMock.invoke.mockClear();
    const commands = buildCommands(fakeEvents());

    commands._enterViewContext('view-5');
    commands.registerCommand('demo-plugin.reg', () => 'view-handler');
    commands._leaveViewContext('view-5');
    commands._beginEntryImport();
    commands.registerCommand('demo-plugin.reg', () => 'entry-handler');
    commands._endEntryImport();

    await expect(commands.executeCommand('demo-plugin.reg')).resolves.toBe('entry-handler');
  });
});

describe('S4 根修第二次：提升判据 = 声明为 entry（⛔ "声明过"）', () => {
  it('视图卸载：声明 entry 的保留为 plugin；声明 view 的随实例删除', async () => {
    const events = fakeEvents();
    const commands = buildCommands(events);
    commands._setDeclaredCommandsForTest?.([
      ['demo-plugin.entryCmd', 'entry'],
      ['demo-plugin.viewCmd', 'view'],
    ]);
    commands._enterViewContext?.('tab-x');
    commands.registerCommand('demo-plugin.entryCmd', () => 'entry-ok');
    commands.registerCommand('demo-plugin.viewCmd', () => 'view-ok');
    commands._leaveViewContext?.('tab-x');

    // entry 提升为插件级：无视图仍可执行
    expect(await commands.executeCommand('demo-plugin.entryCmd')).toBe('entry-ok');
    // view 被删除：执行落壳 IPC（而不是本地执行）
    await commands.executeCommand('demo-plugin.viewCmd');
    const exec = ipcMock.invoke.mock.calls.filter((c) => c[0] === IPC.commands.execute);
    expect(exec.some((c) => c[1] === 'demo-plugin.viewCmd')).toBe(true);
  });
});

describe('S2/T14 根修：返回的结构化错误（pluginError）保留 code/hint', () => {
  it('handler 返回 {isPluginError,code,hint} ⇒ 回执带 code/hint（⛔ EUNKNOWN）', async () => {
    ipcMock.invoke.mockClear();
    const events = fakeEvents();
    const commands = buildCommands(events);
    commands.registerCommand('demo-plugin.retErr', () =>
      ({ isPluginError: true, code: 'EBADARGS', message: 'baudRate 必须是正整数', hint: '看 describe', details: { baudRate: -1 } }));

    await events.triggerAsync({ requestId: 't14-ret', commandId: 'demo-plugin.retErr', args: [] });

    const call = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    expect(call?.[2]).toMatchObject({ error: 'baudRate 必须是正整数', code: 'EBADARGS', hint: '看 describe' });
  });
});
