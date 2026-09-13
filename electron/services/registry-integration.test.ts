/**
 * registry-integration 单测——E6#45f 软件内开关的注册表读写。
 *
 * 判据（"写反了也照样能跑"的那几种）：
 * ① 状态读取：三键存在性 → 三布尔（query 退出码 0 = 存在）；
 * ② **幂等**：现状 == 目标 ⇒ 一条写命令都不发（否则壳启动同步会把每次启动变成一轮无意义注册表写）；
 * ③ 命令构造：菜单项三件套（默认值/Icon/command）+ 委托符（文件/目录本体 `%1`、空白处 `%V`）；
 * ④ 卸载口径：只删**我们写的值**——`.txt` 等扩展名键本身不许删。
 *
 * executor 注入（替身照契约：只收 args、回 { code, stdout }）；fixture 全虚构（硬约束 21）。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  getIntegrationState,
  setIntegrationEnabled,
  ASSOC_EXTENSIONS,
  type RegExec,
} from './registry-integration';

const EXE = 'C:\\demo\\LinkDesk.exe';

/** 造一个「注册表」替身：按 query 的键是否在 present 集合里返回 0/1，并记录全部调用 */
function makeExec(present: Set<string>): { exec: RegExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: RegExec = vi.fn(async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'query') return { code: present.has(args[1]) ? 0 : 1, stdout: '' };
    return { code: 0, stdout: '' };
  });
  return { exec, calls };
}

const FILE_MENU_KEY = 'HKCU\\Software\\Classes\\*\\shell\\OpenWithLinkDesk';
const DIR_MENU_KEY = 'HKCU\\Software\\Classes\\Directory\\shell\\OpenWithLinkDesk';
const DIR_BG_KEY = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\OpenWithLinkDesk';
const PROGID_KEY = 'HKCU\\Software\\Classes\\LinkDesk.Document';

describe('getIntegrationState', () => {
  it('三键存在性 → 三布尔', async () => {
    const { exec } = makeExec(new Set([FILE_MENU_KEY, PROGID_KEY]));
    expect(await getIntegrationState(exec)).toEqual({ fileMenu: true, dirMenu: false, fileAssoc: true });
  });
});

describe('setIntegrationEnabled —— 幂等（②）', () => {
  it('现状 == 目标 ⇒ 只发 query，不发任何写命令', async () => {
    const { exec, calls } = makeExec(new Set([FILE_MENU_KEY]));
    const state = await setIntegrationEnabled('fileMenu', true, EXE, exec);
    expect(state.fileMenu).toBe(true);
    const mutations = calls.filter((c) => c[0] !== 'query');
    expect(mutations).toEqual([]);
  });
});

describe('setIntegrationEnabled —— 开（③ 命令构造）', () => {
  it('文件右键：三件套 + command 用 %1', async () => {
    const { exec, calls } = makeExec(new Set());
    await setIntegrationEnabled('fileMenu', true, EXE, exec);
    const adds = calls.filter((c) => c[0] === 'add').map((c) => c.slice(1));
    expect(adds).toContainEqual([FILE_MENU_KEY, '/ve', '/d', 'Open with LinkDesk', '/f']);
    expect(adds).toContainEqual([FILE_MENU_KEY, '/v', 'Icon', '/d', EXE, '/f']);
    expect(adds).toContainEqual([`${FILE_MENU_KEY}\\command`, '/ve', '/d', `"${EXE}" "%1"`, '/f']);
  });

  it('目录右键：本体 %1 + 空白处 %V（两处键一对开关）', async () => {
    const { exec, calls } = makeExec(new Set());
    await setIntegrationEnabled('dirMenu', true, EXE, exec);
    const adds = calls.filter((c) => c[0] === 'add').map((c) => c.join(' '));
    expect(adds.some((a) => a.includes(DIR_MENU_KEY) && a.includes('"%1"'))).toBe(true);
    expect(adds.some((a) => a.includes(DIR_BG_KEY) && a.includes('"%V"'))).toBe(true);
  });

  it('文件关联：13 个扩展名各一条 OpenWithProgids + ProgId/Capabilities/RegisteredApplications', async () => {
    const { exec, calls } = makeExec(new Set());
    await setIntegrationEnabled('fileAssoc', true, EXE, exec);
    const adds = calls.filter((c) => c[0] === 'add').map((c) => c.join(' '));
    for (const ext of ASSOC_EXTENSIONS) {
      expect(adds.some((a) => a.includes(`${ext}\\OpenWithProgids`))).toBe(true);
    }
    expect(adds.some((a) => a.includes(PROGID_KEY))).toBe(true);
    expect(adds.some((a) => a.includes('RegisteredApplications') && a.includes('LinkDesk'))).toBe(true);
  });
});

describe('setIntegrationEnabled —— 关（④ 卸载口径）', () => {
  it('关文件关联：只删我们写的值，不删扩展名键本身', async () => {
    const { exec, calls } = makeExec(new Set([PROGID_KEY]));
    await setIntegrationEnabled('fileAssoc', false, EXE, exec);
    const deletes = calls.filter((c) => c[0] === 'delete').map((c) => c.slice(1));
    // 每个扩展名只删「值 PROGID」，键路径末尾是 OpenWithProgids（不是整个 .txt 键）
    for (const ext of ASSOC_EXTENSIONS) {
      const hasValueDelete = deletes.some(
        (d) => d[0] === `HKCU\\Software\\Classes\\${ext}\\OpenWithProgids` && d[1] === '/v' && d[2] === 'LinkDesk.Document',
      );
      expect(hasValueDelete).toBe(true);
    }
    // 绝不出现「删扩展名键本身」（delete <ext> /f）
    for (const ext of ASSOC_EXTENSIONS) {
      expect(deletes.some((d) => d[0] === `HKCU\\Software\\Classes\\${ext}` && d[1] === '/f')).toBe(false);
    }
  });

  it('关目录右键：两处键都删', async () => {
    const { exec, calls } = makeExec(new Set([DIR_MENU_KEY]));
    await setIntegrationEnabled('dirMenu', false, EXE, exec);
    const deletes = calls.filter((c) => c[0] === 'delete').map((c) => c.join(' '));
    expect(deletes.some((d) => d.includes(DIR_MENU_KEY))).toBe(true);
    expect(deletes.some((d) => d.includes(DIR_BG_KEY))).toBe(true);
  });
});
