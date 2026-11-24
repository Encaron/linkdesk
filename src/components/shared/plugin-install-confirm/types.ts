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

/* 🔴 2026-11-25（D8′ 市场自绘）：文案包与可渲染载荷**归契约**——壳默认卡与市场自绘卡吃同一份。
 * 分别定义两份 = 迟早漂移（一处加了行、另一处没有）。此处只做 re-export，⛔ 不再本地定义。 */
export type { PluginInstallConfirmLabels, PluginConfirmViewPayload } from "@linkdesk/contracts";
/** 兼容别名：本包既有消费方（壳 renderer / 池注册表）仍按旧名取 */
export type { PluginConfirmViewPayload as PluginConfirmDialogPayload } from "@linkdesk/contracts";

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
  /** AI 发起的行徽标文案（`labels.originAI`）；缺省 = 用户发起，不画徽标 */
  ai?: string;
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
  /** 发起方（AI 发起的安装）——壳下发的 `requestedBy==="ai"` 才有；⛔ 渲染体不自己猜 */
  aiNote?: { title: string; hint: string; body: string; more: string; less: string };
  remember?: { label: string; checked: boolean };
  stats?: { total: number; ask: number; silent: number; labels: { total: string; ask: string; silent: string } };
  groups?: PluginConfirmBatchGroup[];
  silentLine?: { text: string; action: string };
  emptyText?: string;
  footer: { confirm: string; cancel: string; tone?: "danger" };
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
