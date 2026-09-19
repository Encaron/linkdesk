/**
 * 安装域——`installPlugin` 路由 + 两条腿（包源 / 目录源）+ 包操作句柄 + 落账后的加载收尾。
 * E6#84（第 3.6 层文件整理）feature-folder 拆分：自 `lifecycle-ops.ts` 原样搬出，零行为变更。
 * 依赖方向：install-ops → progress（进度）+ install-queue（job 表）→ resolution/*，无反向——防环。
 */

import i18n from "../../../i18n"; // E5.8#37.9：通知动作标签壳 t() 解析（显示文本铁律——池哑渲染零自产文本）
import type { PluginManifest } from "../../../core/api/types";
import { pushToast } from "../../../core/services/ui/NotificationService";
// E5.8#15.5：getLoadDiagnostics——挂起插件的 pendingReason（list() 数据源合并读取）
import { getLoadDiagnostics } from "../../resolution/loadState";
import {
  linkdesk,
  pluginsApi,
  log,
  errMsg,
  // E6#73j（G6）：住所判据唯一源——市场「可更新」徽标/更新钮据此遮蔽死钮
  setPluginResidence,
} from "../../resolution/state";
import { validateInstallManifest, resolveVersionConflict } from "../../discovery/manifest";
import { loadPlugin, getKnownManifest } from "../../resolution/runtime";
import { parseManifestJson } from "../../jsonc"; // E6#55：作者 plugin.json JSONC——唯一解析入口
// E6#13b/c（段 B）：packageOps 签名引用 PluginUpdateCheckResult——types.ts 契约面
// E6#73q：PluginInstallRequestOpts——安装请求侧身份（pluginId/displayName/origin）
// E6#73c：PluginInstallJobRef——主进程 fs/net 段的进度事件回填 job 身份（jobId 只在壳侧生成）
import type { PluginInstallRequestOpts, PluginInstallResult, PluginInstallJobRef, PluginUpdateCheckResult } from "../../../core/api/linkdesk-api/types";
// E6#73q（18 档 §五 I.2）：壳侧 job 表 + N 槽限流 + FIFO——槽锁下沉到 installPlugin（两条腿共用）
import {
  openInstallJob,
  identifyInstallJob,
  isInstallJobCancelled,
  settleInstallJob,
} from "../install-queue";
import { emitInstallProgress, jobProgress } from "./progress";
import { findDependencyCycle, missingDependencies } from "./dependency-install";

/* ═══════════════════════════════════════════════════════════
   E6#11/#13（1.2-5）：包安装流——url/.linkdesk-plugin 真安装（单一路径，主进程只做 fs/net）
   ═══════════════════════════════════════════════════════════ */

/** 是否包来源（vs 目录）：http(s) 下载源 / .linkdesk-plugin 结尾（磁盘 zip）→ 走包安装流；
 *  其余（既有 SearchView 目录选择等）走 installPluginFromDirectory 零回归复制流。 */
function isPackageSource(source: string): boolean {
  const s = source.trim();
  return /^https?:\/\//i.test(s) || /\.linkdesk-plugin$/i.test(s);
}

/** 包面直答主进程（#13a 主进程真 fs/net 段）——壳 plugins 命名空间独有（download/extract handler 只对壳暴露）。
 *  update 三段（#13b/c：packageUpdateCheck/Stage/Commit）选填随 preload 注入——安装流只要 download/extract，
 *  更新流各自判存在再调（段 B 落法）。 */
export function packageOps(): {
  packageDownload: (url: string, job?: PluginInstallJobRef) => Promise<{ zipPath: string; sizeBytes?: number }>;
  packageExtract: (zipPath: string, expectedPluginId?: string, job?: PluginInstallJobRef) => Promise<{ pluginId: string; version: string; targetDir: string }>;
  packageCancel?: (jobId: string) => Promise<boolean>;
  packageUpdateCheck?: (pluginId: string, catalogUrl: string, currentVersion?: string) => Promise<PluginUpdateCheckResult>;
  packageStageUpdate?: (pluginId: string, source: string, currentVersion?: string, allowOlder?: boolean, job?: PluginInstallJobRef) => Promise<{ pluginId: string; newVersion: string; stagedDir: string }>;
  packageCommitUpdate?: (pluginId: string, stagedDir: string) => Promise<{ pluginId: string; version: string }>;
} {
  const api = pluginsApi();
  if (!api.packageDownload || !api.packageExtract) {
    throw new Error("[pluginLoader] 壳 plugins 面缺少 packageDownload/packageExtract——loader 只能在壳进程运行");
  }
  return {
    packageDownload: api.packageDownload,
    packageExtract: api.packageExtract,
    packageCancel: api.packageCancel,
    packageUpdateCheck: api.packageUpdateCheck,
    packageStageUpdate: api.packageStageUpdate,
    packageCommitUpdate: api.packageCommitUpdate,
  };
}

