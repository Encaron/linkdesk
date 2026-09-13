/**
 * E4V#Test5: FileTreeClipboard 单元测试。
 * 剪贴板状态机独立可测——cut/copy/pull/clear 行为。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FileTreeClipboard } from "../services/FileTreeClipboard";

/**
 * `window.linkdesk.contextKey` 的**本地最小桩**（E6#98b，L7 第 7.1 轮）。
 *
 * 此前这里 import 壳的 `ContextKeyService`（`@src/core/registry/commands/ContextKeyService`），
 * 两个问题：
 *   ① **插件独立成仓后那条路径不存在**——测试跑不起来（本轮要解的就是它）；
 *   ② **测试依赖越界**：生产代码（`FileTreeClipboard`）走的是 `window.linkdesk.contextKey.set`
 *      这条**契约**，测试却直连壳的**实现**。换成桩之后测试范围反而更准——它验的是「插件调了契约」，
 *      而不是「壳的实现记住了」。
 */
const ctxKeys = new Map<string, unknown>();

// E5#70e: 生产代码用 linkdesk.contextKey.set——测试环境用上面的桩承接
function mockContextKey() {
  window.linkdesk = {
    ...(window.linkdesk ?? {}),
    contextKey: {
      set: (k: string, v: unknown) => {
        ctxKeys.set(k, v);
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
    // 清桩表残留状态
    ctxKeys.clear();
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
    expect(ctxKeys.get("explorerResourceCut")).toBe(true);
    expect(ctxKeys.get("explorerClipboardEmpty")).toBe(false);

    clipboard.pull();
    expect(ctxKeys.get("explorerResourceCut")).toBe(false);
    expect(ctxKeys.get("explorerClipboardEmpty")).toBe(true);
  });
});
