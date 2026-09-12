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
 * 检查腿六类 + 下载腿五类 + 启动复位一类（01 §2.3 / §2.4 / §2.5）。
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
  /**
   * 🔴 传输中断——两种子情形共用一个码：① 进程中途退出留下的下载 → 重启后归 `idle + interrupted`，
   * **不复活 `downloading`**（#57.6f）；② 本次下载**收了一半就断**（已收 < Content-Length，#57.6a）。
   * 两者的用户语义与处置完全相同（这次没下成，重下），拆两码只会让壳多写一条一模一样的文案。
   * ⚠️ 与 `network` 的分界：**连接阶段**就连不上 / 挂死超时 = `network`；**已经在下、半路断** = 本码。
   */
  | 'interrupted'
  /** 用户/系统取消 */
  | 'canceled'
  // —— 启动复位（一类，非腿产出） ——
  /**
   * 🔴 上次更新**没装成，且安装器已不在盘上**（启动复位 #57.7a 算出，`update-install.ts` 的
   * `resolveStartupInstall`）——落 `idle + 本码`，`update` 保留。
   *
   * **为什么不复用 `interrupted`**（2026-09-12 拆码，超本格顺手修）：两者在腿内确实同义（都是
   * 「这次没下成，重下」），但**壳侧的处置不同**——本码是**启动时从盘上读回来的**，没有任何发起方，
   * 于是「谁发起谁出声」那条路（`checkForUpdatesAndReport`）根本走不到它 ⇒ 换成 `interrupted`
   * 时用户**下次启动零通知**（#57.12 实测：`initUpdateService` 丢弃 `resolution.outcome`，
   * 而生产者对 `idle` 一律闭嘴）。壳的迁移驱动那条路**只认本码**才出声（`useUpdateNotifications`），
   * 于是「下载腿的断流」与「启动时的未完成」在机器上可分辨，不再靠「`update` 在不在」这种
   * 会随实现漂移的间接不变式。
   */
  | 'install-interrupted';

/** 一次失败的结构化记账——态内 `lastError`（不抛错，07 §4.1） */
export interface UpdateError {
  code: UpdateErrorCode;
  /**
   * 人类可读 = **i18n key 形态**（= 中文原文，硬约束 2）。
   *
   * 🔴 **带运行时数值的句子必须写成词条 + `{{占位}}`，值走 `params`**——直接拼进 `message`
   * （`下载超时——30 秒无数据`）会让整句**永远不可能成为词条**（一个字都不一样），`t()` 只能
   * 原样吐出中文原文 ⇒ 那类句子在所有语言下都是中文（2026-09-12 修，超本格顺手修）。
   * 分界线：**句子骨架（可翻译）进 `message`，只进不出的运行时值（秒数/字节数/系统错误原文）
   * 进 `params`**。插值语法与壳侧 `t()` 一致（i18next 的 `{{name}}`）。
   */
  message: string;
  /**
   * 词条占位符的实值（`{ seconds: 30 }` 对应词条里的 `{{seconds}}`）。
   * 值**本身不再翻译**——系统错误原文（`msg(e)`）与 HTTP 状态文本天然无语言，故当**不透明值**传。
   * 缺省（不传）= 该词条没有占位符，壳侧照旧 `t(message)`。
   */
  params?: Record<string, string | number>;
}

/**
 * 更新状态机判别联合（01 §2.1 九态）。
 *
 * ```
 * uninitialized → disabled（更新源不可用）/ idle
 * idle ──check──▶ checking ──新版本──▶ available（无更新/出错 → idle）
 * available ──download──▶ downloading ──完成──▶ downloaded（失败 → idle + lastError）
 * downloaded ──「重启并更新」──▶ updating ──quitAndInstall──▶ 进程退出
 * ready = downloaded 的提示态（toast「重启并更新」已出）
 * ```
 *
 * 🔴 **`downloaded` 没有「回 idle」的边**（E6#57.12，2026-09-12 用户拍板；本文档旧版图里的
 * `downloaded ──「稍后」──▶ idle` 是**错的**，已删）。通知面上的「稍后」**只收起那一条提示**，
 * 状态原地不动——安装器已经在盘上等着装了，把态降回 `idle` 只会让用户重下一遍。
 * 两个出口：`updating`（点「重启并更新」），或进程退出后由启动复位还原（#57.7a）。
 * 由此推出 #57.12g（已在 `electron/services/update-service.ts` 落地）：这两个态**免疫检查**——
 * 检查腿比的是 `latest > current`，已下好的版本必然还大于当前版本 ⇒ 一查必判 `available`，
 * 界面就从「重新启动」退回「下载更新」。
 *
 * 🔴 **`downloaded`/`ready` 带 `warning` 槽（2026-09-12 用户拍板 ⇒ 选 (a)「给状态加 warning 槽」）**：
 * 降级放行（`checksum-unavailable` 等「照常安装、但要记一笔」的情形）**必须落在这个槽里**。
 * 此前只有一个 `idle.lastError` 槽，而**降级放行时状态走的是 `downloaded`** ⇒ 照旧类型实现这笔账
 * 必然被无声丢掉（发布侧永远看不见自己漏附了校验值，拍板想要的效果归零；同属
 * [[snapshot-shadows-truth-bug-class]] ④「只有一次机会 + 失败不出声」）。
 *
 * ⚠️ `warning` ≠ `lastError` 的复本：**`lastError` = 这次没成**（回 `idle`，有出口等用户重试）；
 * **`warning` = 成了，但有一件发布侧该知道的事**（态照常往下走）。所以它只出现在「成功那条路」上，
 * 且**跨态传递**：`downloaded.warning` →（壳出提示时）→ `ready.warning`。
 */
export type UpdateState =
  | { type: 'uninitialized' }
  | { type: 'disabled'; reason: string }
  | { type: 'idle'; update?: UpdateInfo; lastError?: UpdateError }
  | { type: 'checking' }
  | { type: 'available'; update: UpdateInfo }
  | { type: 'downloading'; update: UpdateInfo; progress: DownloadProgress }
  /** `warning` = 降级放行的记账（如 `checksum-unavailable`）——见上方 🔴，不是失败 */
  | { type: 'downloaded'; update: UpdateInfo; warning?: UpdateError }
  | { type: 'updating'; update: UpdateInfo }
  /** `downloaded` 的提示态——`warning` 由 `downloaded` 传递而来（消费者是壳，#57.9/#57.12） */
  | { type: 'ready'; update: UpdateInfo; warning?: UpdateError };