/**
 * 安装插件（路由入口，E6#11/#13）：目录源 → 既有复制流零回归；url/.linkdesk-plugin 包源 →
 * 主进程 download→extract 落 {userData}/plugins/<id>/（2026-09-05 塌平单根）→ 账本 → loadPlugin → 广播。
 *
 * E6#73q（18 档 §五 I.2）：**全队列唯一入口**——槽锁在本层（不是 installWithProgress 别名上：
 * 目录源走的是 install 这一条腿，只挂别名会漏）。两条腿同一条队列、同一把信号量、同一个数。
 * 同插件已在队列/在跑 → 去重（不建第二行），本调用等它装完返回同一个结果——「点两下」不是两件事。
 */
export async function installPlugin(
  sourcePath: string,
  opts?: PluginInstallRequestOpts,
): Promise<PluginInstallResult> {
  // 开场四步（建 job / 去重等待 / 挂取消钩子 / 抢槽）与更新腿同款——收在 `openInstallJob` 一处，
  // 免得两份拷贝各自漂移。E6#73d 的真中止钩子（面板「取消安装」→ 主进程 AbortController）由本处提供：
  // **只有下载段能被真中止**，其余段（解压/落盘/加载）已是本地不可中断的原子动作——取消它们只是
  // 「不装完」，不能假装停了。钩子按需解析 packageOps（目录源安装不该因为壳 API 缺 download/extract 而在注册时炸）。
  const opened = await openInstallJob(
    { pluginId: opts?.pluginId, displayName: opts?.displayName, origin: opts?.origin },
    (jobId) => {
      try { void packageOps().packageCancel?.(jobId).catch(() => { /* 主进程无在途下载 */ }); } catch { /* 壳面缺 package 段 */ }
    },
  );
  if (opened.kind === "duplicate") {
    return opened.outcome ?? { success: false, error: `插件 "${opts?.pluginId ?? sourcePath}" 正在安装中` };
  }
  if (opened.kind === "busy") {
    // E6#73m K1：同插件正在卸载——去重命中的是**另一类**活儿。等它只会拿到「卸载成功」，
    // 拿它当安装结果报上去 = 用户看到「安装成功」而盘上什么都没有。
    return { success: false, error: i18n.t("该插件正在卸载中") };
  }
  if (opened.kind === "cancelled") {
    // 记录多半已不在表里（排队取消 = 直接出队）；settle 对已消失的 job 是空操作，调它只是兜底防僵尸。
    const cancelled: PluginInstallResult = { success: false, cancelled: true, error: i18n.t("已取消安装") };
    settleInstallJob(opened.jobId, "failed", cancelled);
    return cancelled;
  }
  const { jobId } = opened;

  let result: PluginInstallResult;
  try {
    result = isPackageSource(sourcePath)
      ? await installPackageFromSource(sourcePath, opts, jobId, [], new Set())
      : await installPluginFromDirectory(sourcePath, jobId);
  } catch (e) {
    // 两条流各自 catch（错误文案更具体）；此处是兜底——绝不让 job 停在「在跑」永不出终态
    result = { success: false, error: errMsg(e) };
  }
  // E6#73j：运行中被取消（下载段真中止）时把取消标补进结果——上面那条腿只能从中止推出通用错误，
  // 不补这一笔市场侧就照 `success:false` 走失败分支，对刚刚亲手叫停的用户回敬一条红字 + [重试]。
  // job 记录此刻还在（本函数下方才 settle），故取消标可查。
  if (!result.success && !result.cancelled && isInstallJobCancelled(jobId)) {
    result = { ...result, cancelled: true, error: i18n.t("已取消安装") };
  }
  settleInstallJob(
    jobId,
    !result.success ? "failed" : result.parked ? "parked" : "success",
    result,
  );
  return result;
}

