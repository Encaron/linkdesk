/**
 * OS 集成注册表服务——E6#45f（软件内开关：#45 注册表三键/文件关联的运行时读写）。
 *
 * 与安装器（`build/installer.nsh`）写的是**同一批键**（HKCU\Software\Classes\... + LinkDesk.Document），
 * 所以「安装时勾的」与「软件里开的」天然一致——本服务只是给用户一个不用重装就能改的口子
 * （比 VS Code 强：它只能重跑安装器）。
 *
 * 🔴 实现口径三条：
 *   ① **只写 HKCU**（per-user，免提权；不碰 HKLM）；
 *   ② 命令走 `reg.exe`（`windowsHide: true` 防黑框闪）——**不引原生模块**；
 *   ③ **幂等**：`setIntegrationEnabled` 先读现状，与目标一致就直接返回（注册表读取是真相源，
 *      壳启动同步进来的值不会反过来触发一次无意义写）。
 *
 * 可注入 executor（单测给替身；生产 = child_process.execFile）——命令构造与状态解析是纯逻辑，单测钉住。
 */

import { execFile } from 'node:child_process';

export type OsIntegrationKind = 'fileMenu' | 'dirMenu' | 'fileAssoc';

export interface OsIntegrationState {
  fileMenu: boolean;
  dirMenu: boolean;
  fileAssoc: boolean;
}

/** reg.exe 执行器——返回退出码与 stdout（不抛：非零退出码是有意义的信号，如「键不存在」） */
export type RegExec = (args: string[]) => Promise<{ code: number; stdout: string }>;

/**
 * 🔴 用 **System32 绝对路径**而不是裸 `reg.exe` 两名原因：
 *   ① 防 PATH 劫持（按名调用会先命中 PATH 里排前的同名程序）；
 *   ② `scripts/check-lsp-deps.mjs` 哨兵会把 spawn/exec 调用里的二进制字面量当「仓库内必须存在的文件」查——
 *      裸 `reg.exe` 会被解析成 `<repo>/reg.exe` 而红灯（实测撞过）。
 */
