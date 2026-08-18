/**
 * E4V#Test5: FileTreeClipboard 单元测试。
 * 剪贴板状态机独立可测——cut/copy/pull/clear 行为。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FileTreeClipboard } from "../services/FileTreeClipboard";
import { ContextKeyService } from "@src/core/registry/commands/ContextKeyService";

// E5#70e: 生产代码用 linkdesk.contextKey.set——测试环境 mock 回 ContextKeyService
function mockContextKey() {
  window.linkdesk = {
    ...(window.linkdesk ?? {}),
    contextKey: {
      set: (k: string, v: unknown) => {
        ContextKeyService.setValue(k, v);
        return Promise.resolve();
      },
    },
  };
}
mockContextKey();

describe("FileTreeClipboard", () => {
  let clipboard: FileTreeClipboard;

  beforeEach(() => {
    clipboard = new FileTreeClipboard();
    // 清 ContextKeyService 残留状态
    ContextKeyService.setValue("explorerResourceCut", false);
    ContextKeyService.setValue("explorerClipboardEmpty", true);
  });

  /* ── 初始状态 ── */

  it("初始状态——isEmpty=true, isCut=false", () => {
    expect(clipboard.isEmpty).toBe(true);
    expect(clipboard.isCut).toBe(false);
    expect(clipboard.uris).toEqual([]);
  });

  /* ── cut ── */

  it("cut→isCut=true, isEmpty=false", () => {
    clipboard.cut(["/a/1.txt"]);
    expect(clipboard.isCut).toBe(true);
    expect(clipboard.isEmpty).toBe(false);
    expect(clipboard.uris).toEqual(["/a/1.txt"]);
  });

  /* ── copy ── */

  it("copy→isCut=false, isEmpty=false", () => {
    clipboard.copy(["/a/2.txt"]);
    expect(clipboard.isCut).toBe(false);
    expect(clipboard.isEmpty).toBe(false);
    expect(clipboard.uris).toEqual(["/a/2.txt"]);
  });

  /* ── pull = 粘贴操作 ── */

  it("cut 后 pull——返回内容并清空（一次性）", () => {
    clipboard.cut(["/a/1.txt"]);
    const result = clipboard.pull();
    expect(result.uris).toEqual(["/a/1.txt"]);
    expect(result.isCut).toBe(true);
    // cut 后 pull 一次即清空
    expect(clipboard.isEmpty).toBe(true);
    expect(clipboard.isCut).toBe(false);
  });

  it("copy 后 pull——返回内容但不清空（可多次 paste）", () => {
    clipboard.copy(["/a/2.txt"]);
    // 第一次 pull
    const r1 = clipboard.pull();
    expect(r1.uris).toEqual(["/a/2.txt"]);
    expect(r1.isCut).toBe(false);
    // copy 不清空
    expect(clipboard.isEmpty).toBe(false);
    // 第二次 pull 仍有效
    const r2 = clipboard.pull();
    expect(r2.uris).toEqual(["/a/2.txt"]);
  });

  /* ── context key 同步 ── */

  it("cut→explorerResourceCut=true; pull 后→false", () => {
    clipboard.cut(["/a/1.txt"]);
    expect(ContextKeyService.getValue("explorerResourceCut")).toBe(true);
    expect(ContextKeyService.getValue("explorerClipboardEmpty")).toBe(false);

    clipboard.pull();
    expect(ContextKeyService.getValue("explorerResourceCut")).toBe(false);
    expect(ContextKeyService.getValue("explorerClipboardEmpty")).toBe(true);
  });
});