/** 包安装流显式名（#13e 壳面）——同一流水线同一进度广播（installPlugin 已全程 emit stage，等价别名）。 */
export function installWithProgress(
  sourcePath: string,
  opts?: PluginInstallRequestOpts,
): Promise<PluginInstallResult> {
  return installPlugin(sourcePath, opts);
}

/**
 * 安装落账后的加载收尾——loadPlugin("install") 成败两分支 + 进度收尾。
 * 目录源/包源两条安装流共用（duplication 门禁）——重启提示文案差异由调用方喂全文。
 * 失败不 throw：文件已落盘，toast 提示 reload 生效并返回 needRestart（原语义保留，loadPlugin 不决定安装成败）。
 *
 * E6#73h（D2）：**成功分支不再自弹 toast**——成功 toast 由 lifecycle 消费端 3 统一发声（install 族唯一口）。
 * 此前这里「已安装：X v1.0」+ 消费端「已安装：X（即时生效）」= 一次安装两条，用户以为装了两遍。
 */
async function loadInstalledPlugin(
  pluginId: string,
  version: string,
  needRestartMsg: string,
  jobId: string,
): Promise<PluginInstallResult> {
  jobProgress(jobId, "loading", pluginId);
  try {
    await loadPlugin(pluginId, "install");
    // E6#73q（§五 I.6⑦）：终态第三类「已安装但缺依赖」——loadPlugin 走 parkForDependencies 提前返回
    // （不发 onDidInstall），文件真落盘但插件**不可用**。此时**连成功 toast 都没有**（消费端不 fire）
    // ⇒ 结果带 parked 交队列落第三类终态，由 job 行说「已安装但缺依赖」。
    if (getLoadDiagnostics(pluginId).pendingReason) {
      emitInstallProgress("done", pluginId);
      return { success: true, pluginId, version, parked: true };
    }
    emitInstallProgress("done", pluginId);
    return { success: true, pluginId, version };
  } catch {
    pushToast({
      message: needRestartMsg,
      source: pluginId,
      severity: "info",
      ttl: 0,
      actions: [
        { label: i18n.t("立即重启"), isPrimary: true, onClick: () => window.location.reload() },
      ],
    });
    emitInstallProgress("done", pluginId);
    return { success: true, pluginId, version, needRestart: true };
  }
}

/**
 * url / 磁盘 .linkdesk-plugin 包安装流——主进程真 fs/net 段（download→extract）做落盘，
 * 壳只编排：清 tmp 下载包 → bundle 补标 → 账本 add（#12b 市场安装流消费 add 欠账此刻还清）→
 * loadPlugin → notifyManifestChanged（三表重扫）。目标已存在由 extract handler 拒绝（不静默覆盖，
 * 对齐 #30.9d 确认/通知非静默；更新是 #11c 段 B 职责）。
 */
