import { describe, it, expect } from "vitest";
import {
  classifyInstallError,
  updateFailLabelKey,
  updateFailText,
} from "../services/marketplaceShared";

/**
 * E6#71b：更新失败归因 + 原文直显——终结「更新失败：未知错误」黑洞。
 * 引擎「更新域」报错（update.ts / install-handlers stage 校验）本是完整可读句，classify 认不出即 unknown →
 * updateFailText 直显引擎原文，不再套「未知错误」；硬塞进安装域类目会误导（「不在用户安装区」≠「插件包损坏」）。
 * 分类词输入 = 引擎真实错误 token（生产契约输入，非 UI 文案替身）；插件名用虚构值（硬约束 21）。
 */
describe("更新失败归因与原文直显（E6#71b）", () => {
  it("更新域状态/策略错误全落 unknown（不入安装域误导类目）", () => {
    const samples = [
      '插件 "alpha-demo" 不在用户安装区——仅安装包可更新（app 树插件走重新构建）', // update.ts:47
      '插件 "alpha-demo" 未找到安装目录', // update.ts:44
      "缺少更新包来源（需 url 或 catalogUrl）", // update.ts:107
      '市场目录未提供 "alpha-demo" 的下载地址', // update.ts:106
      "包内版本与当前版本相同 1.0.0——无需更新", // install-handlers stage 校验
      "新版本需高于当前版本 1.0.0（包内 0.5.0）——降级需在版本下拉显式选择旧版", // install-handlers stage 校验
      "替换失败，已恢复旧版: 存取被拒绝", // commit 失败
    ];
    for (const s of samples) expect(classifyInstallError(s)).toBe("unknown");
  });

  it("下载/网络类失败仍归 network（既有覆盖不回退）", () => {
    expect(classifyInstallError("TypeError: fetch failed")).toBe("network");
    expect(classifyInstallError("[IpcBridge] 请求超时: plugins:call")).toBe("network");
    expect(classifyInstallError("下载失败: ECONNRESET")).toBe("network");
  });

  it("conflict 词仍归 conflict（既有覆盖不回退）", () => {
    expect(classifyInstallError("该插件已存在安装目录")).toBe("conflict");
  });

  it("updateFailText：unknown + 有原文 → 直显原文（不再是「未知错误」）", () => {
    const t = (k: string) => k; // 直通 t——断言返回引擎原文本身
    const raw = '插件 "alpha-demo" 不在用户安装区——仅安装包可更新';
    expect(updateFailText(t, "unknown", raw)).toBe(raw);
  });

  it("updateFailText：unknown + 空原文 → 诚实兜底（不谎称未知错误）", () => {
    const t = (k: string) => k;
    const out = updateFailText(t, "unknown", "");
    expect(out).not.toContain("未知错误");
    expect(out).toContain("请重试");
  });

  it("updateFailText：归因可认 → 归因短语经 t 译当前语言", () => {
    const en: Record<string, string> = { "更新失败：网络连接不可用": "Update failed: network unavailable" };
    const t = (k: string) => en[k] ?? k;
    expect(updateFailText(t, "network", "any raw")).toBe("Update failed: network unavailable");
  });

  it("updateFailLabelKey：conflict 分支就位 + default 不再谎称未知错误", () => {
    expect(updateFailLabelKey("conflict")).toBe("更新失败：该插件已安装，如需覆盖请先卸载");
    expect(updateFailLabelKey("unknown")).not.toContain("未知错误");
  });
});
