/**
 * 安装/更新确认卡——共享件形状（`@linkdesk/ui` 供给；池内确认卡与第三方渲染器共用）。
 *
 * 分工（硬约束 28 共享边界）：
 *   · **共享的是语义与长相**：卡的结构、行类型、分组表头、按钮层级——换一个市场也长这样；
 *   · **私有的是数据与文案**：`plan` 由壳算、`labels` 由壳 t() 解析后随 payload 下发（显示文本铁律）。
 *   ⇒ 本文件只有类型 + 纯函数，**零 i18n、零 IPC、零壳依赖**（R6 门禁直接适用）。
 *
 * 为什么文案走「带占位符的字符串」而不是函数：payload 要过结构化克隆（IPC），⛔ 函数过不去；
 * 占位符用 `{{name}}`，替换由 `format()` 做（唯一实现）。
 */

import type { PluginConfirmPlan, PluginInstallRequest } from "@linkdesk/contracts";

/** 文案包——壳侧 t() 解析后整体下发；`{{x}}` 为占位符 */
export interface PluginInstallConfirmLabels {
  /* ── 单项安装/更新卡 ── */
  installTitle: string; // 安装 {{name}}
  subFirst: string;
  subSourceChanged: string;
  subDowngrade: string;
  subOfficial: string;
  subUpdate: string;
  noteFirst: string;
  noteSourceChanged: string;
  noteDowngrade: string;
  kvPlugin: string;
  kvPublisher: string;
  kvSource: string;
  kvVersion: string;
  kvSize: string;
  kvIntegrity: string;
  kvOldSource: string;
  kvNewSource: string;
  integrityToVerify: string; // sha256 {{hash}} · 下载后校验
  integrityMissing: string;
  warnSourceChanged: string;
  rememberSource: string;
  actionInstall: string;
  actionUpdate: string;
  actionUpdateAnyway: string;
  actionCancel: string;
  unknownPublisher: string;
  unknownSize: string;
  /* ── 批量卡 ── */
  batchTitle: string;
  batchSub: string;
  statTotal: string;
  statAsk: string;
  statSilent: string;
  groupAsk: string; // {{n}} 个需要确认
  groupSilent: string; // {{n}} 个免问
  groupSilentSummary: string; // {{label}} {{n}} 个
  badgeOfficial: string;
  badgeThird: string;
  silentLine: string; // {{summary}}按设置免问，将随本批一起执行。
  silentAction: string; // 改为逐个确认
  rememberOfficial: string;
  batchEmpty: string;
  batchNote: string;
  actionConfirmBatch: string; // 确认更新 {{n}} 个
  actionRunBatch: string; // 直接更新 {{n}} 个
  actionCancelBatch: string;
}

/** 键值行（单项卡的「插件/发布者/来源/版本/大小/完整性」） */
export interface PluginConfirmKvRow {
  k: string;
  v: string;
  /** `warn` = 需要用户注意的变化（新来源/新发布者）；`muted` = 次要信息（插件 id） */
  tone?: "warn" | "muted" | "bold";
}

/** 批量卡里的一行（⛔ 无 checkbox——原型与 spec §5.1 都是「默认全选、取消=整批取消」，
 *  行级排除会让「取消=0 个」的二义性复活） */
export interface PluginConfirmBatchRow {
  pluginId: string;
  name: string;
  /** 副行：发布者 · 大小 */
  sub: string;
  /** 旧版本（缺省 = 只有目标版本可显示；批量更新不逐项带旧版本） */
  from?: string;
  to: string;
  icon?: string;
}

/** 批量卡里的一组（按来源） */
export interface PluginConfirmBatchGroup {
  label: string;
  badge: string;
  badgeTone: "free" | "third";
  countLabel: string;
  rows: PluginConfirmBatchRow[];
}

/** 渲染视图模型——组件只吃它（纯数据，可结构化克隆） */
export interface PluginConfirmVM {
  kind: "install" | "batch";
  title: string;
  sub: string;
  note?: string;
  rows: PluginConfirmKvRow[];
  integrity?: { k: string; text: string; ok: boolean };
  warn?: string;
  remember?: { label: string; checked: boolean };
  stats?: { total: number; ask: number; silent: number; labels: { total: string; ask: string; silent: string } };
  groups?: PluginConfirmBatchGroup[];
  silentLine?: { text: string; action: string };
  emptyText?: string;
  footer: { confirm: string; cancel: string; tone?: "danger" };
}

/** 确认卡弹窗载荷（壳 → 池，结构化克隆） */
export interface PluginConfirmDialogPayload {
  kind: "install" | "batch";
  labels: PluginInstallConfirmLabels;
  plan: PluginConfirmPlan;
  /** 安装卡的当前版本（null/缺省 = 首装） */
  fromVersion?: string | null;
  /** 当前策略快照——批量卡的「以后官方源不再询问」勾选取它做初值（⛔ 渲染体自己去读配置） */
  policy?: { silentOfficial: boolean; silentTrustedSources: boolean };
  /** 本批原始请求——改设置后就地重算要全量（`plan.silent` 是摘要行，装不下下载地址） */
  reqs?: PluginInstallRequest[];
}

/**
 * 宿主内容视图 id —— **唯一登记处**（壳推 dialog 用、池注册表用，两边同一个常量，⛔ 各写一遍字符串）。
 * 第三方整套替换渲染器时换的是「壳推哪个 viewId」；池注册表与默认渲染器不动。
 */
export const PLUGIN_CONFIRM_HOST_VIEWS = {
  install: "plugin-install-confirm",
  batch: "plugin-update-batch",
} as const;

/** 占位符替换——唯一实现（`{{name}}`；变量缺失保留原样，⛔ 不抛） */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
