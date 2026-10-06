/**
 * 插件兼容读数——状态算法**单点**（`E6#117` · 第 8.4 轮）。
 *
 * 全仓只许这一处算兼容状态（判据②：grep 五个 `state` 值只有本文件 ＋ 单测命中）；
 * 市场插件（格 5）只调 `window.linkdesk.plugins.getCompatibility` 画读数，⛔ 复算。
 *
 * ── 🔴 用户面五词与读数的固定对应（唯一真相源 = 00 号档 §〇d；本表逐字照抄，⛔ 改词）──
 * | `state`（机器值）    | 用户面词     | 判据（读数驱动，不靠人打标）                                 |
 * |---------------------|-------------|-------------------------------------------------------------|
 * | `incompatible`      | **不适配**   | `minAppSatisfied === false`（既有硬机制的读出，本模块不拦人） |
 * | `unknown`           | **—**       | 关键输入缺失（未装 / 未跑尺子 / 悬空读数拿不到）⇒ ⛔ 不判坏消息 |
 * | `drifted`           | **部分不适配** | 悬空 > 0（插件还在喊宿主已经没有的名字）                     |
 * | `current`           | **正常**     | 悬空 0 ＋ `minAppVersion` 满足 ＋ 插件最后发版日 ≥ 当前壳构建日 |
 * | `compatible`        | **兼容**     | 悬空 0 ＋ `minAppVersion` 满足 ＋（发版日 < 壳构建日 **或** 任一日期缺失） |
 *
 * ── 🔴 时间口径（用户定稿，写死）──
 * **两个真日期比大小，没有阈值**：`lastUpdate`（插件最后发版日，catalog `publishedAt`）
 * vs `shellBuiltAt`（当前壳构建日，`product.json` 的 `date`）都归一化成 `YYYY-MM-DD` 后
 * 字符串比大小。⛔ 版本号不是时间轴（版本是攒着发的）；⛔ 没有「超过 N 天」这类发明判据；
 * ⛔ 阈值不许做成配置项。日期缺失（dev 壳日期 `'—'` / 侧载无 catalog / 离线）⇒ 落 `compatible`
 * （保守且是真话——它确实还能跑），**不落** `unknown`。
 */

import { versionGte } from "../utils/plugin/semverUtils.js";
import type { PluginCompatibilityReading, PluginCompatibilityRequest } from "../api/linkdesk-api/types.js";
import { scanInstalledPluginDir } from "./dangling-scan.js";
import { UI_SURFACE_LEDGER } from "./ui-surface.generated.js";

/** 主进程环境（注入——本模块不 import electron，单测可桩） */
export interface CompatHostContext {
  shellVersion: string;
  /** `product.json` 的 `date` 原文（dev 占位 `'—'` 由本模块归一化成 `null`） */
  shellBuiltAtRaw: string;
  /** 已装插件目录的定位（盘上没有 ⇒ null） */
  locatePluginDir: (pluginId: string) => string | null;
  /** 悬空扫描（默认 = 运行时真扫描腿；单测注入桩）。`uiImports` 是 G4 实际地板的输入（可省 = 旧桩形状） */
  scanDangling?: (dir: string) => { dangling: { name: string }[]; uiImports?: string[] } | null;
}