async function installPackageFromSource(
  sourcePath: string,
  opts: PluginInstallRequestOpts | undefined,
  jobId: string,
  ancestors: string[],
  chainInstalled: Set<string>,
): Promise<PluginInstallResult> {
  const source = sourcePath.trim();
  jobProgress(jobId, "validating");
  // E6#73c：主进程 fs/net 段的进度事件随行身份——主进程只知道 jobId（自己按请求透传），
  // pluginId 池侧请求已知时同带（下载段靠它归到具体插件；待解压才知 id 的包流只有 jobId）。
  const jobRef: PluginInstallJobRef = { jobId, pluginId: opts?.pluginId };
  try {
    const ops = packageOps();
    // 1) 包定位：http(s) → 主进程 download 到 {userData}/tmp/<原包名>.<唯一后缀>（E6#73q 并发不撞名）；
    //    磁盘 zip → 原路径直读
    let zipPath: string;
    let downloaded = false;
    if (/^https?:\/\//i.test(source)) {
      jobProgress(jobId, "downloading", opts?.pluginId, "下载插件包");
      const r = await ops.packageDownload(source, jobRef);
      zipPath = r.zipPath;
      downloaded = true;
    } else {
      zipPath = source;
      if (!(await linkdesk().filesystem.exists(zipPath))) {
        throw new Error(`找不到插件安装包: ${zipPath}`);
      }
    }

    // 2) 主进程解压到 {userData}/plugins/<id>/（2026-09-05 塌平单根；zip-slip/pluginId 互验同 boot ingest；已存在拒绝）
    jobProgress(jobId, "extracting", opts?.pluginId, "解压插件包");
    let extracted: { pluginId: string; version: string; targetDir: string };
    try {
      extracted = await ops.packageExtract(zipPath, undefined, jobRef);
    } finally {
      // 下载包落 tmp——解压完（成败皆）清理；磁盘 zip 是用户自有文件，不删
      if (downloaded) {
        try { await linkdesk().filesystem.remove(zipPath); } catch { /* 清理失败非致命 */ }
      }
    }
    const { pluginId, version, targetDir } = extracted;
    const manifest = await readInstallManifest(targetDir);
    const displayName = typeof manifest?.name === "string" && manifest.name.trim() !== "" ? manifest.name : pluginId;
    // E6#73j（G6）：包安装落在 {userData}/plugins/<id> = 用户安装家 ⇒ 此后可被新包更新
    // （不等下次启动重新发现——本会话装完立刻开详情页就该看见更新能力）
    setPluginResidence(pluginId, "userData");

    // E6#73q：真 id 此刻才从包内 manifest 裁决出来——回填 job 身份，池侧行才从「未知」变成真名
    // （调用方传了 pluginId 则此处是同一值的幂等刷新；显示名只有壳读过包才知道）
    // E6#73o：依赖安装与父 job 共用 jobId——身份回填只属于父插件（祖先链非空 = 本调用是依赖腿，不抢父行身份）
    if (ancestors.length === 0) identifyInstallJob(jobId, { pluginId, displayName });

    // E6#73o：依赖链自动装（设计 20 档）——解压后、落账/加载前，缺失依赖内联装进本 job 的槽；
    // 失败回滚**父插件**本次解压产物：否则重试安装撞「目标已存在」拒绝，而它未入账本也无法卸载（死端）。
    // 已装成的依赖保留（对后续安装有用，回滚它反而是破坏）。
    if (opts?.catalogUrl && manifest) {
      try {
        await installMissingDependenciesInline({
          jobId,
          manifest,
          catalogUrl: opts.catalogUrl,
          ancestors: [...ancestors, pluginId],
          chainInstalled,
        });
      } catch (e) {
        try { await linkdesk().filesystem.remove(targetDir); } catch { /* 回滚失败非致命——错误照报 */ }
        throw e;
      }
    }

    // 3) 账本 add（#12b 欠账还清——安装流消费 add；磁盘事实在 user/ 子目录 → 源默认 user；
    //    market UI 未来可传 marketplace）
    try {
      const { add: addLedger } = await import("../../../core/services/PluginInstallService");
      await addLedger(pluginId, version, opts?.ledgerSource ?? "user");
    } catch (e) {
      log.appendLine(`⚠️ 账本写入失败（非致命）: ${errMsg(e)}`);
    }

    // 4) E5.7#48：文件已落盘——通知主进程重扫三表（无论 loadPlugin 是否成功）
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();

    // 5) loadPlugin（安装 reason——onDidInstall 消费端 toast + 图标顺序 + plugin:installed 广播）——收尾块与目录源共用 loadInstalledPlugin
    return loadInstalledPlugin(pluginId, version, i18n.t("已安装：{{name}} v{{version}}。视图刷新后生效。", {
      name: displayName,
      version,
    }), jobId);
  } catch (e) {
    const msg = errMsg(e);
    jobProgress(jobId, "error", undefined, msg);
    return { success: false, error: msg };
  }
}

/** 包内 manifest——读已解压 plugin.json（jsonc 唯一解析入口）；读不到/解析失败返回 null（调用方逐字段兜底）。
 *  E6#73o：原 manifestNameOf 扩成全量读取——显示名与 requires 同一次读出，别为依赖再读第二遍。 */
async function readInstallManifest(targetDir: string): Promise<PluginManifest | null> {
  try {
    const raw = await linkdesk().filesystem.readTextFile(`${targetDir}/plugin.json`);
    return parseManifestJson(raw) as PluginManifest;
  } catch {
    return null;
  }
}

