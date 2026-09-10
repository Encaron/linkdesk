/**
 * installGate —— E6#71k 安装/更新确认门。**2026-09-10 用户拍板修订：一律弹卡。**
 *
 * 规则只有一条：**市场里每次安装、每次更新都弹确认卡**——官方目录不豁免，第三方来源不记忆。
 * 前身 `installTrust.ts`（信任表 `marketplace.trustedSources` + 台账 `marketplace.installedFrom`
 * + 「官方预信任 / 同 id 换来源强制重问 / http 不可记忆」判序表 + 市场源弹窗里的撤销列表）**整套删除**
 * ——没有「记住谁被信任过」这件事，就没有「记错」这件事。用户原话：「暂时都问吧……关于这个点不能被
 * 卡住，所以就是先多问吧」；真安全机制用户已排给未来版本专门研究。
 *
 * 调用方（全市场唯四入口，全部走本模块，禁各自判）：
 *   ① 详情页「安装」  DetailView.handleInstallClick      → mode "install"
 *   ② 详情页「更新」  DetailView.doVersionAction        → mode "update"
 *   ③ 侧栏目录行「安装」ExploreView.handleInstall        → mode "install"
 *   ④ 失败 [重试]     retryMarketInstall（详情页钮 / 侧栏钮 / 命令面板 三入口共用本函数单点）
 *
 * **🔴 诚实边界（原 §五 J.3，一字未改）：本模块不是安全机制，且只在市场 UI 层成立。**
 * `linkdesk.pluginManager.install` / `installWithProgress` 是**任何插件都能调的壳 API**，主进程零信任判定
 * ——已装插件可绕开本门从任意网址静默装。全仓零签名、零 checksum 校验。⇒ 文档与 UI 文案**不得宣称
 * 「更安全」**，只能说「每次安装都让你看一眼来源」。
 *
 * 取舍（2026-09-10 用户已知悉并拍板接受）：后台自动更新**不能弹卡**（用户不在场），故自动更新整体暂停
 * ——未确认的候选一律跳过并告知；见 updateDiscovery.applyEngineAutoUpdate。这是「都问」的直接代价。
 *
 * 两个旧配置键（`marketplace.trustedSources` / `marketplace.installedFrom`）在已升级用户磁盘上可能
 * 仍有残留值，但**全仓已零读取方**（configuration 面只有 get/set/getSchema/onChange，无 delete，
 * 不做清理尝试）——视为惰性孤儿，不得复活。
 */

import i18n from "i18next";
import type { CatalogEntry } from "./marketCatalog";
import { loadCatalog } from "./marketSources";
import { installConfirmPayload, type ConfirmMode } from "./installConfirmPayload";

const lk = () => window.linkdesk;

/**
 * 弹确认卡——**恒弹**（无任何前置判定）。返回 true = 用户点了确认，放行安装/更新。
 *
 * - `entry` 可得且壳有 `confirmContent` 面 → 市场自画的富内容卡（E6#71c 壳 DialogHost content 槽）。
 * - `entry` 不可得（条目已下架 / 离线读不到目录）→ **回落壳纯文字 confirm，仍然要问**（不静默放行）。
 * - 对话框面整个缺失（老 preload）→ 返回 false：**不能问就不装**（保守方向；老设计「读不到当已信任」
 *   才是静默安装漏洞，此处取反向）。
 */
export async function confirmMarketInstall(
  entry: CatalogEntry | undefined,
  mode: ConfirmMode,
  installVer?: string,
  /** entry 缺席时的兜底显示名（重试路径按 pluginId 查不到目录条目时传入） */
  fallbackName?: string,
): Promise<boolean> {
  const dlg = lk()?.dialog;
  if (!dlg) return false;
  const confirmContent = dlg.confirmContent;
  if (entry && confirmContent) {
    // title/message 是**视图寻址失败**时壳回落纯文字确认的兜底文案；正常路径由 ConfirmInstall 自绘
    const ok = await confirmContent({
      title: i18n.t(mode === "update" ? "确认更新" : "确认安装"),
      message: i18n.t("确认前请查看来源与发布者。"),
      pluginId: "marketplace",
      viewId: "marketplace-install-confirm",
      payload: installConfirmPayload(entry, mode, installVer),
    });
    return ok === true;
  }
  if (!dlg.confirm) return false;
  const name = fallbackName ?? entry?.name ?? "";
  return (
    (await dlg.confirm(
      i18n.t(mode === "update" ? "确认更新「{{name}}」？" : "确认安装「{{name}}」？", { name }),
    )) === true
  );
}

/**
 * 按 pluginId 走确认门——**重试路径专用**（`marketplace.retryInstall` 命令与两处行内 [重试] 钮共用）。
 * 重试的入参只有 pluginId + downloadUrl（settle 构造的 toast actions），来源信息不在手上
 * ——故现查目录条目；查不到（离线/条目下架）→ 富内容卡画不出，回落纯文字 confirm 仍然要问。
 */
export async function confirmMarketInstallById(
  pluginId: string,
  fallbackName?: string,
): Promise<boolean> {
  const entry = await findCatalogEntry(pluginId);
  return confirmMarketInstall(entry, "install", undefined, fallbackName ?? pluginId);
}

/** 目录里按 id 找条目——读不到（IPC 不可用/离线/加载抛错）→ undefined（调用方据此回落纯文字确认） */
async function findCatalogEntry(pluginId: string): Promise<CatalogEntry | undefined> {
  try {
    const cat = await loadCatalog();
    return cat.entries.find((e) => e.id === pluginId);
  } catch {
    return undefined;
  }
}
