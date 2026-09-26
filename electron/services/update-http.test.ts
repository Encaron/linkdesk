/**
 * update-http 归因表单测——04 池「更新检查遇匿名限流」（2026-09-27）。
 *
 * 旧实现只看状态码：一切 403 都说成「限流」，既拿不到恢复时刻，也把「受限 IP / 滥用检测」
 * 那种「稍后重试不会好」的 403 一起谎报。新判据（04 池档案 §四 落点 1/2）：
 *   - 403 **必须**读 `x-ratelimit-remaining`——`"0"` 才是限流；缺失 / 非 0 ⇒ 归 network；
 *   - 读得到 `x-ratelimit-reset` ⇒ 文案给**确定的本地恢复时刻**（词条 `{{time}}` + params）；
 *   - 429 本义即「请求过多」⇒ 恒 rate-limited（不看头）。
 * 纯函数直测——本地 http 服务的真发包路径由 `update-source.test.ts` / `update-release-notes.test.ts`
 * 两条腿各自覆盖，本文件不重复（两把尺子不复制）。
 */

import { describe, it, expect } from "vitest";
import { classifyHttpFailure, rateLimitHeadersOf } from "./update-http.js";

describe("classifyHttpFailure——403 归因读头，不只看状态码", () => {
  it("🔴 remaining: \"0\" ⇒ rate-limited（真限流）", () => {
    expect(classifyHttpFailure(403, { remaining: "0", reset: null }).code).toBe("rate-limited");
  });

  it("🔴 头缺失 / remaining 非 0 ⇒ 不说「限流」，归 network（受限 IP / 滥用检测形态）", () => {
    expect(classifyHttpFailure(403, { remaining: null, reset: null }).code).toBe("network");
    expect(classifyHttpFailure(403, { remaining: "57", reset: null }).code).toBe("network");
    expect(classifyHttpFailure(403).code).toBe("network"); // 调用方拿不到头的退化形
  });

  it("429 恒 rate-limited（本义即请求过多，不依赖头）", () => {
    expect(classifyHttpFailure(429, { remaining: null, reset: null }).code).toBe("rate-limited");
    expect(classifyHttpFailure(429).code).toBe("rate-limited");
  });

  it("404 / 其余非 2xx 行为零回归", () => {
    expect(classifyHttpFailure(404).code).toBe("not-found");
    expect(classifyHttpFailure(500).code).toBe("network");
    expect(classifyHttpFailure(503, { remaining: "0", reset: null }).code).toBe("network");
  });
});

describe("classifyHttpFailure——恢复时刻（reset 头 → {{time}} 词条参数）", () => {
  it("读得到 reset ⇒ 文案是带 {{time}} 的词条形，params.time 为本地 HH:mm", () => {
    const r = classifyHttpFailure(403, { remaining: "0", reset: "1758945600" });
    expect(r.code).toBe("rate-limited");
    expect(r.message).toContain("{{time}}");
    expect(r.params?.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it("读不到 reset ⇒ 退回「稍后」含糊形（无 params）", () => {
    const r = classifyHttpFailure(403, { remaining: "0", reset: null });
    expect(r.code).toBe("rate-limited");
    expect(r.message).not.toContain("{{time}}");
    expect(r.params).toBeUndefined();
  });

  it("reset 是垃圾值（非数字 / 零 / 负数）⇒ 同样退回含糊形", () => {
    for (const reset of ["not-a-number", "0", "-5"]) {
      expect(classifyHttpFailure(429, { remaining: null, reset }).params).toBeUndefined();
    }
  });
});

describe("classifyHttpFailure——文案口径", () => {
  it("限流文案不再说「无需处理」（共享出口 IP 下用户可以处理）", () => {
    expect(classifyHttpFailure(403, { remaining: "0", reset: null }).message).not.toContain("无需处理");
    expect(classifyHttpFailure(429).message).not.toContain("无需处理");
  });

  it("六类 HTTP 往返文案互不相同（共用表的老判据，随新文案重钉）", () => {
    const messages = new Set([
      classifyHttpFailure(404).message, // not-found
      classifyHttpFailure(403, { remaining: "0", reset: null }).message, // rate-limited
      classifyHttpFailure(503).message, // network
      classifyHttpFailure(403, { remaining: "57", reset: null }).message, // network（非限流 403）
    ]);
    expect(messages.size).toBe(3); // network 两条共文案，其余各一条
  });
});

describe("rateLimitHeadersOf——两条腿共用的摘头口", () => {
  it("从 Response 上摘两枚头；缺的为 null（headers.get 语义）", () => {
    const resp = new Response(null, {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1758945600" },
    });
    expect(rateLimitHeadersOf(resp)).toEqual({ remaining: "0", reset: "1758945600" });

    const bare = new Response(null, { status: 403 });
    expect(rateLimitHeadersOf(bare)).toEqual({ remaining: null, reset: null });
  });
});
