/**
 * 确认卡视图模型单测——**原型逐屏对照的机器版**。
 *
 * 原型 `01-原型.html` 的三张卡（installTitle / sourceTitle / batchTitle）在这里逐项断言：
 * 标题/副题/键值行/完整性文案/警告框/勾选/统计/分组/免问摘要/按钮文案。
 * 样式与布局由共享件 CSS 负责，本文件只证「内容与顺序对得上原型」。
 */

import { describe, expect, it } from "vitest";
import type { PluginConfirmPlan, PluginInstallRequest } from "@linkdesk/contracts";
import { buildBatchVM, buildInstallVM, formatBytes, shortHash } from "./buildViewModel";
import type { PluginInstallConfirmLabels } from "./types";

/** 测试夹具 id（硬约束 21 虚构值；大写常量过 no-plugin-id-hardcode） */
const PLUGIN_A = "a";
const PLUGIN_B = "b";

const L: PluginInstallConfirmLabels = {
  installTitle: "安装 {{name}}",
  subFirst: "首次安装 · 壳托管确认",
  subSourceChanged: "来源已变更 · 按新装处理",
  subDowngrade: "降级安装 · 壳托管确认",
  subOfficial: "官方更新 · 壳托管确认",
  subUpdate: "更新 · 壳托管确认",
  noteFirst: "首装说明",
  noteSourceChanged: "来源变更说明",
  noteDowngrade: "降级说明",
  kvPlugin: "插件",
  kvPublisher: "发布者",
  kvSource: "来源",
  kvVersion: "版本",
  kvSize: "大小",
  kvIntegrity: "完整性",
  kvOldSource: "旧来源",
  kvNewSource: "新来源",
  integrityToVerify: "sha256 {{hash}} · 下载后校验",
  integrityMissing: "未提供校验值",
  warnSourceChanged: "来源变更警告",
  rememberSource: "以后此来源的更新不再询问",
  actionInstall: "确认安装",
  actionUpdate: "确认更新",
  actionUpdateAnyway: "仍要更新",
  actionCancel: "取消",
  unknownPublisher: "未知发布者",
  unknownSize: "未知大小",
  batchTitle: "更新插件",
  batchSub: "只列需要确认的项",
  statTotal: "本批总数",
  statAsk: "需要确认",
  statSilent: "按设置免问",
  groupAsk: "{{n}} 个需要确认",
  groupSilent: "{{n}} 个免问",
  groupSilentSummary: "{{label}} {{n}} 个",
  badgeOfficial: "官方",
  badgeThird: "第三方",
  silentLine: "{{summary}}按设置免问，将随本批一起执行。",
  silentAction: "改为逐个确认",
  rememberOfficial: "以后官方源更新不再询问",
  batchEmpty: "没有需要确认的项",
  batchNote: "取消 = 整批取消",
  actionConfirmBatch: "确认更新 {{n}} 个",
  actionRunBatch: "直接更新 {{n}} 个",
  actionCancelBatch: "取消",
  originLabel: "发起方",
  originAI: "AI",
  aiNoteTitle: "AI 说明",
  aiNoteHint: "由发起请求的 AI 提供",
  aiNoteMore: "展开",
  aiNoteLess: "收起",
};

function req(over: Partial<PluginInstallRequest> = {}): PluginInstallRequest {
  return {
    mode: "install",
    pluginId: "sample-focus",
    version: "0.1.0",
    downloadUrl: "https://example.dev/sample-0.1.0.zip",
    sha256: "9f2c00000000000000000000000000000000000000000000000000000000e81a",
    source: { id: "lab-sample", url: "https://lab.dev/marketplace.json", repo: "lab/market", publisher: "Demo Author" },
    display: { name: "Sample Focus", size: 1_152_000, description: "demo" },
    ...over,
  };
}

function plan(over: Partial<PluginConfirmPlan> = {}): PluginConfirmPlan {
  return {
    ask: [{ request: req(), reason: "first-install" }],
    silent: [],
    groups: [{ sourceId: "lab-sample", label: "lab/market", trusted: false, silentAllowed: false, askCount: 1, silentCount: 0 }],
    rejected: [],
    totals: { total: 1, ask: 1, silent: 0 },
    ...over,
  };
}

describe("formatBytes / shortHash", () => {
  it("KB / MB / 缺值", () => {
    expect(formatBytes(860 * 1024, "?")).toBe("860 KB");
    expect(formatBytes(1_152_000, "?")).toBe("1.1 MB");
    expect(formatBytes(undefined, "未知大小")).toBe("未知大小");
  });

  it("短写首4…末4；短值原样", () => {
    expect(shortHash("9f2c000000000000e81a")).toBe("9f2c…e81a");
    expect(shortHash("abcd")).toBe("abcd");
    expect(shortHash(undefined)).toBe("");
  });
});

