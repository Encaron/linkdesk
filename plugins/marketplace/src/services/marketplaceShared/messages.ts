/**
 * messages — 市场**码 → i18n key** 的单一映射处（失败归因 + 阶段文案）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * 本文件是纯函数 + 常量表，**零内部依赖**（叶子）——任何子模块都可 import。
 * 拆出的理由：它是「引擎抛的自由文本 → 用户看得懂的一句话」这一件事的**全部**，
 * 与安装流程 / toast 通道 / 目录 store 都不相干。
 */

/** #30.9b 失败归因——七种失败全览收敛成五类可重试归因 + conflict（09 §二 表）
 *  E6#73e：+ `http4xx` / `http5xx`（HTTP 状态码族单列，见下方字典注释） */
export type InstallFailReason =
  | "network" | "integrity" | "env" | "package" | "conflict"
  | "http4xx" | "http5xx"
  | "unknown";

/* ═══ #30.9b 失败归因纯函数——主进程错误原文是中文/英文混杂自由文本（installWithProgress settle
 * 契约无 reason 枚举——11-API §一·一 的 reason 字段是设计虚构，实机双证），按子串字典收敛成类别。
 * 字典匹配顺序重要：完整性（checksum/size）窄，环境（磁盘），包损坏，冲突。
 * E6#73e（机器二）：**HTTP 状态码优先于网络桶**，且裸 `HTTP` 已从 NET_RE 摘掉——此前一条 `HTTP`
 *   子串吃掉所有 404/403/500，下载链接失效被报成「网络连接不可用」，用户于是反复查网络反复重试
 *   （真相 = 那个地址已经没了，而重试的其实是另一个插件）。分组判据 = 「可重试 / 需人工」：
 *   5xx（含 408/429）服务端瞬时状态 → 可重试；4xx → 确定性拒绝，重试无用。 */
const HTTP_STATUS_RE = /HTTP[ /]?(\d{3})/i;
const NET_RE = /下载中断|下载失败|下载超时|超时|网络|fetch|ECONN|ENOTFOUND|ENETUNREACH|socket|net::|Failed to fetch|Network Error/i;
const INT_RE = /checksum|校验|哈希|digest|sha|大小不符|文件大小|Content-Length/i;
const ENV_RE = /磁盘|空间不足|ENOSPC|EACCES|EPERM|权限|quota/i;
const PKG_RE = /解压|zip|不是有效|invalid|plugin\.json|ENOENT|无法读取|损坏|corrupt/i;
const CON_RE = /已存在安装目录|已存在|请先卸载|覆盖/i;

export function classifyInstallError(msg: string | undefined): InstallFailReason {
  if (!msg) return "unknown";
  if (CON_RE.test(msg)) return "conflict";
  const http = HTTP_STATUS_RE.exec(msg);
  if (http) {
    const code = Number(http[1]);
    if (code >= 400 && code < 500) return "http4xx";
    if (code >= 500) return "http5xx";
  }
  if (NET_RE.test(msg)) return "network";
  if (INT_RE.test(msg)) return "integrity";
  if (ENV_RE.test(msg)) return "env";
  if (PKG_RE.test(msg)) return "package";
  return "unknown";
}

/** 归因 → i18n key（= 中文原文，硬约束 2）；UI 层 t(key) 取当前语言译文 */
export function installFailLabelKey(reason: InstallFailReason): string {
  switch (reason) {
    case "network":
      return "安装失败：网络连接不可用";
    case "integrity":
      return "安装失败：文件校验未通过";
    case "env":
      return "安装失败：磁盘空间不足";
    case "package":
      return "安装失败：插件包损坏";
    case "conflict":
      return "安装失败：该插件已安装，如需覆盖请先卸载";
    case "http4xx":
      return "安装失败：下载地址无效或已被服务器拒绝";
    case "http5xx":
      return "安装失败：服务器暂时不可用，请稍后重试";
    default:
      // E6#73e：撤「未知错误」谎——认不出时真因由 failText 直显引擎原文（同 E6#71b 更新域先例）
      return "安装失败，请重试";
  }
}

/** 归因 → 更新失败 i18n key（E6#33b——与安装同分类语义；conflict 分支 E6#71b 补上——CON_RE 触发词
 *  已存在/覆盖/请先卸载在更新域罕见但非不可能，防御性给句不落 unknown）。E6#71b：default 撤「未知错误」谎
 *  → 通用重试语（真因由 updateFailText 原文直显，不靠归类猜）。 */
export function updateFailLabelKey(reason: InstallFailReason): string {
  switch (reason) {
    case "network":
      return "更新失败：网络连接不可用";
    case "integrity":
      return "更新失败：文件校验未通过";
    case "env":
      return "更新失败：磁盘空间不足";
    case "package":
      return "更新失败：插件包损坏";
    case "conflict":
      return "更新失败：该插件已安装，如需覆盖请先卸载";
    case "http4xx":
      return "更新失败：下载地址无效或已被服务器拒绝";
    case "http5xx":
      return "更新失败：服务器暂时不可用，请稍后重试";
    default:
      return "更新失败，请重试";
  }
}

/** 失败终局文案的**组合规则**（E6#73e 机器二：参数化抽出，安装/更新两域共用**同一份**实现）。
 *  归因可认 → 归因短语（t 译当前语言）；认不出（unknown）→ **引擎原文直显**（引擎报错本就是完整可读句
 *  ——「不在用户安装区」「无需更新」「未找到安装目录」…——原文比「未知错误」诚实，且免误导归类：
 *  安装域五个类目词对更新域状态/策略错不成立，硬塞会让「不在用户安装区」显示成「插件包损坏」）；
 *  原文为空 → 兜底通用重试语。
 *  `labelKeyFn` 由域决定（安装域 `installFailLabelKey` / 更新域 `updateFailLabelKey`）——**不得再落第二份同构拷贝**。 */
export function failText(
  t: (key: string) => string,
  labelKeyFn: (reason: InstallFailReason) => string,
  reason: InstallFailReason,
  raw?: string,
): string {
  if (reason !== "unknown") return t(labelKeyFn(reason));
  const s = (raw ?? "").trim();
  return s ? s : t(labelKeyFn("unknown"));
}

/** E6#71b：更新失败终局文案——`failText` 的更新域薄包装（零自有逻辑） */
export function updateFailText(t: (key: string) => string, reason: InstallFailReason, raw?: string): string {
  return failText(t, updateFailLabelKey, reason, raw);
}

/** 阶段 → job 行进度标签（i18n key + 插值）——详情按钮与探索行共用单实现（归一化）。
 *
 *  E6#73j（G1）：更新流进了同一张 job 表，它自己的阶段码（checking/staging/committing）此前落进
 *  兜底「安装中...」——用户点的是「更新到 v1.4」，行上写「安装中」是另一件事的名字。补齐三档。 */
export function marketInstallStageLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  stage: string | undefined,
  percent: number | undefined,
): string {
  if (stage === "validating") return t("校验中...");
  if (stage === "downloading") return percent != null ? t("下载中 {{percent}}%", { percent }) : t("下载中...");
  if (stage === "extracting") return t("解压中...");
  if (stage === "loading") return t("加载中...");
  // 更新域（E6#73j）
  if (stage === "checking") return t("检查更新中...");
  if (stage === "staging") return percent != null ? t("下载中 {{percent}}%", { percent }) : t("准备新版...");
  if (stage === "committing") return t("替换旧版...");
  // 卸载域（E6#73m K1）——不落到「安装中...」，那是把活说反了
  if (stage === "uninstalling") return t("卸载中...");
  return t("安装中...");
}