/**
 * 依赖链自动装（E6#73o，设计 20 档 §二）——本层缺失依赖逐个**内联**装进父 job 已持有的槽：
 * 不建第二条 job、不进 FIFO（73q「子包占槽护栏」= 结构，见 dependency-install.ts 头注）。
 * 解析 = `packageUpdateCheck` 打来源目录取最新直链（D3，零新主进程 API）；依赖自己的 requires
 * 递归同路处理（D2，祖先链环守卫给全链文案）；取消沿父 jobId 中止在途依赖下载（D5）；
 * 本链新装的记入 `chainInstalled`——manifestIndex 刷新是异步广播，安装期以本链账本为准防跨层重装。
 */
async function installMissingDependenciesInline(spec: {
  jobId: string;
  manifest: PluginManifest;
  catalogUrl: string;
  /** 祖先链（含调用方自己）——环守卫的栈 */
  ancestors: string[];
  chainInstalled: Set<string>;
}): Promise<void> {
  const deps = missingDependencies(spec.manifest, (id) => getKnownManifest(id) !== undefined, spec.chainInstalled);
  if (deps.length === 0) return;
  const check = packageOps().packageUpdateCheck;
  if (!check) throw new Error(i18n.t("壳面缺 updateCheck——依赖无法解析"));
  for (const [i, dep] of deps.entries()) {
    if (isInstallJobCancelled(spec.jobId)) throw new Error(i18n.t("已取消安装"));
    const cycle = findDependencyCycle(spec.ancestors, dep);
    if (cycle) throw new Error(i18n.t("依赖环：{{chain}}", { chain: cycle }));
    jobProgress(spec.jobId, "validating", dep, i18n.t("正在安装依赖：{{name}}（{{i}}/{{n}}）", { name: dep, i: i + 1, n: deps.length }));
    let url: string;
    try {
      const resolved = await check(dep, spec.catalogUrl);
      if (!resolved.downloadUrl) throw new Error(i18n.t("目录条目缺下载直链"));
      url = resolved.downloadUrl;
    } catch (e) {
      throw new Error(i18n.t("依赖 {{id}} 无法从来源市场解析：{{err}}", { id: dep, err: errMsg(e) }));
    }
    try {
      const r = await installPackageFromSource(
        url,
        { pluginId: dep, displayName: dep, origin: "dependency", ledgerSource: "marketplace", catalogUrl: spec.catalogUrl },
        spec.jobId,
        [...spec.ancestors, dep],
        spec.chainInstalled,
      );
      if (!r.success) throw new Error(r.error ?? i18n.t("未知错误"));
    } catch (e) {
      throw new Error(i18n.t("依赖 {{id}} 安装失败：{{err}}", { id: dep, err: errMsg(e) }));
    }
    spec.chainInstalled.add(dep);
  }
}

/**
 * 安装插件（目录源）：Electron 端复制到 app 插件树 plugins/ → 热加载。
 * 仅对 theme/language 插件即时生效；view 插件提示重启。
 * 2026-09-05 塌平单根：目标 = <appPluginsDir>/<id>（原 plugins/user/<id> 的 user/ 段取消——平铺树直落）。
 *
 * E5.7#81 包装（校验 / 版本处理 / 进度）：
 *   - 校验前置：manifest 先读先验，不合法在复制前失败（原实现只在消毒时 parse——
 *     malformed JSON 会先复制出半装目录再报错）；安装目录名 = manifest.pluginId
 *     （不再用源目录 basename——目录名 ≠ pluginId 是潜伏错位，resolvePath 按 id 找目录）；
 *   - 版本处理：目标已存在时读盘比对版本——同版/旧版拒绝并给出双方版本号，新版提示
 *     先卸载再装（不覆盖：Windows 文件锁，卸载 cp+rm 教训；真升级流程归 E6 PluginUpdateService）；
 *   - 进度事件：plugin:installProgress { stage: validating/copying/loading/done/error } 广播到池
 *     （marketplace 安装按钮实时阶段文案）。
 * E6#13（1.2-5）：保留为目录源内部实现——SearchView 目录安装唯一真调用方零回归；包源走上方路由。
 */
