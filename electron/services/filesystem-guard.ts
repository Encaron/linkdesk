/**
 * filesystem 路径守卫——E5.7#63.5（安全模型 Layer 3 的落地：主进程 handler 权限校验）。
 *
 * 设计 → docs/02-Electron架构/E5.7_极简Pool/01-极简Pool设计.md §8.1「沙箱唯一故意开口」。
 * 池（插件）来源的写操作四步：
 *   1. 归一化——path.resolve 消除 ../ 穿越 → normalizePath 统一分隔符/盘符（复用 src/core/pathUtils）
 *   2. 危险目录写拒绝——盘根 / C:\Windows / C:\Program Files 等直接拒绝（无 dialog，不可放行）
 *   3. workspace 外写操作 → 用户确认 dialog（读放行——文件树/打开任意目录是正常用法）
 *   4. 越界尝试 console.error 记录——便于审计恶意插件
 *
 * 壳渲染进程是受信调用方（自己的 FileService 读写 settings/workspace 等）——sender 非池即直通，
 * 守卫只对插件沙箱边界（池）生效。dialog 用主进程原生 showMessageBox（main.ts:295 心跳弹窗同款
 * 先例——主进程无 i18n，文案硬编码；若未来主进程 i18n 化此文案随迁）。
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import type { WebContents } from 'electron';
import { normalizePath } from '../../src/core/utils/path/pathUtils.js';

export type GuardWriteOp = 'writeTextFile' | 'writeBinaryFile' | 'createDir' | 'copy' | 'rename' | 'remove';

/** Windows 系统目录——写操作无条件拒绝（归一化正斜杠形态） */
const WINDOWS_DANGEROUS_DIRS = ['C:/Windows', 'C:/Program Files', 'C:/Program Files (x86)'];
/** POSIX 系统目录——/ 仅精确匹配，其余前缀匹配 */
const POSIX_DANGEROUS_DIRS = ['/', '/usr', '/etc', '/bin', '/sbin', '/System'];
/** 平台常量——大写形态避开 pluginId 硬编码机械防线（'win32' 裸字面量比较会误报） */
const PLATFORM_WIN32 = 'win32';

const OP_LABELS: Record<GuardWriteOp, string> = {
  writeTextFile: '写入文件',
  writeBinaryFile: '写入二进制文件',
  createDir: '创建目录',
  copy: '复制到',
  rename: '重命名到', // E5.8#25.2：rename 通用 API 守卫标签
  remove: '删除',
};

/** 会话级已放行目录——用户 dialog 点"允许"后同目录写不再询问（main 进程级，跨壳重建保留） */
const _grantedOutsideDirs = new Set<string>();

/**
 * 池来源写操作守卫——壳来源直通（受信）。
 * @param isPoolSender 调用方是否池渲染进程（file-handlers 判定）
 * @param isDirTarget createDir 类——放行目录 = 目标本身；其余 = 父目录
 * @throws Error——危险目录 / 用户拒绝（IPC invoke 拒绝回传插件）
 */
export async function guardPoolWrite(
  sender: WebContents,
  isPoolSender: boolean,
  rawPath: string,
  op: GuardWriteOp,
  isDirTarget = false,
): Promise<void> {
  if (!isPoolSender) return;

  const target = normalizePath(path.resolve(rawPath));

  if (isDangerousTarget(target)) {
    console.error(`[filesystem-guard] 危险目录写入拒绝 (${op}): ${target}`);
    throw new Error(`路径守卫拒绝：禁止写入系统目录 "${target}"`);
  }

  if (await isInsideWorkspace(target)) return;

  const grantDir = isDirTarget ? target : path.dirname(target);
  if (_grantedOutsideDirs.has(grantDir)) return;

  console.error(`[filesystem-guard] workspace 外写入请求 (${op}): ${target}`);
  const allowed = await confirmOutsideWrite(sender, target, op);
  if (!allowed) {
    console.error(`[filesystem-guard] 用户拒绝 workspace 外写入 (${op}): ${target}`);
    throw new Error(`路径守卫拒绝：用户拒绝了工作区外${OP_LABELS[op]} "${target}"`);
  }
  _grantedOutsideDirs.add(grantDir);
}

/** 危险目标判定——盘根精确匹配（C:/ 本身不含子目录）；系统目录前缀匹配 */
function isDangerousTarget(target: string): boolean {
  if (/^[A-Z]:\/$/.test(target)) return true;
  if (process.platform !== PLATFORM_WIN32) {
    return POSIX_DANGEROUS_DIRS.some((d) => target === d || (d !== '/' && target.startsWith(d + '/')));
  }
  return WINDOWS_DANGEROUS_DIRS.some((d) => target === d || target.startsWith(d + '/'));
}

/**
 * workspace 内判定——读壳持久化的工作区文件夹列表（userData/workspace-folders.json，
 * 壳 WorkspaceService._persistFolders 每次 add/remove 写入，文件即真相源零同步开销）。
 * 读失败（无文件/损坏）→ 按 workspace 外处理（安全方向）。
 */
async function isInsideWorkspace(target: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(app.getPath('userData'), 'workspace-folders.json'), 'utf8');
    const parsed = JSON.parse(raw) as Array<{ uri?: string }>;
    if (!Array.isArray(parsed)) return false;
    return parsed.some((f) => {
      const uri = f.uri ? normalizePath(f.uri) : '';
      return uri.length > 0 && (target === uri || target.startsWith(uri + '/'));
    });
  } catch {
    return false;
  }
}

/** 用户确认——允许(0) 记入会话放行目录；拒绝(1) 抛错。parent 用 sender 所属窗口（WCV 场景 fromWebContents 返回宿主窗口）。 */
async function confirmOutsideWrite(sender: WebContents, target: string, op: GuardWriteOp): Promise<boolean> {
  const opts: Electron.MessageBoxOptions = {
    type: 'warning',
    title: '工作区外写入确认',
    message: `插件请求在工作区外${OP_LABELS[op]}：\n${target}`,
    detail: '该路径不在当前工作区文件夹内。仅在你认识此路径时允许。',
    buttons: ['允许', '拒绝'],
    defaultId: 1,
    cancelId: 1,
  };
  const parent = BrowserWindow.fromWebContents(sender);
  const { response } = parent && !parent.isDestroyed()
    ? await dialog.showMessageBox(parent, opts)
    : await dialog.showMessageBox(opts);
  return response === 0;
}
