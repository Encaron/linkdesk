/**
 * plugin-install-handlers——E6#11/#13（1.2-5）：装卸更主进程真 fs/net 段。
 *
 * 架构定案（#13a 折叠）：install/uninstall 无主进程独立入口——loader（loadPlugin/unloadPlugin）
 * 宿主在壳 renderer（IpcBridge plugins:call → IpcBridgeHandler → _pluginAPI = lifecycle-ops），
 * 主进程无 loader。主进程只做「真网络 + 真磁盘」里 renderer 做不了/不该做的：
 *   - plugins:download  —— fetch 包 → {userData}/tmp/<原包名>（下载逻辑 = E6#31a plugin-download 服务：
 *                         `.part` 半截标记写完 rename 正式包，保留原名——pluginId 无 manifest 字段时
 *                         回退 zip 基名裁决，改名会破坏裁决；见 bundle-zip deriveBundlePluginId）
 *   - plugins:extract   —— 共享 bundle-zip 语义解压 → {userData}/plugins/<id>/（zip-slip/wrapper/
 *                         pluginId 双源互验同 boot ingest）；目标已存在拒绝（更新走 update-* 段 B）
 *   - plugins:update-check / stage-update / commit-update —— 段 B（#13b/c，已落地）：fetch catalog 版本
 *                         对比 + tmp 暂存新版 + 原子 rename 替换（失败旧版保留，05 §二·六）；见本函数尾部
 *
 * 进度（#13d）：主进程 download/extract 段逐阶段经 IpcBridge.broadcast（storeForReplay=false，
 * file-handlers.ts 惯例——流数据不入 lastBroadcasts）发既有 plugin:installProgress 通道，与壳
 * lifecycle 同通道同形状并流——消费方（marketplace SearchView/未来 installWithProgress 调用方）只认
 * 一个通道。禁 ipcMain.on + sender.send（E5.8#6.5 广播归一）。
 *
 * 日志（#13g）：全部走 loggedHandle（invoke-log.ts）——channel + args 摘要 + 耗时 + 错误堆栈落
 * protocol-debug.log（console.error 进不了该文件）。
 *
 * 铁律 19/20：自持 _registered once-guard（壳崩重建复用——IPC 通道只注册一次），无 ipcRenderer/on。
 */

import { app } from "electron";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";
import { IPC } from "../channels.js";
import { IpcBridge } from "../ipc-bridge.js";
import { loggedHandle } from "../invoke-log.js";
import { deriveBundlePluginId, extractZip, isSafePluginId, openPluginZip } from "../../plugins/bundle-zip.js";
// E6#31a：真网络段下载 = plugin-download 服务（.part 生命周期单复本——handler 只引用，不重写 fetch/进度）
// E6#73q：下载落盘名带唯一化后缀（并发 N=3 防同名互截）——zipBase 裁决前先剥后缀拿回原包名
import { downloadPackage, downloadTmpDir, stripDownloadUniq } from "../../services/plugin-download.js";
import type { PluginManifest } from "../../../src/core/api/types.js";
// E6#13b/c（段B）：主进程与壳共用同一 semver 比较源（单复本——全仓唯一 compareVersions）+ 同一 jsonc 解析源
// E6#33c（锚①）：updateTargetDirection——更新目标版本方向判定单复本（upgrade/downgrade/same，降级放行语义）
import { compareVersions, updateTargetDirection } from "../../../src/core/utils/plugin/semverUtils.js";
import { parseManifestJson } from "../../../src/pluginLoader/jsonc.js";

let _registered = false;

/** 用户安装代码根——{userData}/plugins（2026-09-05 塌平单根：直接含插件目录，解压目标 = <root>/<id>） */
function userPluginsRoot(): string {
  return path.join(app.getPath("userData"), "plugins");
}

/** 进度广播——#13d：主进程段经 IpcBridge.active 发既有 plugin:installProgress（同壳 lifecycle 通道同形状） */
function emitProgress(stage: string, payload: { pluginId?: string; message?: string; percent?: number } = {}): void {
  try {
    IpcBridge.active?.broadcast("plugin:installProgress", { stage, ...payload }, "shell", false);
  } catch {
    /* 广播失败不阻断安装 */
  }
}

