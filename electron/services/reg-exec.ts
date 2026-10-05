/**
 * 注册表读写的**共用底座**：`reg.exe` 执行器 ＋ HKCU 键路径常量。
 *
 * 两个消费者（都在主进程）：
 *   · `registry-integration.ts` —— 安装器装的**静态半**：右键菜单三键 / 文件关联 ProgId 树。
 *   · `os-associations.ts` —— 插件装卸维护的**动态半**：各扩展名 `OpenWithProgids` 的自家候选值。
 * 为什么单开一份：两者都写 `HKCU\Software\Classes`，执行器/路径/flag 常量各写一份必漂移；
 * 且 `scripts/check-lsp-deps.mjs` 哨兵要求 spawn/exec 的**二进制字面量只有一处**（写两遍会红）。
 *
 * 口径三条（原住 registry-integration，随代码搬来）：
 *   ① **只写 HKCU**（per-user，免提权；⛔ 不碰 HKLM）；
 *   ② 命令走 `reg.exe`（`windowsHide: true` 防黑框闪）——**不引原生模块**；
 *   ③ 幂等由调用方保证（各 service 先读现状再写）。
 */

import { execFile } from 'node:child_process';

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
export const REG = { add: 'add', query: 'query', delete: 'delete', ve: '/ve', v: '/v', d: '/d', f: '/f', t: '/t' } as const;

export const defaultRegExec: RegExec = (args) =>
  new Promise((resolve) => {
    execFile(REG_EXE, args, { windowsHide: true }, (err, stdout) => {
      // reg query 查不到键 = 退出码 1（err 非空）——这不是异常，是「不存在」这一事实
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ code, stdout: stdout ?? '' });
    });
  });

/* ── 键路径（安装器与软件内写的**同一批键**；改一处必须两处同改） ── */

/** `HKCU\Software\Classes`——重定向友好（per-user 类注册，⛔ 不写 HKLM） */
export const CLS = 'HKCU\\Software\\Classes';
/** 文件关联 ProgId——「打开方式」候选指的就是它 */
export const PROGID = 'LinkDesk.Document';
