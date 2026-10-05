/**
 * commit-staged-update——插件更新的**暂存提交**单复本（0.2.48）。
 *
 * 背景（dev 轨道实测，2026-10-05）：dev 下插件代码由 Vite 从 {userData}/plugins/<id>/ 现场供应，
 * 常驻视图的插件目录挂着 Vite 的监视句柄 ⇒ 更新提交的第一步 rename 稳定 EBUSY，退避重试救不了
 * 常驻句柄——用户撞上「旧版本目录被其他进程占用」死胡同（安装版无此问题）。
 *
 * 修法（用户 2026-10-05 拍板「按好的方案修」）：
 *   ① 首次 rename（target→.bak）busy 耗尽 ⇒ 抛 {@link DirBusyError}——**什么都没挪动、旧版原样、
 *      暂存目录原样**，handler 转为 `deferred: true` 返回（不报错），壳提示「重启后自动替换」；
 *   ② 启动时 {@link commitPendingStagedUpdates} 在 `.bak` 复原之后、`cleanupStaleDownloads`
 *      （会清 .stage-*）**之前**，把遗留的 `.stage-<id>` **再校验后提交**（启动瞬间单实例无在途更新、
 *      Vite 尚未导入任何插件模块 ⇒ 无句柄竞争；提交先于三表扫描/发货夹，账本 boot 对账自愈版本号）。
 *
 * 🔴 成功路径的原子语义一字未动（05 §二·六）：target→.bak→staged→target→rm .bak，同卷原子、
 *    失败复原旧版——本模块只是把 IPC handler 里的同一段抽出来给启动复用（jscpd 单复本纪律）。
 */

import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";

import { compareVersions } from "../../src/core/utils/plugin/semverUtils.js";
import { parseManifestJson } from "../../src/pluginLoader/jsonc.js";
import { downloadTmpDir, STAGE_PREFIX } from "../services/plugin-download.js";
import { userPluginsRoot } from "./plugin-tree-recovery.js";

/** 首次 rename busy 耗尽——调用方据此转 deferred（磁盘状态：target 原样 + 暂存原样，可安全重试/延后） */
export class DirBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirBusyError";
  }
}

const RENAME_BUSY_RETRY_DELAYS_MS = [0, 250, 700, 1500, 2500];

/** 带退避的 rename——EPERM/EACCES/EBUSY 按表退避重试，耗尽 ⇒ {@link DirBusyError}；其他错误原样抛 */
async function renameBusyRetry(from: string, to: string): Promise<void> {
  for (let i = 0; i < RENAME_BUSY_RETRY_DELAYS_MS.length; i++) {
    const delay = RENAME_BUSY_RETRY_DELAYS_MS[i];
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      await fs.rename(from, to);
      if (i > 0) console.warn(`[plugin-commit] 目录占用已释放——第 ${i + 1} 次尝试成功：${from}`);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code ?? "";
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw e;
      console.warn(`[plugin-commit] rename 被占用（${code}）——第 ${i + 1} 次失败，退避后重试：${from}`);
    }
  }
  throw new DirBusyError(
    "旧版本目录被其他进程占用，替换失败——请关闭可能占用它的程序（DevTools、杀软扫描、资源管理器预览窗格、编辑器）后重试",
  );
}

/**
 * 把已暂存的新版提交进位（IPC `plugins:commit-update` 与启动补提交共用）。
 * 抛 {@link DirBusyError} = 首次 rename 被占（磁盘未动，可延后重试）；其他错误 = 已尽力复原旧版。
 */
export async function applyStagedUpdate(pluginId: string, stagedDir: string): Promise<{ pluginId: string; version: string }> {
  if (typeof pluginId !== "string" || !pluginId) throw new Error("缺少 pluginId");
  if (typeof stagedDir !== "string" || !stagedDir) throw new Error("缺少暂存目录");
  const target = path.join(userPluginsRoot(), pluginId); // 2026-09-05 塌平单根
  // E6#73j（G8）：同会话内重试——上轮 commit 死在两次 rename 之间时，磁盘上只剩 target.bak。
  // 此处若不先把 .bak 放回，下方「清遗留 .bak」会删掉旧版**唯一副本**，随后 rename 又因 target 不存在而抛错
  // ⇒ 插件永久丢失。判据与 boot 复原同一套：目录在不在。
  const bak = `${target}.bak`;
  if (!existsSync(target) && existsSync(bak)) {
    await fs.rename(bak, target);
  }
  if (!existsSync(target)) throw new Error(`插件 "${pluginId}" 未安装——无旧目录可替换`);
  const stageRoot = path.resolve(downloadTmpDir());
  const stageAbs = path.resolve(stagedDir);
  if (stageAbs !== stageRoot && !stageAbs.startsWith(stageRoot + path.sep)) {
    throw new Error(`暂存目录不在受控 tmp 内（${stagedDir}）——拒绝提交`);
  }
  if (!existsSync(stageAbs)) throw new Error(`暂存目录不存在: ${stagedDir}`);
  if (existsSync(bak)) await fs.rm(bak, { recursive: true, force: true }); // 上轮遗留 .bak 清理（此刻新版必已在位）
  await renameBusyRetry(target, bak); // 旧目录先挪走（本步失败 → 旧版原样未动；busy 耗尽 ⇒ DirBusyError，可延后）
  try {
    await fs.rename(stageAbs, target); // 新版入位
  } catch (e) {
    try { await renameBusyRetry(bak, target); } catch { /* 复原失败——遗留 .bak 由下轮 commit 前清理兜底 */ }
    throw new Error(`替换失败，已恢复旧版: ${e instanceof Error ? e.message : String(e)}`);
  }
  await fs.rm(bak, { recursive: true, force: true }).catch(() => { /* .bak 清理失败非致命 */ });
  let version = "0.0.0";
  try {
    const m = parseManifestJson(await fs.readFile(path.join(target, "plugin.json"), "utf8"));
    if (typeof m?.version === "string") version = m.version;
  } catch { /* 读版本失败 → 0.0.0 占位 */ }
  return { pluginId, version };
}