/** 是否 http(s) 下载源（install 流路由前置） */
function isHttpSource(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

/** 解压后包内 pluginId 裁决——manifest.pluginId ?? zip 基名（bundle-zip 双源互验同款；zip 保留原名已由 download 保证） */
function deriveIdFromZip(zipBase: string, manifest: PluginManifest): string {
  const id = deriveBundlePluginId(manifest as unknown as Record<string, unknown>, zipBase);
  if (!id || !isSafePluginId(id)) {
    throw new Error(`包内 pluginId 非法（${id ?? "空"}）——拒绝落盘`);
  }
  return id;
}

/** 真网络段下载（download 与 update stage 两 handler 共用）——E6#31a：fetch/进度 = plugin-download 服务单复本，
 *  本层只把服务 onProgress 回调映射到 #13d install-progress 广播（handler 引用服务，不重写下载逻辑）。 */
async function downloadWithProgress(url: string): Promise<{ zipPath: string; total: number }> {
  return downloadPackage(url, (message, percent) =>
    emitProgress("downloading", percent === undefined ? { message } : { message, percent }),
  );
}

/**
 * 注册装卸更主进程 handler——main.ts createWindow 显式调用（幂等 once-guard）。
 * 全部走 loggedHandle（#13g）。download/extract 段 A 即用；update-* 段 B（#13b/c）追加于本函数。
 */
export function registerPluginInstallHandlers(): void {
  if (_registered) return;
  _registered = true;

  // ── plugins:download(url) → { zipPath, sizeBytes } ──
  // 真网络段：fetch 包 → {userData}/tmp/<原包名>。流式写盘 + Content-Length 可得时推 percent。
  // 下载逻辑 = plugin-download 服务单复本——update stage（段 B）同段复用（下载非 update 专属，无单复本）。
  loggedHandle(IPC.plugins.download, async (_event, url: string) => {
    if (typeof url !== "string" || !isHttpSource(url)) {
      throw new Error("仅支持 http(s) 下载源（.linkdesk-plugin 包 URL）");
    }
    const { zipPath, total } = await downloadWithProgress(url);
    return { zipPath, sizeBytes: total || undefined };
  });

  // ── plugins:extract(zipPath, expectedPluginId?) → { pluginId, version, targetDir } ──
  // 真磁盘段：共享 bundle-zip 语义解压到 {userData}/plugins/<id>/（2026-09-05 塌平单根）；纯新建契约（目标已存在拒绝——
  // 更新/覆盖走 update 流或先卸）；包内 id 与 expectedPluginId 不符拒绝（防伪装）。
  loggedHandle(IPC.plugins.extract, async (_event, zipPath: string, expectedPluginId?: string) => {
    if (typeof zipPath !== "string" || !zipPath) throw new Error("缺少包路径");
    emitProgress("extracting", { message: "开始解压" });
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(zipPath);
    } catch (e) {
      throw new Error(`无法读取包文件 ${zipPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const opened = await openPluginZip(buffer);
    if (!opened) {
      throw new Error("不是有效的 .linkdesk-plugin 包——顶层需含可解析的 plugin.json");
    }
    const { manifest, wrapperPrefix } = opened;
    // E6#73q：先剥下载唯一化后缀（非本服务产出的名字原样）——zipBase 必须是**原包名**，改名破坏裁决
    const zipBase = stripDownloadUniq(path.basename(zipPath).replace(/\.linkdesk-plugin$/i, ""));
    const pluginId = deriveIdFromZip(zipBase, manifest);
    if (expectedPluginId && expectedPluginId !== pluginId) {
      throw new Error(`包内 pluginId 与预期不符（${pluginId} ≠ ${expectedPluginId}）——拒绝解压`);
    }
    const target = path.join(userPluginsRoot(), pluginId); // 2026-09-05 塌平单根（原 userPluginsRoot()/user/<id>）
    if (existsSync(target)) {
      // E6#12 幂等语义：不静默覆盖（对齐 #30.9d 确认/通知非静默）；同/异版本均报——先卸或走更新流
      throw new Error(`插件 "${pluginId}" 已存在安装目录——如需覆盖请先卸载，版本升级请走更新流程`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const ok = await extractZip(opened.zip, target, wrapperPrefix);
    if (!ok) {
      // zip-slip 命中——已拒绝危险条目，但 target 可能半落盘：整体清理（本包作废，防半装目录残留）
      await fs.rm(target, { recursive: true, force: true });
      throw new Error(`包内含非法条目（zip-slip）——已拒绝并清理`);
    }
    emitProgress("extracting", { pluginId, message: `解压完成 ${pluginId}@${manifest.version}` });
    return { pluginId, version: manifest.version, targetDir: target };
  });

  // ── 段 B（#13b/c）：plugins:update-check / stage-update / commit-update ──
  // update 三 handler 合并本文件（同一 _registered 生命周期）。分工（05 §二·六 原子切换）：
  //   check  —— 真网络：fetch marketplace.json → 版本对比（主进程不碰账本——current 由壳传入，壳是账本 owner）
  //   stage  —— 下载 + 解压到 {userData}/tmp/.stage-<id>（不碰旧目录）→ id 一致 + 新版 > 旧版校验
  //   commit —— 原子 rename 替换（target→.bak→staged→target→rm .bak，失败复原旧版）——同卷原子
  // 壳 updatePlugin 只编排：check → stage → unloadPlugin（同一机械路径）→ commit → loadPlugin（#11c）。

  // ── plugins:update-check(pluginId, catalogUrl, currentVersion) → { current, latestVersion, downloadUrl, update } ──
  // 只做 fetch + 比对；catalog 形状对齐 05 §四（versions[] 每条 { version, downloadUrl, publishedAt?, changelog? }）——
  // 选最大版本；prerelease（"-" 尾段）默认忽略（§二·四）。
  loggedHandle(IPC.plugins.updateCheck, async (_event, pluginId: string, catalogUrl: string, currentVersion?: string) => {
    if (typeof pluginId !== "string" || !pluginId) throw new Error("缺少 pluginId");
    if (typeof catalogUrl !== "string" || !isHttpSource(catalogUrl)) throw new Error("catalog 需为 http(s) URL");
    const cur = typeof currentVersion === "string" && currentVersion ? currentVersion : "0.0.0";
    const resp = await fetch(catalogUrl, { redirect: "follow" });
    if (!resp.ok) throw new Error(`读取市场目录失败 HTTP ${resp.status}`);
    const catalog = await resp.json().catch(() => null) as { plugins?: Array<{ id: string; versions?: Array<{ version?: string; downloadUrl?: string }> }> } | null;
    const entry = catalog?.plugins?.find((p) => p.id === pluginId);
    if (!entry) throw new Error(`市场目录中无插件 "${pluginId}"`);
    const versions = (entry.versions ?? []).filter((v) => typeof v?.version === "string" && !v.version.includes("-"));
    if (versions.length === 0) throw new Error(`插件 "${pluginId}" 无正式版可更新`);
    const latest = versions.reduce((a, b) => (compareVersions(a.version!, b.version!) > 0 ? a : b));
    const latestVersion = latest.version!;
    const update = compareVersions(latestVersion, cur) > 0;
    emitProgress("checking", { pluginId, message: update ? `发现新版 ${pluginId}@${latestVersion}` : `${pluginId} 已是最新` });
    return { current: cur, latestVersion, downloadUrl: latest.downloadUrl, update };
  });

  // ── plugins:stage-update(pluginId, source, currentVersion?, allowOlder?) → { pluginId, newVersion, stagedDir } ──
  // 下载（url）/直读（磁盘 zip）→ 解压到 {userData}/tmp/.stage-<id>。校验：包内 id 与 pluginId 一致（防伪装）
  // + 版本方向（E6#33c 降级放行 锚①）：默认拒绝 旧/同于当前（更新语义不降级）；allowOlder 显式 true 才放行
  //   严格更低的降级（版本下拉选旧版 + F2 确认后由 UI 传），同版恒拒（无版本变化的重装非更新流职责）；不碰旧目录（commit 才替换）。
  loggedHandle(IPC.plugins.stageUpdate, async (_event, pluginId: string, source: string, currentVersion?: string, allowOlder?: boolean) => {
    if (typeof pluginId !== "string" || !pluginId) throw new Error("缺少 pluginId");
    if (typeof source !== "string" || !source) throw new Error("缺少更新包源（url 或磁盘 zip）");
    emitProgress("staging", { pluginId, message: `准备新版 ${pluginId}` });
    let zipPath: string;
    let downloaded = false;
    if (isHttpSource(source)) {
      const r = await downloadWithProgress(source);
      zipPath = r.zipPath;
      downloaded = true;
    } else {
      zipPath = source;
      if (!existsSync(zipPath)) throw new Error(`找不到更新包: ${zipPath}`);
    }
    try {
      const buffer = await fs.readFile(zipPath);
      const opened = await openPluginZip(buffer);
      if (!opened) throw new Error("不是有效的 .linkdesk-plugin 包——顶层需含可解析的 plugin.json");
      const { manifest, wrapperPrefix } = opened;
      // E6#73q：同 extract——剥下载唯一化后缀后再裁决（url 腿带后缀，磁盘直读腿原样透传）
      const zipBase = stripDownloadUniq(path.basename(zipPath).replace(/\.linkdesk-plugin$/i, ""));
      const id = deriveIdFromZip(zipBase, manifest);
      if (id !== pluginId) throw new Error(`包内 pluginId 与待更新插件不符（${id} ≠ ${pluginId}）——拒绝暂存`);
      const cur = typeof currentVersion === "string" && currentVersion ? currentVersion : "0.0.0";
      // E6#33c 降级放行（锚①）——方向判定单复本 updateTargetDirection（semverUtils）；
      // allowOlder:true（版本下拉选旧版 + F2 确认）才放行 downgrade；same 恒拒（无版本变化的重装非更新流职责）。
      const dir = updateTargetDirection(manifest.version, cur);
      if (dir === "same" || (dir === "downgrade" && allowOlder !== true)) {
        throw new Error(
          dir === "same"
            ? `包内版本与当前版本相同 ${cur}——无需更新`
            : `新版本需高于当前版本 ${cur}（包内 ${manifest.version}）——降级需在版本下拉显式选择旧版`,
        );
      }
      const stageDir = path.join(downloadTmpDir(), `.stage-${pluginId}`);
      if (existsSync(stageDir)) await fs.rm(stageDir, { recursive: true, force: true });
      await fs.mkdir(stageDir, { recursive: true });
      const ok = await extractZip(opened.zip, stageDir, wrapperPrefix);
      if (!ok) {
        await fs.rm(stageDir, { recursive: true, force: true });
        throw new Error(`包内含非法条目（zip-slip）——已拒绝暂存`);
      }
      emitProgress("staging", { pluginId, message: `新版就绪 ${pluginId}@${manifest.version}` });
      return { pluginId, newVersion: manifest.version, stagedDir: stageDir };
    } finally {
      // 网络下载包落 tmp——stage 完（成败皆）清理；磁盘 zip 是用户自有文件，不删
      if (downloaded) {
        try { await fs.rm(zipPath, { force: true }); } catch { /* 清理失败非致命 */ }
      }
    }
  });

  // ── plugins:commit-update(pluginId, stagedDir) → { pluginId, version } ──
  // 原子替换（05 §二·六）：target → .bak → staged 入位 → rm .bak。rename 中途失败 → .bak 复原（失败旧版保留）。
  // 两个 rename 同卷（tmp 与 plugins 同在 {userData}）→ 原子。stagedDir 必须落本进程 tmp 内（防任意路径替换）。
  loggedHandle(IPC.plugins.commitUpdate, async (_event, pluginId: string, stagedDir: string) => {
    if (typeof pluginId !== "string" || !pluginId) throw new Error("缺少 pluginId");
    if (typeof stagedDir !== "string" || !stagedDir) throw new Error("缺少暂存目录");
    const target = path.join(userPluginsRoot(), pluginId); // 2026-09-05 塌平单根
    if (!existsSync(target)) throw new Error(`插件 "${pluginId}" 未安装——无旧目录可替换`);
    const stageRoot = path.resolve(downloadTmpDir());
    const stageAbs = path.resolve(stagedDir);
    if (stageAbs !== stageRoot && !stageAbs.startsWith(stageRoot + path.sep)) {
      throw new Error(`暂存目录不在受控 tmp 内（${stagedDir}）——拒绝提交`);
    }
    if (!existsSync(stageAbs)) throw new Error(`暂存目录不存在: ${stagedDir}`);
    const bak = `${target}.bak`;
    if (existsSync(bak)) await fs.rm(bak, { recursive: true, force: true }); // 上轮遗留 .bak 清理
    emitProgress("committing", { pluginId, message: `替换旧版 ${pluginId}` });
    await fs.rename(target, bak); // 旧目录先挪走（本步失败 → 旧版原样未动）
    try {
      await fs.rename(stageAbs, target); // 新版入位
    } catch (e) {
      try { await fs.rename(bak, target); } catch { /* 复原失败——遗留 .bak 由下轮 commit 前清理兜底 */ }
      throw new Error(`替换失败，已恢复旧版: ${e instanceof Error ? e.message : String(e)}`);
    }
    await fs.rm(bak, { recursive: true, force: true }).catch(() => { /* .bak 清理失败非致命 */ });
    let version = "0.0.0";
    try {
      const m = parseManifestJson(await fs.readFile(path.join(target, "plugin.json"), "utf8"));
      if (typeof m?.version === "string") version = m.version;
    } catch { /* 读版本失败 → 0.0.0 占位 */ }
    emitProgress("committing", { pluginId, message: `已替换 ${pluginId}@${version}` });
    return { pluginId, version };
  });
}
