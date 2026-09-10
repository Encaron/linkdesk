/**
 * buildNotif 单测——E6#72c（进度透传）+ #72d（autoOpen 重要通知自动展开）。
 *
 * 被测面：壳侧通知序列化（toast 存储 → NotifLayout DTO）。纯函数 + 一个模块级未读集。
 * 桩数据一律虚构（硬约束 21：fixture 禁用真实插件名/真实 UI 文案）——`demo-plugin` / `演示消息`。
 * 存储隔离：toast 存储是模块单例，每个用例前后清空（ttl:0 避免 setTimeout 挂住 suite）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TFunction } from "i18next";
import { buildNotif, _seenIds, markAllSeen, pruneSeen } from "./notif";
import { pushToast, dismissToast, getToasts, setNotifPanelOpen, TOAST_SOURCE_CAP } from "../../core/services/ui/toast";
import { APP_PLUGIN_ID } from "../../core/services/plugins/PluginStateService";

/**
 * E6#73d：安装 job 表的桩——壳侧 job 表与通知序列化同处一个渲染进程，`buildNotif` 直接函数调用读它。
 * 桩掉模块而不是驱动真队列：真队列有并发槽位/看门狗/落盘，测「三段怎么排」不需要那一整套。
 * `vi.hoisted` 是必需的——`vi.mock` 的工厂被提升到文件顶部，普通 const 那时还没初始化。
 */
const { mockJobs } = vi.hoisted(() => ({ mockJobs: [] as Array<Record<string, unknown>> }));
vi.mock("../../pluginLoader/lifecycle/install-queue", () => ({
  listInstallJobs: () => mockJobs,
}));

/**
 * E6#73g（S5）：来源名解析的数据源——壳侧已装插件 manifest 索引。
 * 桩掉模块而非驱动真发现流程：本条要测的是「组标题 / 来源行有没有去查显示名、查不到怎么回落」，
 * 不是发现管线本身（那是别处的覆盖面）。桩全集为空 = 每个用例自己往里放。
 */
const { mockManifests } = vi.hoisted(() => ({
  mockManifests: new Map<string, { name?: string }>(),
}));
vi.mock("../../pluginLoader/resolution/state", () => ({
  getManifestById: (id: string) => mockManifests.get(id),
}));

/** job 桩行——只填被测代码真读的字段（硬约束 21：虚构 id/名，不指向真实插件） */
function job(over: Record<string, unknown>): Record<string, unknown> {
  return {
    jobId: "job-demo-1", pluginId: "demo-plugin", origin: "user", displayName: "演示插件",
    state: "running", ...over,
  };
}

/** i18n 桩——key 原样返回 + 做 {{x}} 插值（断言只看 DTO 结构/参数带没带对，不看译文；真实译文归 i18n 审计） */
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? key.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(opts[k] ?? "")) : key) as unknown as TFunction;

function clearStore(): void {
  for (const n of getToasts()) dismissToast(n.id);
  _seenIds.clear();
  mockManifests.clear();
  setNotifPanelOpen(false);
}

beforeEach(clearStore);
afterEach(clearStore);

describe("buildNotif——进度字段透传（E6#72c）", () => {
  it("progress:true 无 percent → DTO 带 progress、不带 percent（不定态）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, ttl: 0 });
    const item = buildNotif(t).groups[0].items[0];
    expect(item.progress).toBe(true);
    expect(item.percent).toBeUndefined();
  });

  it("progress:true + percent:42 → DTO 两个字段都带（确定态）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, percent: 42, ttl: 0 });
    const item = buildNotif(t).groups[0].items[0];
    expect(item.progress).toBe(true);
    expect(item.percent).toBe(42);
  });

  it("percent:0 边界——不被当成 falsy 丢掉", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, percent: 0, ttl: 0 });
    expect(buildNotif(t).groups[0].items[0].percent).toBe(0);
  });

  it("非进度通知 → DTO 不带 progress/percent（形状零变化）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0 });
    const item = buildNotif(t).groups[0].items[0];
    expect(item.progress).toBeUndefined();
    expect(item.percent).toBeUndefined();
  });

  it("进度图标换 sync + spin 类", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", progress: true, ttl: 0 });
    expect(buildNotif(t).groups[0].items[0].iconClass).toBe("codicon codicon-sync notif-icon-spin");
  });

  // E6#73f：原「作者显式给 icon → 尊重作者」用例已删——`notifications.show` 契约里根本没有
  // icon 形参（只有 type/progress/persistent/actions），壳 handler 也从不填 ⇒ 那条分支恒假。
  // 图标类的完整对照（error/warning/info 三档）见下。
  it("非进度通知按 severity 定图标（error/warning/info 三档）", () => {
    pushToast({ message: "演示消息 甲", source: "demo-plugin", severity: "error", ttl: 0 });
    pushToast({ message: "演示消息 乙", source: "demo-plugin", severity: "warning", ttl: 0 });
    pushToast({ message: "演示消息 丙", source: "demo-plugin", severity: "info", ttl: 0 });
    // 按消息取图标——不依赖组内时间排序（同毫秒时间戳下顺序不稳）
    const byMsg = new Map(buildNotif(t).groups[0].items.map((i) => [i.message, i.iconClass]));
    expect(byMsg.get("演示消息 甲")).toBe("codicon codicon-error notif-severity-error");
    expect(byMsg.get("演示消息 乙")).toBe("codicon codicon-warning notif-severity-warning");
    expect(byMsg.get("演示消息 丙")).toBe("codicon codicon-info");
  });
});