const REG_EXE = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\reg.exe`;

/**
 * reg.exe 子命令与开关常量——**必须走常量、不许在调用处写回字面量**：
 * 该哨兵把调用参数里含 `/` 或 `\` 的字面量一律当路径（`isAbsolute('/ve')` 在 Windows 下为真）⇒
 * 写回 `'/ve'` 会再次红灯。flag 不是路径，认出来也就不该被它查。
 */
const REG = { add: 'add', query: 'query', delete: 'delete', ve: '/ve', v: '/v', d: '/d', f: '/f', t: '/t' } as const;

const defaultRegExec: RegExec = (args) =>
  new Promise((resolve) => {
    execFile(REG_EXE, args, { windowsHide: true }, (err, stdout) => {
      // reg query 查不到键 = 退出码 1（err 非空）——这不是异常，是「不存在」这一事实
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ code, stdout: stdout ?? '' });
    });
  });

/* ── 键路径（与 installer.nsh 逐字同源；改一处必须两处同改） ── */

const CLS = 'HKCU\\Software\\Classes';
const MENU_KEY = 'OpenWithLinkDesk';
const VENDOR = 'HKCU\\Software\\LinkDesk';
const PROGID = 'LinkDesk.Document';

/** 文件类型关联登记的 13 个扩展名（与 installer.nsh 的 lkAssocExt 清单同源） */
export const ASSOC_EXTENSIONS = [
  '.txt', '.py', '.js', '.json', '.md', '.html', '.css',
  '.ts', '.tsx', '.yaml', '.xml', '.csv', '.log',
] as const;

/** 各开关的「判据键」——读它是否存在即该开关当前是否启用 */
const DETECT_KEYS: Record<OsIntegrationKind, string> = {
  fileMenu: `${CLS}\\*\\shell\\${MENU_KEY}`,
  dirMenu: `${CLS}\\Directory\\shell\\${MENU_KEY}`,
  fileAssoc: `${CLS}\\${PROGID}`,
};

async function keyExists(exec: RegExec, key: string): Promise<boolean> {
  const { code } = await exec([REG.query, key]);
  return code === 0;
}

/** 读三项现状（注册表 = 唯一真相） */
export async function getIntegrationState(exec: RegExec = defaultRegExec): Promise<OsIntegrationState> {
  const [fileMenu, dirMenu, fileAssoc] = await Promise.all([
    keyExists(exec, DETECT_KEYS.fileMenu),
    keyExists(exec, DETECT_KEYS.dirMenu),
    keyExists(exec, DETECT_KEYS.fileAssoc),
  ]);
  return { fileMenu, dirMenu, fileAssoc };
}

/** 写一个「菜单项」三件套（默认值 + Icon + command）——三处菜单共用同一形状，只有 command 占位符不同 */
async function writeMenuItem(exec: RegExec, key: string, exePath: string, commandArg: string): Promise<void> {
  await exec([REG.add, key, REG.ve, REG.d, 'Open with LinkDesk', REG.f]);
  await exec([REG.add, key, REG.v, 'Icon', REG.d, exePath, REG.f]);
  await exec([REG.add, `${key}\\command`, REG.ve, REG.d, `"${exePath}" "${commandArg}"`, REG.f]);
}

async function deleteMenuKey(exec: RegExec, key: string): Promise<void> {
  await exec([REG.delete, key, REG.f]);
}

/** 文件类型关联（ProgId + 13 扩展名 OpenWithProgids + Capabilities + RegisteredApplications） */
async function writeFileAssoc(exec: RegExec, exePath: string): Promise<void> {
  await exec([REG.add, `${CLS}\\${PROGID}`, REG.ve, REG.d, 'LinkDesk Document', REG.f]);
  await exec([REG.add, `${CLS}\\${PROGID}\\DefaultIcon`, REG.ve, REG.d, exePath, REG.f]);
  await exec([REG.add, `${CLS}\\${PROGID}\\shell\\open\\command`, REG.ve, REG.d, `"${exePath}" "%1"`, REG.f]);
  for (const ext of ASSOC_EXTENSIONS) {
    await exec([REG.add, `${CLS}\\${ext}\\OpenWithProgids`, REG.v, PROGID, REG.t, 'REG_NONE', REG.f]);
    await exec([REG.add, `${VENDOR}\\Capabilities\\FileAssociations`, REG.v, ext, REG.d, PROGID, REG.f]);
  }
  await exec([REG.add, `${VENDOR}\\Capabilities`, REG.v, 'ApplicationName', REG.d, 'LinkDesk', REG.f]);
  await exec([REG.add, `${VENDOR}\\Capabilities`, REG.v, 'ApplicationDescription', REG.d, 'LinkDesk 通用容器', REG.f]);
  await exec([REG.add, 'HKCU\\Software\\RegisteredApplications', REG.v, 'LinkDesk', REG.d, `${VENDOR.slice(5)}\\Capabilities`, REG.f]);
}

async function deleteFileAssoc(exec: RegExec): Promise<void> {
  for (const ext of ASSOC_EXTENSIONS) {
    // 只删**我们写的值**——.txt 等扩展名键本身不是我们建的（同 installer 卸载口径）
    await exec([REG.delete, `${CLS}\\${ext}\\OpenWithProgids`, REG.v, PROGID, REG.f]);
  }
  await exec([REG.delete, `${CLS}\\${PROGID}`, REG.f]);
  await exec([REG.delete, `${VENDOR}\\Capabilities`, REG.f]);
  await exec([REG.delete, 'HKCU\\Software\\RegisteredApplications', REG.v, 'LinkDesk', REG.f]);
}

/**
 * 开/关某一项——幂等（现状 == 目标 ⇒ 不写）；返回写后的完整状态（调用方据此刷新 UI）。
 * `exePath` = 当前进程 exe（`process.execPath`）；dev 模式下它是 Electron 的 exe，
 * 但那正是「用 LinkDesk 打开」该指的宿主——**不做特判**（dev 里验的就是这条链）。
 */
export async function setIntegrationEnabled(
  kind: OsIntegrationKind,
  enabled: boolean,
  exePath: string,
  exec: RegExec = defaultRegExec,
): Promise<OsIntegrationState> {
  const current = await getIntegrationState(exec);
  if (current[kind] === enabled) return current;

  if (kind === 'fileMenu') {
    if (enabled) await writeMenuItem(exec, `${CLS}\\*\\shell\\${MENU_KEY}`, exePath, '%1');
    else await deleteMenuKey(exec, `${CLS}\\*\\shell\\${MENU_KEY}`);
  } else if (kind === 'dirMenu') {
    // 目录右键 = 两处键（对文件夹本体 + 文件夹空白处）——开关管一对，`%V` 是背景键专用占位符
    if (enabled) {
      await writeMenuItem(exec, `${CLS}\\Directory\\shell\\${MENU_KEY}`, exePath, '%1');
      await writeMenuItem(exec, `${CLS}\\Directory\\Background\\shell\\${MENU_KEY}`, exePath, '%V');
    } else {
      await deleteMenuKey(exec, `${CLS}\\Directory\\shell\\${MENU_KEY}`);
      await deleteMenuKey(exec, `${CLS}\\Directory\\Background\\shell\\${MENU_KEY}`);
    }
  } else {
    if (enabled) await writeFileAssoc(exec, exePath);
    else await deleteFileAssoc(exec);
  }
  return getIntegrationState(exec);
}
