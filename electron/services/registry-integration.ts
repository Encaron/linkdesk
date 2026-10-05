/**
 * OS 集成注册表服务——E6#45f（软件内开关：#45 注册表三键/文件关联的运行时读写）。
 *
 * 与安装器（引导器 `syswrite.cpp`）写的是**同一批键**（HKCU\Software\Classes\... + LinkDesk.Document），
 * 所以「安装时勾的」与「软件里开的」天然一致——本服务只是给用户一个不用重装就能改的口子
 * （比 VS Code 强：它只能重跑安装器）。
 *
 * 🔴 实现口径三条：
 *   ① **只写 HKCU**（per-user，免提权；不碰 HKLM）；
 *   ② 命令走 `reg.exe`（`windowsHide: true` 防黑框闪）——**不引原生模块**；
 *   ③ **幂等**：`setIntegrationEnabled` 先读现状，与目标一致就直接返回（注册表读取是真相源，
 *      壳启动同步进来的值不会反过来触发一次无意义写）。
 *
 * 执行器 / 键路径常量搬到了 `reg-exec.ts`（与插件动态半 `os-associations.ts` 共用一份）。
 * 可注入 executor（单测给替身；生产 = child_process.execFile）——命令构造与状态解析是纯逻辑，单测钉住。
 *
 * ⚠️ 扩展名清单 = **生成物** `os-associations-static.generated.ts`（从随包插件声明收割）；
 *    ⛔ 本文件不再手抄（手抄版 13 条与声明 45 条早已漂移，T6 件 1 收掉这个漂移）。
 *    本服务管的是**静态半**；插件装卸产生的**动态半**见 `os-associations.ts`。
 */

import { CLS, PROGID, REG, defaultRegExec, type RegExec } from './reg-exec.js';
import { STATIC_ASSOC_EXTENSIONS } from './os-associations-static.generated.js';

// 重导出：既有消费方（preload-shell / 单测）从本模块取 RegExec 的历史 import 面保持不变
export type { RegExec };


export type OsIntegrationKind = 'fileMenu' | 'dirMenu' | 'fileAssoc';

export interface OsIntegrationState {
  fileMenu: boolean;
  dirMenu: boolean;
  fileAssoc: boolean;
}

/** 右键菜单项名（三处菜单共用）；供应商能力键树住 `HKCU\Software\LinkDesk` */
const MENU_KEY = 'OpenWithLinkDesk';
const VENDOR = 'HKCU\\Software\\LinkDesk';

/**
 * 文件类型关联登记的扩展名——**安装器静态半**的软件内镜像。
 * 🔴 真相源 = `os-associations-static.generated.ts`（scripts/gen-assoc-exts.mjs 从随包插件
 *    `contributes.fileAssociations` 收割，与引导器 `lk-assoc-exts.generated.h` 同源同序）。
 *    本开关「文件关联」写/撤的就是这批类型；插件装卸带来的**动态半**由 os-associations.ts 管，
 *    且那边**只碰不在本清单里的**扩展名——两边不交叉。
 */
export const ASSOC_EXTENSIONS = STATIC_ASSOC_EXTENSIONS;

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

/** 文件类型关联（ProgId + 静态清单各扩展名的 OpenWithProgids + Capabilities + RegisteredApplications） */
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
