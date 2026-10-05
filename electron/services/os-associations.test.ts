/**
 * os-associations 单测——T6（第 5 波）运行期动态半：插件声明 → OS「打开方式」候选。
 *
 * 判据（都会「写反了照样能跑」，故必须钉住）：
 * ① **纯选型**：静态清单里的扩展名一条都不选（静态半归安装器/「文件关联」开关管，两边都写=打架）；
 *    overrides 逐类关；总开关关 = 空；同一扩展名多插件声明只写一次；输出排序稳定。
 * ② **E24 边界**：命令里**永不出现 `UserChoice`**，且撤的时候只删自家 ProgId 那一个值
 *    （⛔ 不是删 `OpenWithProgids` 键——别的程序的候选住在里面）。
 * ③ **增量**：desired 与「我们写过的」求差——只对差集发命令（装卸全量重放不重写已写的）。
 * ④ **总开关关 / ProgId 树不在** ⇒ 已写的全撤（判据 ④；僵尸候选不许留）。
 * ⑤ 状态文件是本模块唯一 owner：写完的集合落盘，下次启动按它撤（不靠猜）。
 * ⑥ **禁列**（判据 ③「exe 永不登记」）：可执行类声明了也不选、不写命令；`.bat`/`.cmd` 是文本
 *    脚本（`editor` 正经声明），**不在**禁列——禁列宽了会误伤，所以正反两面都钉住。
 *
 * executor 注入（替身照契约）；fixture 全虚构（硬约束 21）；状态文件写 os.tmpdir 下的临时路径。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDynamicState, selectDynamicExtensions, syncDynamicAssociations } from './os-associations';
import type { RegExec } from './reg-exec';

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ld-osassoc-'));
  statePath = join(dir, 'os-associations-dynamic.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeExec(): { exec: RegExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: RegExec = vi.fn(async (args: string[]) => {
    calls.push(args);
    return { code: 0, stdout: '' };
  });
  return { exec, calls };
}

/* ── ① 纯选型 ── */

describe('selectDynamicExtensions', () => {
  it('跳过静态清单、跳过 overrides 关掉的、归一化去重后排序', () => {
    expect(
      selectDynamicExtensions({
        declared: ['.pdf', 'PDF', '.txt', '.MP4'],
        staticExts: ['.txt'],
        followPlugins: true,
        overrides: { '.pdf': false },
      })
    ).toEqual(['.mp4']);
  });

  it('总开关关 ⇒ 一条不选（关 = 撤回运行期登记；静态不动由调用方保证）', () => {
    expect(
      selectDynamicExtensions({ declared: ['.pdf'], staticExts: [], followPlugins: false })
    ).toEqual([]);
  });

  it('⑥ 禁列：可执行类（.exe/.msi/.dll/.lnk）声明了也不选；文本脚本 .bat 照选', () => {
    expect(
      selectDynamicExtensions({
        declared: ['.exe', '.EXE', '.msi', '.dll', '.lnk', '.bat', '.pdf'],
        staticExts: [],
        followPlugins: true,
      })
    ).toEqual(['.bat', '.pdf']);
  });

  it('overrides 为 true 不改变「跟随」语义（只有显式 false 才挡）', () => {
    expect(
      selectDynamicExtensions({
        declared: ['.pdf'],
        staticExts: [],
        followPlugins: true,
        overrides: { '.pdf': true },
      })
    ).toEqual(['.pdf']);
  });
});

/* ── ②③④⑤ 写注册表 ── */

