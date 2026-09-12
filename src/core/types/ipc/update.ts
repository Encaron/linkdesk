/**
 * 主软件更新 wire 契约——E6#57.4（设计：[06-主软件更新/07-数据流通格式.md](../../../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/07-数据流通格式.md) §三）。
 *
 * 主进程 UpdateService（`electron/services/update-service.ts`）产出、壳渲染 `useUpdateState` 消费——
 * 跨堆协议，按 serial 先例（E5.7#97）归口本目录：`electron/` 与 `src/` 双端 import 同一份类型，
 * 字段改名 tsc 双端报错，不再各写一份。
 *
 * 🔴 **归因不许塌成「未知错误」**（07 §三 / 01 §2.3-§2.4）：`UpdateErrorCode` 逐类列全——
 * 「明明只是私有仓库」报成 `not-found`、「asset 命名漂移」报成 `network` 这类错向归因，
 * 会让用户和排查的人都找不到真因（第 3.5 层教训）。
 */

/** 有可用更新时的全量描述——`UpdateState.available` 起各态携带 */
export interface UpdateInfo {
  /** 新版本（SemVer，无 v 前缀） */
  version: string;
  /** 当前运行版本（`app.getVersion()`——02 §2.3 唯一运行时来源） */
  currentVersion: string;
  /** ISO 发布日期（Release `published_at`） */
  publishedAt: string;
  /** 发行说明页 URL（GitHub release `html_url`） */
  releaseNotesUrl: string;
  /** 安装器直链（`available` 之后才有——检查腿就能拿到，下载才消费） */
  downloadUrl?: string;
  /**
   * 安装包 sha256（64 位小写 hex，**已剥 `sha256:` 前缀**）。
   * 🔴 **源 = Release asset 的 `digest` 字段**（GitHub 服务端自动算）——API 里**没有** `checksum` 字段，
   * 照名字取恒 `undefined` ⇒ 每次都走「未附 ⇒ 降级放行」⇒ 校验静默失效（05-文档与发布/02-发布流水线.md §1.5.1）。
   */
  checksum?: string;
  /** 安装包字节数（Release asset `size`） */
  size?: number;
}

/** 下载进度——`UpdateState.downloading` 携带，节流 ≤500ms 一条（07 §4.2） */
export interface DownloadProgress {
  /** 已下载字节 */
  transferred: number;
  /** 总字节 */
  total: number;
  /** 0-100 整数 */
  percent: number;
}

/**
 * 检查腿六类 + 下载腿五类（01 §2.3 / §2.4）。
 * 文案必须互不相同——「当前已是最新版本」和「tag 不是 SemVer」是两件事，不许各归一半。
 *
 * ⚠️ 暂不单独 `export`：当前唯一消费方是本文件的 `UpdateError.code`，knip 门禁不许空导出。
 * 壳侧要做「错误码 → 文案」映射时（#57.12）取 `UpdateError["code"]`，或届时把它升回具名导出。
 */
type UpdateErrorCode =
  // —— 检查腿（六类） ——
  /** 不可达/超时/代理未生效（本腿必走 main-fetch.ts，E6#76） */
  | 'network'
  /** GitHub 403/429（`x-ratelimit-remaining: 0`）→「稍后自动重试」，不说成网络故障 */
  | 'rate-limited'
  /** 仓库不存在 / 无 Release（404） */
  | 'not-found'
  /** JSON 结构非法 / 缺 `tag_name`/`published_at` */
  | 'invalid-response'
  /** 🔴 Release 到手但匹配不到 asset（命名漂移）——**不许报成 network** */
  | 'asset-missing'
  /** 🔴 `tag_name` 非合法 SemVer——**与「无更新」分开报**，静默忽略会让发布事故隐形 */
  | 'version-unparsable'
  // —— 下载腿（五类） ——
  /** sha256 不符 → 删文件 + 报错 */
  | 'checksum-mismatch'
  /** 🔴 Release 未附校验值 → 记一笔 + 降级放行（不拦更新，01 §2.4） */
  | 'checksum-unavailable'
  /** 落盘失败（磁盘满/无权限） */
  | 'write-error'
  /** 🔴 进程中途退出留下的下载 → 重启后归 `idle + interrupted`，**不复活 `downloading`**（#57.6f） */
  | 'interrupted'
  /** 用户/系统取消 */
  | 'canceled';

/** 一次失败的结构化记账——态内 `lastError`（不抛错，07 §4.1） */
export interface UpdateError {
  code: UpdateErrorCode;
  /** 人类可读（i18n key 形态） */
  message: string;
}

/**
 * 更新状态机判别联合（01 §2.1 九态）。
 *
 * ```
 * uninitialized → disabled（更新源不可用）/ idle
 * idle ──check──▶ checking ──新版本──▶ available（无更新/出错 → idle）
 * available ──download──▶ downloading ──完成──▶ downloaded（失败 → idle + lastError）
 * downloaded ──「稍后」──▶ idle（保留 update，不重下）
 *            └─「重启并更新」──▶ updating ──quitAndInstall──▶ 进程退出
 * ready = downloaded 的提示态（toast「重启并更新」已出）
 * ```
 */
export type UpdateState =
  | { type: 'uninitialized' }
  | { type: 'disabled'; reason: string }
  | { type: 'idle'; update?: UpdateInfo; lastError?: UpdateError }
  | { type: 'checking' }
  | { type: 'available'; update: UpdateInfo }
  | { type: 'downloading'; update: UpdateInfo; progress: DownloadProgress }
  | { type: 'downloaded'; update: UpdateInfo }
  | { type: 'updating'; update: UpdateInfo }
  | { type: 'ready'; update: UpdateInfo };