describe("buildNotif——折叠汇总（E6#73f S3/A6）", () => {
  it("本组有折叠 → DTO 带壳侧解析好的 foldedLabel（面板哑渲染，不再无声消失）", () => {
    for (let i = 0; i < TOAST_SOURCE_CAP + 3; i++) {
      pushToast({ message: `演示消息 ${i}`, source: "demo-plugin", persistent: true, ttl: 0 });
    }
    expect(buildNotif(t).groups[0].foldedLabel).toBe("本组另有 3 条较早的已折叠");
  });

  it("没折叠过 → 不带 foldedLabel 字段（形状零变化，不渲染汇总行）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0 });
    expect(buildNotif(t).groups[0].foldedLabel).toBeUndefined();
  });

  it("折叠计数归到本组——别的来源不受影响", () => {
    pushToast({ message: "演示消息 别的来源", source: "demo-other", ttl: 0 });
    for (let i = 0; i < TOAST_SOURCE_CAP + 1; i++) {
      pushToast({ message: `演示消息 ${i}`, source: "demo-plugin", persistent: true, ttl: 0 });
    }
    const groups = new Map(buildNotif(t).groups.map((g) => [g.key, g]));
    expect(groups.get("demo-plugin")?.foldedLabel).toBe("本组另有 1 条较早的已折叠");
    expect(groups.get("demo-other")?.foldedLabel).toBeUndefined();
  });
});

/**
 * E6#73b：判据从「重要」（`isImportantNotif`）换成**唤醒白名单**（`Toast.wake`）。
 * 这里既要验「该弹的弹」，也要把「不该弹的」钉成反向测试——它们是 R5-4/R5-6 的机械保证。
 */