describe('syncDynamicAssociations', () => {
  it('新增：每个扩展名一条 OpenWithProgids 值写（REG_NONE/自家 ProgId）', async () => {
    const { exec, calls } = makeExec();
    const r = await syncDynamicAssociations({
      declared: ['.pdf', '.mp4'],
      staticExts: ['.txt'],
      followPlugins: true,
      progIdRegistered: true,
      statePath,
      exec,
    });
    expect(r).toEqual({ active: ['.mp4', '.pdf'], added: ['.mp4', '.pdf'], removed: [] });
    const writes = calls.filter((c) => c[0] === 'add').map((c) => c.join(' '));
    expect(writes).toEqual([
      'add HKCU\\Software\\Classes\\.mp4\\OpenWithProgids /v LinkDesk.Document /t REG_NONE /f',
      'add HKCU\\Software\\Classes\\.pdf\\OpenWithProgids /v LinkDesk.Document /t REG_NONE /f',
    ]);
    expect(await readDynamicState(statePath)).toEqual(['.mp4', '.pdf']);
  });

  it('E24：命令里永不出现 UserChoice，且只删自家 ProgId 值（不删 OpenWithProgids 键）', async () => {
    const { exec, calls } = makeExec();
    await syncDynamicAssociations({
      declared: ['.pdf'],
      staticExts: [],
      followPlugins: true,
      progIdRegistered: true,
      statePath,
      exec,
    });
    // 再关总开关 ⇒ 全撤
    await syncDynamicAssociations({
      declared: ['.pdf'],
      staticExts: [],
      followPlugins: false,
      progIdRegistered: true,
      statePath,
      exec,
    });
    const flat = calls.map((c) => c.join(' '));
    expect(flat.some((c) => c.includes('UserChoice'))).toBe(false);
    const deletes = flat.filter((c) => c.startsWith('delete'));
    expect(deletes).toEqual([
      'delete HKCU\\Software\\Classes\\.pdf\\OpenWithProgids /v LinkDesk.Document /f',
    ]);
    expect(await readDynamicState(statePath)).toEqual([]);
  });

  it('③ 增量：第二次跑同一集合 ⇒ 一条命令都不发（幂等）', async () => {
    const first = makeExec();
    await syncDynamicAssociations({
      declared: ['.pdf'],
      staticExts: [],
      followPlugins: true,
      progIdRegistered: true,
      statePath,
      exec: first.exec,
    });
    const second = makeExec();
    const r = await syncDynamicAssociations({
      declared: ['.pdf'],
      staticExts: [],
      followPlugins: true,
      progIdRegistered: true,
      statePath,
      exec: second.exec,
    });
    expect(r).toEqual({ active: ['.pdf'], added: [], removed: [] });
    expect(second.calls).toEqual([]);
  });

  it('④ ProgId 树不在（「文件关联」关着）⇒ 已写的全撤、新声明不写（不留僵尸候选）', async () => {
    const seeded = makeExec();
    await syncDynamicAssociations({
      declared: ['.pdf'],
      staticExts: [],
      followPlugins: true,
      progIdRegistered: true,
      statePath,
      exec: seeded.exec,
    });
    const { exec, calls } = makeExec();
    const r = await syncDynamicAssociations({
      declared: ['.pdf', '.mp4'],
      staticExts: [],
      followPlugins: true,
      progIdRegistered: false,
      statePath,
      exec,
    });
    expect(r).toEqual({ active: [], added: [], removed: ['.pdf'] });
    expect(calls.every((c) => c[0] === 'delete')).toBe(true);
  });

  it('⑤ 状态文件读不动（首次运行/被删）⇒ 视为空，只增不撤', async () => {
    const { exec, calls } = makeExec();
    const r = await syncDynamicAssociations({
      declared: ['.pdf'],
      staticExts: [],
      followPlugins: true,
      progIdRegistered: true,
      statePath: join(dir, 'never-written.json'),
      exec,
    });
    expect(r.removed).toEqual([]);
    expect(calls.filter((c) => c[0] === 'delete')).toEqual([]);
  });

  it('⑤b 状态文件损坏 ⇒ 读成空表（不是抛错）', async () => {
    writeFileSync(statePath, '{ 这不是 json', 'utf8');
    expect(await readDynamicState(statePath)).toEqual([]);
  });

  it('⑤c 状态文件形状 = { written: [...] }（落盘可读、带换行）', async () => {
    const { exec } = makeExec();
    await syncDynamicAssociations({
      declared: ['.pdf'],
      staticExts: [],
      followPlugins: true,
      progIdRegistered: true,
      statePath,
      exec,
    });
    expect(readFileSync(statePath, 'utf8')).toBe('{\n  "written": [\n    ".pdf"\n  ]\n}\n');
  });
});
