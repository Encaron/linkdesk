/**
 * os-associations-sync 单测——T6（第 5 波）触发装配层（去抖 / 门 / 重放）。
 *
 * 判据：
 * ① **去抖合并**：连打多次只真跑一次（启动期 45 条声明 = 45 次通知 ⇒ 一次 reg 往返）。
 * ② **配置门**：`followPlugins:false` 或 `overrides` 关掉某类 ⇒ 不写那类（配置从 settings.json 读）。
 * ③ **窄口**：只有 `app.osAssociations.*` 两键触发重放，别的键（含覆盖表键）不触发。
 * ④ 未装配 / 依赖抛错 ⇒ 返回 null 不炸（注册表写失败不该让软件起不来）。
 *
 * 依赖全注入（本模块不 import electron）；状态文件写临时路径。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configureOsAssociationsSync,
  isOsAssociationsSyncConfigured,
  notifyOsAssociationsConfigChanged,
  resetOsAssociationsSyncForTest,
  runOsAssociationsSyncNow,
  scheduleOsAssociationsSync,
} from './os-associations-sync';
import {
  OS_ASSOCIATIONS_FOLLOW_PLUGINS_KEY,
  OS_ASSOCIATIONS_OVERRIDES_KEY,
} from '../../src/core/services/files/FileAssociationService';
import type { RegExec } from './reg-exec';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ld-osassoc-sync-'));
  resetOsAssociationsSyncForTest();
});
afterEach(() => {
  resetOsAssociationsSyncForTest();
  rmSync(dir, { recursive: true, force: true });
});

/** 装配一份假依赖：settings 表 / ProgId 状态 / 声明集合都可控，exec 记账 */
function setup(opts: {
  settings?: Record<string, unknown>;
  progIdRegistered?: boolean;
  declared?: string[];
}) {
  const calls: string[][] = [];
  const exec: RegExec = vi.fn(async (args: string[]) => {
    calls.push(args);
    return { code: 0, stdout: '' };
  });
  const listDeclared = vi.fn(() => opts.declared ?? ['.pdf']);
  configureOsAssociationsSync({
    statePath: join(dir, 'dynamic.json'),
    readSettings: async () => opts.settings ?? {},
    isProgIdRegistered: async () => opts.progIdRegistered ?? true,
    listDeclared,
    exec,
  });
  return { calls, listDeclared };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('runOsAssociationsSyncNow', () => {
  it('未装配 ⇒ null（并留日志），不抛', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(runOsAssociationsSyncNow('test')).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('缺省配置（settings.json 没有两键）⇒ 跟随开：声明里非静态类被写', async () => {
    const { calls } = setup({ declared: ['.pdf', '.txt'] });
    const r = await runOsAssociationsSyncNow('test');
    expect(r?.active).toEqual(['.pdf']); // .txt 是静态类（随包件声明），动态半不碰
    expect(calls.map((c) => c.join(' ')).some((c) => c.includes('OpenWithProgids') && c.includes('.pdf'))).toBe(true);
  });

  it('② 配置门：followPlugins:false ⇒ 不写；overrides 关掉的那类也不写', async () => {
    const off = setup({ settings: { [OS_ASSOCIATIONS_FOLLOW_PLUGINS_KEY]: false }, declared: ['.pdf'] });
    expect((await runOsAssociationsSyncNow('off'))?.active).toEqual([]);
    expect(off.calls).toEqual([]);

    resetOsAssociationsSyncForTest();
    const ovr = setup({
      settings: { [OS_ASSOCIATIONS_OVERRIDES_KEY]: { '.pdf': false, '.mp4': true } },
      declared: ['.pdf', '.mp4'],
    });
    expect((await runOsAssociationsSyncNow('overrides'))?.active).toEqual(['.mp4']);
    expect(ovr.calls.map((c) => c.join(' ')).every((c) => !c.includes('.pdf'))).toBe(true);
  });

  it('④ 依赖抛错 ⇒ null（不炸主进程）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    configureOsAssociationsSync({
      statePath: join(dir, 'dynamic.json'),
      readSettings: async () => {
        throw new Error('settings.json 读炸了');
      },
      isProgIdRegistered: async () => true,
      listDeclared: () => ['.pdf'],
    });
    await expect(runOsAssociationsSyncNow('boom')).resolves.toBeNull();
    warn.mockRestore();
  });
});

describe('scheduleOsAssociationsSync —— ① 去抖合并', () => {
  it('连打 5 次 ⇒ 只真跑一次', async () => {
    const { listDeclared } = setup({ declared: ['.pdf'] });
    for (let i = 0; i < 5; i++) scheduleOsAssociationsSync(`burst-${i}`);
    await sleep(400);
    expect(listDeclared).toHaveBeenCalledTimes(1);
  });

  it('装配状态可查（main.ts 启动自查用）', () => {
    expect(isOsAssociationsSyncConfigured()).toBe(false);
    setup({});
    expect(isOsAssociationsSyncConfigured()).toBe(true);
  });
});

describe('notifyOsAssociationsConfigChanged —— ③ 窄口', () => {
  it('两键触发重放，其它键（含覆盖表）不触发', async () => {
    const { listDeclared } = setup({ declared: ['.pdf'] });
    notifyOsAssociationsConfigChanged('workbench.fileAssociations');
    notifyOsAssociationsConfigChanged('app.hint.enabled');
    await sleep(400);
    expect(listDeclared).not.toHaveBeenCalled();

    notifyOsAssociationsConfigChanged(OS_ASSOCIATIONS_FOLLOW_PLUGINS_KEY);
    await sleep(400);
    expect(listDeclared).toHaveBeenCalledTimes(1);
  });
});