describe("buildNotif——autoOpen 唤醒白名单（E6#73b，18 档 §五 B）", () => {
  it("无通知 → autoOpen false", () => {
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it.each([
    ["普通 info", { severity: "info" as const }],
    // 🔴 反向：进度增量永不唤醒（R5-6「从 10% 到 50% 这个间断期间他不叫新状态」）
    ["进度", { progress: true }],
    // 🔴 反向：内存墙 / 主题数据坏 / 工作区丢文件夹 / 孤儿依赖**全是 warning 级**（§五 B 明确不唤醒）
    ["警告", { severity: "warning" as const }],
    ["长驻", { persistent: true }],
  ])("不该弹（%s）未读 → autoOpen false", (_label, extra) => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0, ...extra });
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it.each([
    ["失败（缺省 error 级）", { severity: "error" as const }],
    ["带动作按钮（缺省）", { actions: [{ label: "演示动作", onClick: () => {} }] }],
    ["job 终态显式置位", { severity: "info" as const, wake: true }],
  ])("该弹（%s）未读 → autoOpen true", (_label, extra) => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0, ...extra });
    expect(buildNotif(t).autoOpen).toBe(true);
  });

  it("显式 wake:false 压过缺省——error 级也能被生产者按住", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", wake: false, ttl: 0 });
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it("该弹但已读（面板开过一次）→ autoOpen false", () => {
    const id = pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", ttl: 0 });
    _seenIds.add(id);
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it("该弹未读但面板已开 → autoOpen false（不二次打扰正在看的人）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", ttl: 0 });
    setNotifPanelOpen(true);
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  it("面板打开即时标已读 → autoOpen 回落到 false（关掉后不会被同一条弹回来）", () => {
    const id = pushToast({ message: "演示消息", source: "demo-plugin", severity: "error", ttl: 0 });
    expect(buildNotif(t).autoOpen).toBe(true);
    // 模拟壳侧 notif:panel(true) 处理：置镜像 + 全量标已读（useSubscriptions 同款）
    setNotifPanelOpen(true);
    _seenIds.add(id);
    expect(buildNotif(t).autoOpen).toBe(false);
  });

  /**
   * 🔴 「最小化」不带静音权力（18 档 §五 A 第 4 行 + §五 B 计数表 + R5-4/R5-5）。
   * minimized 与 idle 在壳侧镜像里**同值**（useSubscriptions：`state === "open"` 一个派生位），
   * 所以此处只需断言「面板收着 + 该弹的新条目 → 唤醒」——这正是最小化后终态能冒出来的原因。
   * ⚠️ 反过来说：**本表达式不得出现 `!isNotifMinimized()`**——加了就等于终态唤不回。
   */
  it("面板收着（含最小化）时新到的该弹条目 → autoOpen true（R5-5「出结果必冒出来」）", () => {
    setNotifPanelOpen(false); // = 最小化在壳侧镜像里的取值（同一派生位）
    pushToast({ message: "演示消息 装完了", source: "demo-plugin", severity: "info", wake: true, ttl: 0 });
    expect(buildNotif(t).autoOpen).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   E6#73d：面板三段式（进行中 → 等待安装中 → 已有结果）+ job 行投影
   ═══════════════════════════════════════════════════════════════════════════ */

describe("buildNotif——安装 job 两段（E6#73d）", () => {
  beforeEach(() => { mockJobs.length = 0; });
  afterEach(() => { mockJobs.length = 0; });

  it("进行中 + 等待中 → 两段按固定序（running 在 queued 前），头部摘要合并两个数", () => {
    mockJobs.push(
      job({ jobId: "job-a", stage: "downloading", percent: 62 }),
      job({ jobId: "job-b", stage: "extracting" }),
      job({ jobId: "job-c", state: "queued" }),
    );
    const n = buildNotif(t);
    expect(n.sections?.map((s) => s.key)).toEqual(["running", "queued"]);
    expect(n.sections?.[0].label).toBe("2 项进行中");
    expect(n.sections?.[1].label).toBe("另有 1 项等待安装中");
    expect(n.summaryLabel).toBe("2 项进行中 · 另有 1 项等待安装中");
  });

  it("行投影：进行中带真百分比 → 状态短语「下载中 62%」+ percent 透传 + 可取消", () => {
    mockJobs.push(job({ jobId: "job-a", stage: "downloading", percent: 62 }));
    const row = buildNotif(t).sections![0].items[0];
    // 行 key 用 jobId，名字用 displayName（同名不同插件要能区分——§七 73d 行）
    expect(row.id).toBe("job-a");
    expect(row.name).toBe("演示插件");
    expect(row.statusLabel).toBe("下载中 62%");
    expect(row.percent).toBe(62);
    expect(row.iconClass).toBe("codicon codicon-sync notif-icon-spin");
    expect(row.cancellable).toBe(true);
    expect(row.cancelLabel).toBe("取消安装");
  });

  it("进行中无百分比 → 「下载中...」，且不带 percent（不定态，别拿 0 冒充真值）", () => {
    mockJobs.push(job({ jobId: "job-a", stage: "downloading" }));
    const row = buildNotif(t).sections![0].items[0];
    expect(row.statusLabel).toBe("下载中...");
    expect(row.percent).toBeUndefined();
  });

  it("排队行：无进度条、状态短语「等待安装中」、字形弱一档（○）", () => {
    mockJobs.push(job({ jobId: "job-a", state: "queued" }));
    const row = buildNotif(t).sections![0].items[0];
    expect(row.statusLabel).toBe("等待安装中");
    expect(row.percent).toBeUndefined();
    expect(row.iconClass).toBe("codicon codicon-circle-outline");
  });

  it("非安装阶段码 → 落「安装中...」兜底（状态短语只由阶段码派生，不读 job.message 原文）", () => {
    mockJobs.push(job({ jobId: "job-a", stage: "copying" }));
    expect(buildNotif(t).sections![0].items[0].statusLabel).toBe("复制中...");
    mockJobs.length = 0;
    mockJobs.push(job({ jobId: "job-b", stage: "某个未登记阶段", message: "开发者原文不许上屏" }));
    expect(buildNotif(t).sections![0].items[0].statusLabel).toBe("安装中...");
  });

  it("行 = 一次用户动作：origin:'dependency' 的 job 不占行（依赖腿随 73o 挂父行下）", () => {
    mockJobs.push(job({ jobId: "job-a" }), job({ jobId: "job-dep", origin: "dependency" }));
    const n = buildNotif(t);
    expect(n.sections?.[0].label).toBe("1 项进行中");
    expect(n.sections?.[0].items.map((r) => r.id)).toEqual(["job-a"]);
  });

  it("段内超过 5 条 → 前 5 条上屏 + 「本段另有 N 项未列出」", () => {
    for (let i = 0; i < 7; i++) mockJobs.push(job({ jobId: `job-${i}` }));
    const sec = buildNotif(t).sections![0];
    expect(sec.items).toHaveLength(5);
    expect(sec.items.map((r) => r.id)).toEqual(["job-0", "job-1", "job-2", "job-3", "job-4"]);
    expect(sec.foldedLabel).toBe("本段另有 2 项未列出");
  });

  it("无在途安装 → 不带 sections、不带 summaryLabel（契约宽容：不渲染这两段）", () => {
    const n = buildNotif(t);
    expect(n.sections).toBeUndefined();
    expect(n.summaryLabel).toBeUndefined();
  });
});

describe("buildNotif——第三段「已有结果」（E6#73d）", () => {
  beforeEach(() => { mockJobs.length = 0; });
  afterEach(() => { mockJobs.length = 0; });

  it("终态三档分别计数：失败 / 缺依赖 / 已完成（parked 不许并进「已完成」）", () => {
    mockJobs.push(
      job({ jobId: "job-1", state: "settled", terminal: "failed" }),
      job({ jobId: "job-2", state: "settled", terminal: "parked" }),
      job({ jobId: "job-3", state: "settled", terminal: "success" }),
      job({ jobId: "job-4", state: "settled", terminal: "success" }),
    );
    const n = buildNotif(t);
    expect(n.resultLabel).toBe("已有结果");
    expect(n.resultSummary).toBe("1 项失败 · 1 项缺依赖 · 2 项已完成");
    expect(n.sections).toBeUndefined(); // 全出结果 = 前两段空
  });

  it("只有成功 → 只报「已完成」，不把 0 写进摘要", () => {
    mockJobs.push(job({ jobId: "job-1", state: "settled", terminal: "success" }));
    expect(buildNotif(t).resultSummary).toBe("1 项已完成");
  });

  it("在途与结果并存 → 三段齐全且序固定（进行中 → 等待中 → 已有结果）", () => {
    mockJobs.push(
      job({ jobId: "job-1", stage: "downloading", percent: 10 }),
      job({ jobId: "job-2", state: "queued" }),
      job({ jobId: "job-3", state: "settled", terminal: "failed" }),
    );
    const n = buildNotif(t);
    expect(n.sections?.map((s) => s.key)).toEqual(["running", "queued"]);
    expect(n.resultLabel).toBe("已有结果");
    expect(n.resultSummary).toBe("1 项失败");
  });

  it("依赖 job 的终态也不进计数（与行同一条「一次用户动作」判据）", () => {
    mockJobs.push(job({ jobId: "job-dep", origin: "dependency", state: "settled", terminal: "success" }));
    expect(buildNotif(t).resultLabel).toBeUndefined();
  });

  it("固定三段：只在途、还没有结果 → 第三段标题仍在，写「0 项」（不是消失）", () => {
    mockJobs.push(job({ jobId: "job-1", stage: "downloading", percent: 10 }));
    const n = buildNotif(t);
    expect(n.sections?.[0].key).toBe("running");
    expect(n.resultLabel).toBe("已有结果");
    expect(n.resultSummary).toBe("0 项");
  });

  it("一次安装都没跑过 → 不带标题（纯插件通知的面板不凭空多一行）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0 });
    const n = buildNotif(t);
    expect(n.resultLabel).toBeUndefined();
    expect(n.resultSummary).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   E6#73g：角标只数有结果的 + 来源名人类可读 + 未读集合维护
   ═══════════════════════════════════════════════════════════════════════════ */

describe("buildNotif——角标只数有结果的（E6#73g，18 档 §八㉙）", () => {
  it("纯进行中条目 → unread 0（照旧进面板，只是不占铃铛数字）", () => {
    pushToast({ message: "演示消息 搬家", source: "demo-plugin", progress: true, ttl: 0 });
    const n = buildNotif(t);
    expect(n.unread).toBe(0);
    expect(n.bellTitle).toBe("通知");           // 回落「通知」——不是「1 条通知」
    expect(n.groups[0].items).toHaveLength(1); // 但条目还在面板里
  });

  it("组内 unread 同样不计进行中（组标题旁的角标不许跳）", () => {
    pushToast({ message: "演示消息 甲", source: "demo-plugin", progress: true, ttl: 0 });
    pushToast({ message: "演示消息 乙", source: "demo-plugin", ttl: 0 });
    const g = buildNotif(t).groups[0];
    expect(g.unread).toBe(1);
  });

  it("🔴 出结果（非进度新条目）→ 计数 +1（「有结果等着你」才亮数字）", () => {
    pushToast({ message: "演示消息 搬家", source: "demo-plugin", progress: true, ttl: 0 });
    expect(buildNotif(t).unread).toBe(0);
    pushToast({ message: "演示消息 装完了", source: "demo-plugin", severity: "info", wake: true, ttl: 0 });
    expect(buildNotif(t).unread).toBe(1);
  });

  it("已读的失败条目 → 不计（未读水位与「有结果」两条判据是**与**关系）", () => {
    const id = pushToast({ message: "演示消息 装失败", source: "demo-plugin", severity: "error", ttl: 0 });
    _seenIds.add(id);
    expect(buildNotif(t).unread).toBe(0);
  });
});

describe("buildNotif——来源名人类可读（E6#73g / S5）", () => {
  it("插件 id → manifest 显示名（组标题与来源行走同一路径）", () => {
    mockManifests.set("demo-plugin", { name: "演示插件" });
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0 });
    const g = buildNotif(t).groups[0];
    expect(g.key).toBe("demo-plugin");          // key 仍是机器读的 id（池侧按 key 定位）
    expect(g.label).toBe("演示插件");            // 标题是人类可读名
    expect(g.items[0].sourceLabel).toBe("来源: 演示插件");
  });

  it("查不到 manifest → 回落显示 id 本身（不是空串——空标题最难排查）", () => {
    pushToast({ message: "演示消息", source: "demo-未安装插件", ttl: 0 });
    expect(buildNotif(t).groups[0].label).toBe("demo-未安装插件");
  });

  it("manifest 有 id 无名 → 也回落 id", () => {
    mockManifests.set("demo-plugin", {});
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0 });
    expect(buildNotif(t).groups[0].label).toBe("demo-plugin");
  });

  it(`壳域 id（${APP_PLUGIN_ID}.update）→ 壳域自带可读名，不查 manifest、不显示内部 id`, () => {
    mockManifests.set(APP_PLUGIN_ID, { name: "不该被查到的假插件" }); // 故意埋一个：壳域不许走 manifest 这条路
    pushToast({ message: "演示消息", source: `${APP_PLUGIN_ID}.update`, ttl: 0 });
    const g = buildNotif(t).groups[0];
    expect(g.key).toBe(APP_PLUGIN_ID);          // 首段 = 「主软件」
    expect(g.label).toBe("主软件");
    expect(g.items[0].sourceLabel).toBe("来源: 主软件更新");
  });

  it("壳域下未登记的子域 → 回落「主软件」（它确实是壳，别显示 app.某个内部词）", () => {
    pushToast({ message: "演示消息", source: `${APP_PLUGIN_ID}.演示域`, ttl: 0 });
    expect(buildNotif(t).groups[0].items[0].sourceLabel).toBe("来源: 主软件");
  });

  it("无来源 → 「其他」组（老插件不填 source 的既有权行为零变化）", () => {
    pushToast({ message: "演示消息", ttl: 0 });
    const g = buildNotif(t).groups[0];
    expect(g.label).toBe("其他");
    expect(g.items[0].sourceLabel).toBeUndefined(); // 无来源就不画来源行
  });
});

describe("未读集合维护（E6#73g）", () => {
  it("markAllSeen —— 把当前全部条目标已读（面板开着时新到的条目走这条，B1）", () => {
    pushToast({ message: "演示消息 甲", source: "demo-plugin", severity: "error", ttl: 0 });
    expect(buildNotif(t).unread).toBe(1);
    markAllSeen();
    expect(buildNotif(t).unread).toBe(0);
    expect(_seenIds.size).toBe(1);
  });

  it("pruneSeen —— 只留还在面板里的 id（长跑会话不再只增不减）", () => {
    const gone = pushToast({ message: "演示消息 甲", source: "demo-plugin", ttl: 0 });
    const live = pushToast({ message: "演示消息 乙", source: "demo-plugin", ttl: 0 });
    markAllSeen();
    expect(_seenIds.size).toBe(2);
    dismissToast(gone);
    pruneSeen();
    expect([..._seenIds]).toEqual([live]);
  });

  it("pruneSeen —— 空集合直接返回，不产生副作用", () => {
    pruneSeen();
    expect(_seenIds.size).toBe(0);
  });
});
