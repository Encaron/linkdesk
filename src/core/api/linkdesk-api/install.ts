/**
 * 插件安装/更新确认——壳托管确认的契约面（2026-11-24 拍板 D1/D2/D3/D5/D8）。
 * 规格源：docs/04-软件更新/待抉择池/插件安装更新确认-壳托管与批量更新/00-提案.md
 *
 * 为什么单独成文件（E5.8#0d.10 域拆分的同一理由）：types.ts 已被 config/许可/通知/打开方式多域共用，
 * 再加一整块安装确认契约就过 800 行体积门禁；且本域类型只服务「市场提交请求 / 壳出计划」一条线，
 * 与其余域零耦合——拆出后 types.ts 与 install.ts 各自可读、各自可测。
 *
 * 分工铁律：确认判定/token/队列/落盘在壳（⛔ 契约面不暴露 token——市场永不签发、永不看见）；
 *   市场只传结构化请求，渲染体只吃 PluginConfirmPlan，⛔ 不判定谁要确认。
 */
/* ── P1 插件安装/更新确认——壳托管确认的契约面（2026-11-24 拍板 D1/D2/D3/D5/D8）
 * 规格源：docs/04-软件更新/待抉择池/插件安装更新确认-壳托管与批量更新/00-提案.md
 * 分工铁律：确认判定/token/队列/落盘在壳（⛔ 契约面不暴露 token——市场永不签发、永不看见）；
 *   市场只传结构化请求，渲染体只吃 PluginConfirmPlan，⛔ 不判定谁要确认。 ── */

/** 来源身份——壳账本记录并比对（同源判据 = sourceUrl＋repo＋publisher＋pluginId 全同，spec §3.4） */
export interface PluginSourceIdentity {
  /** 市场源 id（`official` = 官方目录） */
  id: string;
  /** 目录源 URL */
  url: string;
  /** GitHub repo（可判定时，`owner/repo`） */
  repo?: string;
  /** 作者/发布者（目录条目声明值） */
  publisher?: string;
}

/** 确认卡可画的展示数据——⛔ 只许结构化纯数据（不接受 HTML/CSS；壳只额外接受一个经对比度校验的 accent，见 spec §3.3） */
export interface PluginInstallDisplay {
  name: string;
  /** 图标声明（iconSource 语义同 plugin.json；壳解析，市场不传路径） */
  icon?: string;
  /** 纯文本简介——壳按卡片宽度截断 */
  description?: string;
  changelogUrl?: string;
  /** 包大小（字节） */
  size?: number;
}

/** 一次安装/更新请求——市场唯一可提交的形状（spec §3.2；`pluginManager.install/update` 不再是远程安装的可用面） */
export interface PluginInstallRequest {
  mode: "install" | "update";
  pluginId: string;
  version: string;
  downloadUrl: string;
  /** P1 起必填（目录已收录的版本）；缺省 = 过渡期「未校验」横幅，不阻断（spec §七 迁移） */
  sha256?: string;
  source: PluginSourceIdentity;
  display: PluginInstallDisplay;
  /** update 模式：显式放行降级（版本下拉选旧版）——仍会走确认（policy 出 `downgrade`） */
  allowOlder?: boolean;
  /** 缺依赖解析目录（同 PluginInstallRequestOpts.catalogUrl 语义）——壳在同一 job 内自动装依赖用。
   *  🔴 市场**必须**带上（旧链靠它做依赖自动安装，漏了 = 依赖装不上、插件 parked）。 */
  catalogUrl?: string;
  /** 目录条目声明的最低壳版本——壳**自己**再判一次（spec §四：不满足直接拦，不进入确认）。
   *  市场照抄目录条目即可；不带 = 不判（旧目录条目没有该字段）。 */
  minAppVersion?: string;
}

/** 需要确认的原因——**封闭集合**；渲染体只按它选文案，⛔ 不自推（两条独立开关见 PluginUpdatePolicy） */
export type PluginConfirmReason =
  | "first-install"
  | "source-changed"
  | "downgrade"
  | "untrusted-source"
  /** 官方同源更新、但用户把 `silentOfficial` 关掉了 ⇒ 仍需一问（不是「未信任」——官方恒信任） */
  | "official-source";

/** 需要确认的一项（壳 policy 算好，渲染体只画） */
export interface PluginConfirmItem {
  request: PluginInstallRequest;
  reason: PluginConfirmReason;
  /** `reason:"source-changed"` 时的旧身份——卡片画「旧 → 新」（spec §3.4） */
  previous?: PluginSourceIdentity;
  /** 旧身份的**显示名**（壳解析 = 与当前来源同一份推导 `sourceLabel`；⛔ 渲染体自己从 identity 推 = 第二推导点） */
  previousLabel?: string;
}

/** 免问项（silent）摘要行——⛔ 不逐项展开成表（spec §5.1：silent 项以「官方 3 个将直接更新」摘要出现） */
export interface PluginConfirmSummaryRow {
  pluginId: string;
  displayName: string;
  version: string;
  sourceId: string;
}