describe("buildInstallVM —— 首装卡（对照 installTitle）", () => {
  const vm = buildInstallVM(plan(), L, null);

  it("标题/副题/说明", () => {
    expect(vm.title).toBe("安装 Sample Focus");
    expect(vm.sub).toBe("首次安装 · 壳托管确认");
    expect(vm.note).toBe("首装说明");
  });

  it("键值行顺序：插件 / 发布者 / 来源 / 版本 / 大小", () => {
    expect(vm.rows.map((r) => r.k)).toEqual(["插件", "发布者", "来源", "版本", "大小"]);
    expect(vm.rows[0].v).toBe("Sample Focus");
    expect(vm.rows[1].v).toBe("Demo Author");
    expect(vm.rows[2].v).toBe("lab/market");
    expect(vm.rows[3].v).toBe("0.1.0");
    expect(vm.rows[4].v).toBe("1.1 MB");
  });

  it("完整性：有 sha256 → 下载后校验（⛔ 不说「已校验」）", () => {
    expect(vm.integrity).toEqual({ k: "完整性", text: "sha256 9f2c…e81a · 下载后校验", ok: true });
  });

  it("无 sha256 → 未提供校验值（ok:false）", () => {
    const p = plan({ ask: [{ request: req({ sha256: undefined }), reason: "first-install" }] });
    expect(buildInstallVM(p, L, null).integrity).toMatchObject({ text: "未提供校验值", ok: false });
  });

  it("首装按钮 = 确认安装；非官方来源给「记住」勾选（默认未勾）", () => {
    expect(vm.footer).toEqual({ confirm: "确认安装", cancel: "取消", tone: undefined });
    expect(vm.remember).toEqual({ label: "以后此来源的更新不再询问", checked: false });
  });

  it("官方来源不给「记住」勾选（fixed 恒信任）", () => {
    const p = plan({
      ask: [{ request: req({ source: { id: "official", url: "https://x/marketplace.json" } }), reason: "first-install" }],
      groups: [{ sourceId: "official", label: "官方目录", trusted: true, silentAllowed: true, askCount: 1, silentCount: 0 }],
    });
    expect(buildInstallVM(p, L, null).remember).toBeUndefined();
  });
});

describe("buildInstallVM —— 更新卡（旧 → 新）", () => {
  it("版本行带旧版本；按钮 = 确认更新", () => {
    const p = plan({
      ask: [{ request: req({ mode: "update", version: "0.2.0" }), reason: "untrusted-source" }],
    });
    const vm = buildInstallVM(p, L, "0.1.0");
    expect(vm.sub).toBe("更新 · 壳托管确认");
    expect(vm.rows.find((r) => r.k === "版本")?.v).toBe("0.1.0 → 0.2.0");
    expect(vm.footer.confirm).toBe("确认更新");
  });

  it("已信任来源 → 记住勾选为已勾（取消勾 = 撤销信任）", () => {
    const p = plan({
      ask: [{ request: req({ mode: "update", version: "0.2.0" }), reason: "untrusted-source" }],
      groups: [{ sourceId: "lab-sample", label: "lab/market", trusted: true, silentAllowed: false, askCount: 1, silentCount: 0 }],
    });
    expect(buildInstallVM(p, L, "0.1.0").remember?.checked).toBe(true);
  });
});

describe("buildInstallVM —— 来源变更卡（对照 sourceTitle）", () => {
  const p = plan({
    ask: [
      {
        request: req({ mode: "update", version: "1.1.0", source: { id: "mirror", url: "https://evil.dev/m.json", repo: "x/y", publisher: "Unknown" } }),
        reason: "source-changed",
        previous: { id: "official", url: "https://x/marketplace.json", repo: "Encaron/linkdesk-plugin-theme-aurora-glass" },
        previousLabel: "Encaron/linkdesk-plugin-theme-aurora-glass",
      },
    ],
    groups: [{ sourceId: "mirror", label: "evil.dev", trusted: false, silentAllowed: false, askCount: 1, silentCount: 0 }],
  });
  const vm = buildInstallVM(p, L, "1.0.9");

  it("副题/警告框/旧→新两行，顺序固定", () => {
    expect(vm.sub).toBe("来源已变更 · 按新装处理");
    expect(vm.warn).toBe("来源变更警告");
    expect(vm.rows.map((r) => r.k)).toEqual(["插件", "发布者", "来源", "旧来源", "新来源", "版本", "大小"]);
    expect(vm.rows.find((r) => r.k === "新来源")).toMatchObject({ v: "evil.dev", tone: "warn" });
    expect(vm.rows.find((r) => r.k === "旧来源")?.v).toBe("Encaron/linkdesk-plugin-theme-aurora-glass");
  });

  it("按钮 = 仍要更新（danger）", () => {
    expect(vm.footer).toEqual({ confirm: "仍要更新", cancel: "取消", tone: "danger" });
  });
});