async function installPluginFromDirectory(sourcePath: string, jobId: string): Promise<PluginInstallResult> {
  jobProgress(jobId, "validating");
  try {
    // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口
    const manifestPath = `${sourcePath}/plugin.json`;
    if (!(await linkdesk().filesystem.exists(manifestPath))) {
      throw new Error(`不是有效插件（缺少 plugin.json）`);
    }
    let parsedManifest: unknown;
    try {
      parsedManifest = parseManifestJson(await linkdesk().filesystem.readTextFile(manifestPath));
    } catch (e) {
      throw new Error(`plugin.json 格式错误: ${errMsg(e)}`);
    }
    const sourceDirName = sourcePath.split(/[\\/]/).pop() || sourcePath;
    const { pluginId, version, name } = validateInstallManifest(parsedManifest, sourceDirName);
    // E6#73q：目录源在复制**之前**就知道真名（manifest 已解析）——job 身份此刻落定
    identifyInstallJob(jobId, { pluginId, displayName: name });

    const env = await linkdesk().env.get();
    const destDir = `${env.appPluginsDir}/${pluginId}`; // 2026-09-05 塌平单根（原 appPluginsDir/user/<id>——目录源 dev 安装落 app 树平铺位）

    // E5.7#81 版本处理：目标已存在 → 读盘比对（未安装则跳过）
    let installed: { version: string | null } | null = null;
    if (await linkdesk().filesystem.exists(destDir)) {
      installed = { version: null };
      try {
        const iv = parseManifestJson(await linkdesk().filesystem.readTextFile(`${destDir}/plugin.json`));
        if (typeof iv?.version === "string") installed = { version: iv.version };
      } catch { /* 读不到版本信息 → 保守拒绝（见 resolveVersionConflict null 分支） */ }
      const conflict = resolveVersionConflict(installed, version);
      if (conflict) throw new Error(`${name}: ${conflict}`);
    }

    jobProgress(jobId, "copying", pluginId);
    await linkdesk().filesystem.copy(sourcePath, destDir);
    // 消毒 manifest——目录源（dev 树安装）强制 distribution=user, core=false（E6#18a：core:true 无行为特权，
    // 只剩 UI 藏钮语义——目录/开发安装不冒充发货件；随车 zip 走包安装流真传 core，见 plugin.json 声明）
    const destManifest = `${destDir}/plugin.json`;
    const raw = await linkdesk().filesystem.readTextFile(destManifest);
    // E6#55：JSONC 读入；distribution 是遗留字段（schema 契约外）——局部宽口视图承接，非 PluginManifest 契约面
    const manifest = parseManifestJson(raw) as PluginManifest & { distribution?: string };
    if (manifest.distribution !== "user" || manifest.core === true) {
      manifest.distribution = "user";
      manifest.core = false;
      await linkdesk().filesystem.writeTextFile(destManifest, JSON.stringify(manifest, null, 2));
    }

    // E6#73j（G6）：目录源安装落在 **app 只读根**（上方 destDir = appPluginsDir）——不是用户安装家，
    // 更新流对它必然抛「不在用户安装区」。此处显式记「不可更新」，让市场详情页别画一个点下去必失败的死钮。
    setPluginResidence(pluginId, "app");

    // E5.7#48：文件已落盘——通知主进程重扫三表（无论下方 loadPlugin 是否成功）
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();

    // E5 归一化：loadPlugin 统一处理 glob 内/外——不再分支判断；加载收尾块与包源共用 loadInstalledPlugin
    // E5.8#24.8.7：原「npm run build:plugins」指向空跑死脚本（build-plugins.mjs E6 前不运行）——
    // 改指准确主构建命令 npm run build（E6#15f 后主 vite.config 不再为插件打 dist/plugins 命名 chunk，
    // 插件产物由各自独立 build 产出；此提示仅为「壳侧源码树安装需重跑构建才生效」语义保留）
    return loadInstalledPlugin(pluginId, version, i18n.t("已安装：{{name}} v{{version}}。运行 npm run build 后生效。", {
      name,
      version,
    }), jobId);
  } catch (e) {
    const msg = errMsg(e);
    jobProgress(jobId, "error", undefined, msg);
    return { success: false, error: msg };
  }
}
