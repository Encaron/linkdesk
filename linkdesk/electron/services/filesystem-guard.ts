/**
 * filesystem 路径守卫——E5.7#63.5（安全模型 Layer 3 的落地：主进程 handler 权限校验）。
 *
 * 设计 → docs/02-Electron架构/E5.7_极简Pool/01-极简Pool设计.md §8.1「沙箱唯一故意开口」。
 * 池（插件）来源的写操作分级（可信区直通 → 确认一次 → 无条件拒绝）：
 *   1. 归一化——path.resolve 消除 ../ 穿越 → normalizePath 统一分隔符/盘符（复用 src/core/pathUtils）
 *   2. 可信区直通——workspace 内 + 插件数据根（<userData>/linkdesk/plugins/，env.get 暴露 = 壳隐含授权）
 *   3. 其余 workspace 外写操作 → 用户确认 dialog（读放行——文件树/打开任意目录是正常用法）；
 *      点「允许」记入持久化放行目录 guard-grants.json——同目录写不再询问（重启应用也保留，
 *      对标「以 JSON 打开设置」= UI 显式入口即隐含授权）
 *   4. 危险目录（盘根 / C:\Windows / C:\Program Files 等）无条件拒绝——无 dialog，不可放行，
 *      且持久化放行记忆不能覆盖它（检查顺序先于放行目录）
 *   5. 越界尝试 console.error 记录——便于审计恶意插件
 *
 * 壳渲染进程是受信调用方（自己的 FileService 读写 settings/workspace 等）——sender 非池即直通，
 * 守卫只对插件沙箱边界（池）生效。dialog 用主进程原生 showMessageBox（main.ts:295 心跳弹窗同款
 * 先例——主进程无 i18n，文案硬编码；若未来主进程 i18n 化此文案随迁）。
 */

import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import type { WebContents } from 'electron';
import { normalizePath } from '../../src/core/utils/path/pathUtils.js';
import { envService } from './env-service.js';

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

/** 已放行目录持久化文件——<userData>/guard-grants.json。点「允许」落盘，重启应用不再询问（E5.8#30.20 关闭串口落盘反复弹窗修复） */
function grantsFile(): string {
  return path.join(app.getPath('userData'), 'guard-grants.json');
}

/** 已放行目录（持久化 Set 的内存镜像）——懒加载；文件缺失/损坏 → 空放行（安全方向，重新询问） */
const _grants = new Set<string>();
let _grantsLoaded = false;
let _grantsLoading: Promise<void> | undefined;

async function ensureGrantsLoaded(): Promise<void> {
  if (_grantsLoaded) return;
  if (!_grantsLoading) {
    _grantsLoading = (async () => {
      try {
        const raw = await readFile(grantsFile(), 'utf8');
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          for (const dir of parsed) {
            if (typeof dir === 'string' && dir) _grants.add(dir);
          }
        }
      } catch {
        /* 无文件/损坏 → 空放行（安全方向） */
      }
      _grantsLoaded = true;
    })();
  }
  return _grantsLoading;
}

/** 放行记忆落盘——失败仅降级会话级（内存 Set 仍生效），不阻断本次写入 */
async function persistGrants(): Promise<void> {
  try {
    await writeFile(grantsFile(), JSON.stringify([..._grants], null, 2), 'utf8');
  } catch (e) {
    console.error('[filesystem-guard] 放行记忆落盘失败:', e);
  }
}

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
  if (isInsidePluginDataRoot(target)) return;

  const grantDir = isDirTarget ? target : path.dirname(target);
  await ensureGrantsLoaded();
  if (_grants.has(grantDir)) return;

  console.error(`[filesystem-guard] workspace 外写入请求 (${op}): ${target}`);
  const allowed = await confirmOutsideWrite(sender, target, op);
  if (!allowed) {
    console.error(`[filesystem-guard] 用户拒绝 workspace 外写入 (${op}): ${target}`);
    throw new Error(`路径守卫拒绝：用户拒绝了工作区外${OP_LABELS[op]} "${target}"`);
  }
  _grants.add(grantDir);
  await persistGrants();
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

/**
 * 插件数据根内判定——<userData>/linkdesk/plugins/（env-service.pluginsRootDir）。
 * 壳通过 env.get() 暴露 pluginDataDir 给插件 + 安装时 ensurePluginDataDir 自动建目录 =
 * 隐含写入授权；池来源写自身数据目录（receive-saves/、exports/、cache/）是正当能力，
 * 等同 workspace 内豁免，不弹用户确认。
 * （E5.8#30.20 自动保存关串口落盘弹「工作区外写入」——壳 API 自相矛盾：给了目录却拦写入。
 * 豁免整体数据根：同沙箱渲染进程插件互写本就防不住，不增加攻击面；归一化/危险目录检查仍全生效。）
 */
function isInsidePluginDataRoot(target: string): boolean {
  const root = normalizePath(envService.pluginsRootDir());
  return target === root || target.startsWith(root + '/');
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