describe("buildInstallVM —— 降级卡", () => {
  it("副题 + 说明 + 仍要更新", () => {
    const p = plan({ ask: [{ request: req({ mode: "update", version: "0.9.0", allowOlder: true }), reason: "downgrade" }] });
    const vm = buildInstallVM(p, L, "1.0.0");
    expect(vm.sub).toBe("降级安装 · 壳托管确认");
    expect(vm.note).toBe("降级说明");
    expect(vm.footer.confirm).toBe("仍要更新");
  });
});

describe("buildBatchVM —— 批量卡（对照 batchTitle）", () => {
  const batchPlan = plan({
    ask: [
      { request: req({ mode: "update", pluginId: "third-a", display: { name: "Third A", size: 1024 } }), reason: "untrusted-source" },
      { request: req({ mode: "update", pluginId: "third-b", display: { name: "Third B" } }), reason: "untrusted-source" },
    ],
    silent: [{ pluginId: "official-a", displayName: "Official A", version: "2.0.0", sourceId: "official" }],
    groups: [
      { sourceId: "official", label: "官方目录", trusted: true, silentAllowed: true, askCount: 0, silentCount: 1 },
      { sourceId: "lab-sample", label: "lab/market", trusted: false, silentAllowed: false, askCount: 2, silentCount: 0 },
    ],
    totals: { total: 3, ask: 2, silent: 1 },
  });
  const vm = buildBatchVM(batchPlan, L, true);

  it("统计三格", () => {
    expect(vm.stats).toEqual({ total: 3, ask: 2, silent: 1, labels: { total: "本批总数", ask: "需要确认", silent: "按设置免问" } });
  });

  it("分组：只列 ask 组；组头徽标/计数正确", () => {
    expect(vm.groups).toHaveLength(1);
    expect(vm.groups?.[0]).toMatchObject({ label: "lab/market", badge: "第三方", badgeTone: "third", countLabel: "2 个需要确认" });
    expect(vm.groups?.[0].rows.map((r) => r.pluginId)).toEqual(["third-a", "third-b"]);
  });

  it("免问摘要行 + 动作", () => {
    expect(vm.silentLine).toEqual({
      text: "官方目录 1 个按设置免问，将随本批一起执行。",
      action: "改为逐个确认",
    });
  });

  it("底部按钮 = 确认更新 N 个；勾选反映 silentOfficial", () => {
    expect(vm.footer).toEqual({ confirm: "确认更新 3 个", cancel: "取消" });
    expect(vm.remember).toEqual({ label: "以后官方源更新不再询问", checked: true });
  });

  it("ask 归零 → 空态文案 + 「直接更新」按钮", () => {
    const empty = buildBatchVM(
      plan({
        ask: [],
        groups: [{ sourceId: "official", label: "官方目录", trusted: true, silentAllowed: true, askCount: 0, silentCount: 1 }],
        totals: { total: 1, ask: 0, silent: 1 },
      }),
      L,
      true,
    );
    expect(empty.emptyText).toBe("没有需要确认的项");
    expect(empty.footer.confirm).toBe("直接更新 1 个");
    expect(empty.groups).toHaveLength(0);
  });
});
describe("批量行 AI 徽标（2026-11-25）", () => {
  it("requestedBy=ai 的行带徽标文案；用户发起的不带", () => {
    const plan = {
      totals: { total: 2, ask: 2, silent: 0 },
      groups: [{ sourceId: "official", label: "官方目录", trusted: true, silentAllowed: false, askCount: 2, silentCount: 0 }],
      ask: [
        { reason: "official-source", request: { pluginId: PLUGIN_A, version: "2.0.0", source: { id: "official" }, display: { name: "A" }, requestedBy: "ai" } },
        { reason: "official-source", request: { pluginId: PLUGIN_B, version: "2.0.0", source: { id: "official" }, display: { name: "B" } } },
      ],
      silent: [],
      rejected: [],
    } as never;
    const vm = buildBatchVM(plan, L, false);
    const rows = (vm.groups ?? []).flatMap((g) => g.rows);
    expect(rows.find((r) => r.pluginId === PLUGIN_A)?.ai).toBe("AI");
    expect(rows.find((r) => r.pluginId === PLUGIN_B)?.ai).toBeUndefined();
  });
});
