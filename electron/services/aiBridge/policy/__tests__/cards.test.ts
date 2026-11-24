/**
 * 确认卡载荷（v5 归一）——钉住「人读、可指认、AI 理由独立」三条。
 */

import { describe, expect, it } from "vitest";
import { buildActionCard, buildElevationCard, buildFullAccessCard } from "../cards.js";

describe("AI 确认卡载荷", () => {
  it("敏感动作：标题是可读动作名，不带命令 id；目标显示标签页标题；徽标不暴露 R 代号", () => {
    const card = buildActionCard("关闭标签页", "可撤销：可重新打开", "R1", { title: "插件市场", metaKey: "标签页" });
    expect(card.kind).toBe("action");
    expect(card.titleKey).toBe("关闭标签页");
    expect(card.target.titleText).toBe("插件市场");
    expect(card.target.chipKey).toBe("可撤销");
    expect(JSON.stringify(card)).not.toContain("core.closeTab");
    expect(JSON.stringify(card)).not.toContain("R1");
  });

  it("提权：档位变化与能力表由 decide 派生（ask→auto：日常修改变允许，安装仍询问）", () => {
    const card = buildElevationCard("ask", "auto", "批量整理");
    expect(card.target.fromKey).toBe("逐次确认");
    expect(card.target.toKey).toBe("自主");
    expect(card.aiReason).toBe("批量整理");
    expect(card.rows?.find((r) => r.labelKey.includes("日常修改"))?.toKey).toBe("允许");
    expect(card.rows?.find((r) => r.labelKey.includes("安装"))?.toKey).toBe("询问");
    expect(card.confirmKey).toBe("允许提高");
  });

  it("完全访问：danger 卡带红色警示与后果清单，确认按钮语义是「仍要开启」", () => {
    const card = buildFullAccessCard("跨插件迁移");
    expect(card.danger).toBe(true);
    expect(card.consequences?.length).toBeGreaterThanOrEqual(3);
    expect(card.confirmKey).toBe("仍要开启完全访问");
    expect(card.rows).toBeUndefined();
  });
});
