/**
 * installConfirmPayload 纯函数域单测——E6#71c（安装确认载荷构造：展示派生抽共享模块）。
 * 纯函数零 i18n 零 IPC——authorLabel/repoHomeUrl/fmtSize 展示串本地派生，payload 只带原始目录数据。
 * fixture 全虚构（硬约束 21）：插件名/作者/源仓库用明显虚构值（demo、Example 等字样），不指向真实插件/仓库。
 */

import { describe, it, expect } from "vitest";
import type { CatalogEntry } from "../services/marketCatalog";
import { authorLabel, repoHomeUrl, fmtSize, installConfirmPayload } from "../services/installConfirmPayload";

/** 最小目录条目 fixture——字段只填被测面需要，其余按类型缺省（结构可选）。虚构值恒明显非真实。 */
function entryFixture(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "demo-gizmo",
    name: "Demo Gizmo",
    version: "2.1.0",
    description: "A fictitious demonstration widget",
    author: "Example Author",
    size: 2048,
    license: "MIT",
    ...overrides,
  };
}

describe("authorLabel（author 兼容 {name,url} / string 两种形态——抽展示名）", () => {
  it("string → 原样（空串 → undefined）", () => {
    expect(authorLabel("Example Author")).toBe("Example Author");
    expect(authorLabel("")).toBeUndefined();
  });

  it("对象形态 → 取 name（无 name → undefined）", () => {
    expect(authorLabel({ name: "Zephyr Works", url: "https://example.dev/zephyr" })).toBe("Zephyr Works");
    expect(authorLabel({ url: "https://example.dev/noname" })).toBeUndefined();
  });

  it("undefined/空值 → undefined（诚实空）", () => {
    expect(authorLabel(undefined)).toBeUndefined();
  });
});

describe("repoHomeUrl（来源名 → 仓库主页 URL——零新字段零服务器）", () => {
  it("owner/repo（github raw 形态）→ github 主页", () => {
    expect(repoHomeUrl("example-owner/demo-gizmo")).toBe("https://github.com/example-owner/demo-gizmo");
  });

  it("host/owner/repo（gitee 等）→ host 主页", () => {
    expect(repoHomeUrl("gitee.example.com/example-owner/demo-gizmo")).toBe("https://gitee.example.com/example-owner/demo-gizmo");
  });

  it("无/非两~三段形态 → undefined（诚实不伪链）", () => {
    expect(repoHomeUrl(undefined)).toBeUndefined();
    expect(repoHomeUrl("singlesegment")).toBeUndefined();
  });
});

describe("fmtSize（字节可读化——KB/MB 通用单位零 i18n）", () => {
  it("B 直显（<1KB）", () => {
    expect(fmtSize(512)).toBe("512 B");
  });

  it("KB——小值一位小数（<10KB），大值整数", () => {
    expect(fmtSize(2048)).toBe("2.0 KB");
    expect(fmtSize(128 * 1024)).toBe("128 KB");
  });

  it("MB——恒一位小数", () => {
    expect(fmtSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("installConfirmPayload（载荷构造——目录字段子集 + 实际目标版本）", () => {
  it("基础映射：name/description/publisher/official/sourceName/repoUrl/size/license + 目录默认版本", () => {
    const p = installConfirmPayload(entryFixture({ sourceName: "example-owner/demo-gizmo" }));
    expect(p).toEqual({
      name: "Demo Gizmo",
      description: "A fictitious demonstration widget",
      publisher: "Example Author",
      official: undefined,
      sourceName: "example-owner/demo-gizmo",
      repoUrl: "https://github.com/example-owner/demo-gizmo",
      version: "2.1.0",
      size: 2048,
      license: "MIT",
    });
  });

  it("installVer 覆盖 → 载荷 version 取实际目标版本（不默认目录最新）", () => {
    const p = installConfirmPayload(entryFixture(), "1.4.0");
    expect(p.version).toBe("1.4.0");
  });

  it("official 透传——UI 零再判", () => {
    const p = installConfirmPayload(entryFixture({ official: true }));
    expect(p.official).toBe(true);
  });

  it("无 sourceName → sourceName/repoUrl 均 undefined（诚实无源行）", () => {
    const p = installConfirmPayload(entryFixture({ sourceName: undefined }));
    expect(p.sourceName).toBeUndefined();
    expect(p.repoUrl).toBeUndefined();
  });

  it("可选字段缺省 → 载荷不硬造（description/license/size 缺省态）", () => {
    const p = installConfirmPayload({
      id: "demo-gizmo",
      name: "Demo Gizmo",
      version: "1.0.0",
      author: "Example Author",
    });
    expect(p.description).toBeUndefined();
    expect(p.license).toBeUndefined();
    expect(p.size).toBeUndefined();
    expect(p.repoUrl).toBeUndefined();
  });
});