/** 读暂存目录的清单——不可读/结构不符返回 null（启动补提交据此跳过，交 cleanupStaleDownloads 清理） */
export async function readStagedManifest(stagedDir: string): Promise<{ pluginId?: string; version?: string } | null> {
  try {
    const m = parseManifestJson(await fs.readFile(path.join(stagedDir, "plugin.json"), "utf8"));
    return m && typeof m === "object" ? (m as { pluginId?: string; version?: string }) : null;
  } catch {
    return null;
  }
}

/**
 * 启动补提交：扫 {userData}/tmp 的 `.stage-<id>` 遗留（= 上次「点过更新但 commit 没成」——dev 占用
 * 主场景），**再校验后**逐个提交。返回成功提交的 pluginId 列表（测试可断言）。
 *
 * 再校验三关（⧼阶段目录可能是半截解压/过时残留ⲽ任何一关不过 ⇒ 跳过留给 cleanupStaleDownloads 删，
 * ⛔ 不盲装）：
 *   ① 暂存清单可读且 pluginId 与目录名一致（防伪装/半截）；
 *   ② 目标插件在场（已卸载的暂存无意义）；
 *   ③ 暂存版本 > 已装版本（过时残留不回退——与 stage 时「新版>旧版」同一方向判据）。
 *
 * 🔴 调用位置：`recoverInterruptedUpdates()`（.bak 放回）之后、`ingestPluginBundles()`（三表扫描）
 *    与 `cleanupStaleDownloads()`（会删 .stage-*）**之前**——顺序错了要么扫到旧版、要么暂存被清。
 */
export async function commitPendingStagedUpdates(): Promise<string[]> {
  const tmp = downloadTmpDir();
  let names: string[];
  try {
    names = await fs.readdir(tmp);
  } catch {
    return []; // tmp 尚未创建 = 无遗留
  }
  const committed: string[] = [];
  for (const name of names) {
    if (!name.startsWith(STAGE_PREFIX)) continue;
    const pluginId = name.slice(STAGE_PREFIX.length);
    const stagedDir = path.join(tmp, name);
    const staged = await readStagedManifest(stagedDir);
    if (!staged || staged.pluginId !== pluginId || typeof staged.version !== "string") {
      console.warn(`[plugin-commit] 暂存目录无效（半截/伪装），留给启动清理: ${name}`);
      continue;
    }
    const target = path.join(userPluginsRoot(), pluginId);
    if (!existsSync(target)) {
      console.warn(`[plugin-commit] 目标插件已不在场，暂存作废: ${pluginId}`);
      continue;
    }
    try {
      const m = parseManifestJson(await fs.readFile(path.join(target, "plugin.json"), "utf8"));
      if (typeof m?.version === "string" && compareVersions(staged.version, m.version) <= 0) {
        console.warn(`[plugin-commit] 暂存版本（${staged.version}）不比已装（${m.version}）新，作废: ${pluginId}`);
        continue;
      }
    } catch { /* 已装清单读不动——不作版本拦截，照常提交（stage 时已验过方向） */ }
    try {
      const r = await applyStagedUpdate(pluginId, stagedDir);
      committed.push(pluginId);
      console.warn(`[plugin-commit] 启动补提交完成: ${pluginId} → ${r.version}`);
    } catch (e) {
      // 失败留给 cleanupStaleDownloads 删除、用户重新点更新（启动时仍 busy 理论上少见——杀软扫描窗口）
      console.warn(`[plugin-commit] 启动补提交失败（暂存将被清理，需重新更新）: ${pluginId} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return committed;
}