/** 任意日期原文 → `YYYY-MM-DD`（取日期段；解析不出 ⇒ null。⛔ 不引入时区换算——日期口径只取日） */
export function normalizeDay(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/* ── G4（「插件最低壳版本门禁」）：实际地板——输入构造的一部分，⛔ 五态映射与日期口径不在此 ──
 *
 * 已装产物对 `@linkdesk/ui` 的静态具名导入名（悬空扫描同一次顺带产出，见 dangling-scan.ts）
 * 在账本（`ui-surface.generated.ts`，scripts/ui-surface.json 的第四份投影）里查 `since`，
 * 取 max ＝ **实际地板**；生效地板 = max(声明, 实际)。
 *
 * 🔴 账本查不到的名字 = 本壳 vendor ui **没有这个导出** ⇒ 链接期必炸（本事故的形状）⇒
 *    **fail-closed 按不满足**（与 G2 构建期门禁同口径；漏报比误报贵）——诊断记 `uiImport:notInLedger:<名>`。
 * 🔴 产物读不到 / 没消费 ui ⇒ 退化成「只有声明地板」，⛔ 不判坏消息（照兼容读数既有的诚实纪律）。
 */

/** 账本查 since（四栏一个面——插件可导入组件 / hooks / helpers 任一运行时导出） */
const UI_LEDGER_SINCE: ReadonlyMap<string, string> = new Map(
  (["components", "hooks", "helpers", "types"] as const).flatMap((cat) =>
    Object.entries(UI_SURFACE_LEDGER[cat]).map(([name, entry]) => [name, entry.since] as const),
  ),
);

interface UiActualFloor {
  /** 实际地板（所有查到名字的 since 最大值） */
  floor: string | null;
  /** 账本查不到的名字（⇒ 按不满足） */
  notInLedger: string[];
}

/** 产物 ui 具名导入 → 实际地板。无清单 / 空清单 ⇒ null（没有实际地板可加） */
function actualUiFloor(uiImports: readonly string[] | undefined): UiActualFloor | null {
  if (!uiImports || uiImports.length === 0) return null;
  const notInLedger: string[] = [];
  let floor: string | null = null;
  for (const name of uiImports) {
    const since = UI_LEDGER_SINCE.get(name);
    if (!since) {
      notInLedger.push(name);
      continue;
    }
    if (floor === null || versionGte(since, floor)) floor = since;
  }
  return { floor, notInLedger };
}

/**
 * 算一只插件的兼容读数（判据②的唯一算点）。
 * 顺序即优先级：`incompatible`（硬机制读出）→ `unknown`（缺数据 ≠ 有问题，**先于** drifted）
 * → `drifted` → `current` → `compatible`（兜底，含任一日期缺失）。
 */
export function computeCompatibilityReading(req: PluginCompatibilityRequest, ctx: CompatHostContext): PluginCompatibilityReading {
  const unknown: string[] = [];
  const pluginId = req.pluginId;

  // ① minAppVersion：调用方传入的**声明值**（handler 对已装插件用磁盘 manifest 覆盖——
  //    那是加载器执法的那份；未装插件才吃调用方从 catalog 供给的）。
  //    ⛔ 它只是地板的「声明」半边——②′ 会用产物扫描出的实际地板抬它（只抬不降）。
  const declaredMinAppVersion = typeof req.minAppVersion === "string" && req.minAppVersion.trim() ? req.minAppVersion.trim() : null;
  let minAppVersion = declaredMinAppVersion;
  let minAppSatisfied = minAppVersion
    ? versionGte(ctx.shellVersion, minAppVersion)
    : null;

  // ② 悬空读数：只对**已装**插件算（目录定位不到 ⇒ null，不猜）
  const dir = ctx.locatePluginDir(pluginId);
  const scanned = dir ? (ctx.scanDangling ?? scanInstalledPluginDir)(dir) : null;
  const dangling = scanned ? { count: scanned.dangling.length, names: scanned.dangling.map((d) => d.name) } : null;
  // unknown[] 是**机器码诊断面**（消费方 = 维护者日志；⛔ 不是用户面文案——用户面词归市场插件 i18n）
  if (!dangling) unknown.push(dir ? "dangling:scan-failed" : "dangling:uninstalled");

  // ②′ 实际地板（G4）：生效地板 = max(声明, 实际)。产物读不到（scanned null）/ 没消费 ui ⇒
  //     什么都不加（退化成只有声明地板，不判坏消息）；查不到的名字 ⇒ fail-closed 按不满足。
  const uiFloor = actualUiFloor(scanned?.uiImports);
  if (uiFloor) {
    if (uiFloor.notInLedger.length > 0) {
      minAppSatisfied = false;
      for (const name of uiFloor.notInLedger) unknown.push(`uiImport:notInLedger:${name}`);
    } else if (uiFloor.floor && (!minAppVersion || versionGte(uiFloor.floor, minAppVersion))) {
      minAppVersion = uiFloor.floor; // 只抬不降：实际 ≤ 声明时维持声明（负控 3）
      minAppSatisfied = versionGte(ctx.shellVersion, minAppVersion);
    }
  }

  // ③ 两个真日期（归一化为 YYYY-MM-DD 后比大小——⛔ 没有阈值）
  const lastUpdate = normalizeDay(req.publishedAt);
  const shellBuiltAt = normalizeDay(ctx.shellBuiltAtRaw);
  if (!lastUpdate) unknown.push("lastUpdate:missing");
  if (!shellBuiltAt) unknown.push("shellBuiltAt:missing");

  // ④ 状态（顺序 = 优先级；判据表见文件头）
  let state: PluginCompatibilityReading["state"];
  if (minAppSatisfied === false) {
    state = "incompatible";
  } else if (dangling === null) {
    state = "unknown"; // 负控 2：缺数据不许当 drifted
  } else if (dangling.count > 0) {
    state = "drifted";
  } else if (lastUpdate !== null && shellBuiltAt !== null && lastUpdate >= shellBuiltAt) {
    state = "current";
  } else {
    state = "compatible"; // 含任一日期缺失（保守且是真话）
  }

  return {
    pluginId,
    state,
    dangling,
    minAppVersion,
    shellVersion: ctx.shellVersion,
    minAppSatisfied,
    lastUpdate,
    shellBuiltAt,
    unknown,
  };
}