/** 按来源分组——**需要确认的组在前、免问组在后**；组内保持目录顺序（spec §5.1） */
export interface PluginConfirmGroup {
  sourceId: string;
  /** 来源显示名（壳解析 = 单一来源，⛔ 市场拼） */
  label: string;
  /** 该来源在信任清单里（官方 fixed 恒 true） */
  trusted: boolean;
  /** 当前策略下该来源的同源更新**免问**（trusted 且对应开关开 = 真；⛔ 渲染体自己按开关推） */
  silentAllowed: boolean;
  askCount: number;
  silentCount: number;
}

/** 直接拒的项——不弹卡、不入队（spec §四：minApp 不满足直接拦；哈希/id 不符直接拒） */
export interface PluginConfirmRejected {
  pluginId: string;
  reason: "min-app" | "integrity-failed" | "invalid";
  message?: string;
}

/** 确认计划——壳 `policy.ts` 唯一产出；确认卡 / 执行 / 完成通知全读它（⛔ 第二份计划） */
export interface PluginConfirmPlan {
  ask: PluginConfirmItem[];
  silent: PluginConfirmSummaryRow[];
  groups: PluginConfirmGroup[];
  rejected: PluginConfirmRejected[];
  /** 顶栏总览：「共 N 个 · M 个需确认 · K 个免问」（spec §5.2） */
  totals: { total: number; ask: number; silent: number };
}

/** 两条**独立**开关（D5 拍板：正交、可同时开；首装/来源变更/降级不可关，见 spec §3.5） */
export interface PluginUpdatePolicy {
  /** 官方目录的**同源更新**不逐项询问（默认开） */
  silentOfficial: boolean;
  /** 已信任第三方来源的**同源更新**不逐项询问（默认关） */
  silentTrustedSources: boolean;
}

/** 来源信任清单一行——每行**显式状态**（⛔ 让用户猜「点一下是信任还是不信任」，spec §3.5） */
export interface PluginSourceTrustEntry {
  sourceId: string;
  url: string;
  repo?: string;
  publisher?: string;
  trusted: boolean;
  /** 官方固定信任（不可关） */
  fixed?: boolean;
  /** 最近一次见到该来源的时刻（ms） */
  seenAt?: number;
}

/** `requestInstall` 回执——`confirmed:false` ＋ `cancelled:false` = 被拒（`reason` 说原因） */
export interface PluginInstallConfirmResult {
  confirmed: boolean;
  /** 🔴 执行结果（confirmed 只表示「用户同意了」）：false = 已确认但没装成。
   *  市场必须据此报错——实机（2026-11-24）：明文 http 被拒后**一点提示都没有**，就是因为这里被吞了。 */
  ok?: boolean;
  error?: string;
  cancelled?: boolean;
  /** 确认后壳已入队；进度/终态走 `plugin:installJobs` 全量快照 */
  jobId?: string;
  /** `invalid` = 请求本身不成立（同版本重装 / 未放行降级 / 重复请求） */
  reason?: "user-cancelled" | "source-changed" | "integrity-failed" | "min-app" | "no-token" | "up-to-date" | "invalid";
}

/**
 * `prepareInstall` / `prepareUpdateBatch` 的产物——**两步确认的第一跳**（2026-11-24 D1′）。
 * 壳只算计划、⛔ 不弹任何 UI、零副作用；`planId` 短 TTL（5 分钟）且绑定请求指纹。
 * 市场拿 `plan` 自己画卡（可用共享件、可完全自绘）；用户点确认后再调 `commitInstall(planId)`。
 */
export interface PluginInstallPrepared {
  /** 一次性句柄——`commitInstall(planId)` 才签令牌并执行 */
  planId: string;
  /** 壳算出的确认计划（来源/发布者/版本/哈希/风险唯一来源，⛔ 市场不许自造） */
  plan: PluginConfirmPlan;
  /** 句柄到期时刻（ms）——到点后 commit 返回 `expired` */
  expiresAt: number;
}

/** `commitInstall` 回执——`confirmed:true` = 用户已确认且已交执行（成败看 job 表） */
export interface PluginInstallCommitResult {
  confirmed: boolean;
  /** 🔴 **执行结果**（confirmed 只表示"用户同意了"）：false = 已确认但没装成（下载/校验/落盘失败）。
   *  市场必须据此报错，⛔ 不许把 confirmed 当成"装好了"（实机：确认后失败的更新被报成成功）。 */
  ok?: boolean;
  error?: string;
  cancelled?: boolean;
  jobId?: string;
  /** `unknown-plan` = planId 不存在/已用过/已过期（统一一个词，⛔ 不细分） */
  reason?: "unknown-plan" | "rejected" | "user-cancelled" | "no-token";
}

/** `requestUpdateBatch` 回执——`confirmed:false` = **整批取消**（0 个入队，spec §五.4） */
export interface PluginUpdateBatchResult {
  confirmed: boolean;
  cancelled?: boolean;
  /** 确认后 ask ＋ silent 全部入队（按请求顺序）；`batchId` 是壳侧汇总键，**不是 job 表字段** */
  jobIds: string[];
  batchId?: string;
  /** 被直接拒的项（不弹卡、不进 jobIds） */
  rejected?: PluginConfirmRejected[];
}
