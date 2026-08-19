/**
 * EditorModel 单元测试。
 * fromContent / getValue / setValue / isDirty / markSaved / uri。
 * load/save 依赖 FileService→需 mock。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorModel } from "../services/EditorModel";

describe("EditorModel", () => {
  /* ── fromContent ── */

  it("fromContent——构造并返回内容", () => {
    const m = EditorModel.fromContent("/a/b.ts", "const x = 1;");
    expect(m.getValue()).toBe("const x = 1;");
    expect(m.filePath).toBe("/a/b.ts");
    expect(m.encoding).toBe("utf-8");
    expect(m.language).toBe("typescript");
  });

  it("fromContent——normalizePath 去反斜杠", () => {
    const m = EditorModel.fromContent("E:\\test\\app.ts", "");
    expect(m.filePath).toBe("E:/test/app.ts");
  });

  /* ── getValue / setValue ── */

  it("setValue→getValue 返回新值", () => {
    const m = EditorModel.fromContent("/a.ts", "old");
    m.setValue("new");
    expect(m.getValue()).toBe("new");
  });

  /* ── isDirty ── */

  it("初始状态——isDirty=false", () => {
    const m = EditorModel.fromContent("/a.ts", "hello");
    expect(m.isDirty()).toBe(false);
  });

  it("setValue 后→isDirty=true", () => {
    const m = EditorModel.fromContent("/a.ts", "hello");
    m.setValue("world");
    expect(m.isDirty()).toBe(true);
  });

  it("setValue 回原值→isDirty=false（内容等于 _savedValue 即干净）", () => {
    const m = EditorModel.fromContent("/a.ts", "hello");
    m.setValue("world");
    expect(m.isDirty()).toBe(true);
    // 撤回到原值→_value === _savedValue→脏标记回 false
    m.setValue("hello");
    expect(m.isDirty()).toBe(false);
  });

  /* ── markSaved ── */

  it("markSaved→isDirty=false", () => {
    const m = EditorModel.fromContent("/a.ts", "hello");
    m.setValue("world");
    expect(m.isDirty()).toBe(true);
    m.markSaved();
    expect(m.isDirty()).toBe(false);
  });

  /* ── uri ── */

  it("uri——Unix 路径→file:// 协议", () => {
    const m = EditorModel.fromContent("/src/app.ts", "");
    expect(m.uri).toBe("file:///src/app.ts");
  });

  it("uri——Windows 路径→file:// 协议（normalizePath 先转正斜杠）", () => {
    const m = EditorModel.fromContent("E:\\test\\app.ts", "");
    expect(m.uri).toBe("file:///E:/test/app.ts");
  });

  /* ── onDidChangeContent ── */

  it("onDidChangeContent——setValue 触发事件", () => {
    const m = EditorModel.fromContent("/a.ts", "old");
    const fn = vi.fn();
    m.onDidChangeContent.event(fn);
    m.setValue("new");
    expect(fn).toHaveBeenCalledWith("new");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  /* ── onDidSave ── */

  it("onDidSave——markSaved 触发事件", () => {
    const m = EditorModel.fromContent("/a.ts", "hello");
    m.setValue("world");
    const fn = vi.fn();
    m.onDidSave.event(fn);
    m.markSaved();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  /* ── language ── */

  it("language——根据扩展名推断", () => {
    expect(EditorModel.fromContent("/a.py", "").language).toBe("python");
    expect(EditorModel.fromContent("/a.cpp", "").language).toBe("cpp");
    expect(EditorModel.fromContent("/a.xyz", "").language).toBe("plaintext");
  });

  /* ── setFilePath（E5.8#25.3 重命名迁移）── */

  it("setFilePath——路径迁移：内容不变 + dirty 保留 + uri 切换", () => {
    const m = EditorModel.fromContent("/a.ts", "hello");
    m.setValue("world"); // 变脏
    m.setFilePath("/renamed.ts");
    expect(m.filePath).toBe("/renamed.ts");
    expect(m.getValue()).toBe("world");
    expect(m.isDirty()).toBe(true); // 内容未动 → dirty 保留
    expect(m.uri).toBe("file:///renamed.ts"); // uri 派生切换（Monaco 新 uri model）
  });

  it("setFilePath——语言随新扩展名重派生（.txt→.ts）", () => {
    const m = EditorModel.fromContent("/a.txt", "");
    expect(m.language).toBe("plaintext");
    m.setFilePath("/a.ts");
    expect(m.language).toBe("typescript");
  });

  it("setFilePath——normalize 反斜杠后保存写新路径", async () => {
    const linkdesk = window.linkdesk as unknown as {
      filesystem: { writeTextFile: ReturnType<typeof vi.fn> };
    };
    linkdesk.filesystem.writeTextFile = vi.fn().mockResolvedValue(undefined);
    const m = EditorModel.fromContent("E:\\a\\b.ts", "hello");
    m.setFilePath("E:\\a\\renamed.ts");
    await m.save();
    // 保存目标 = 新路径（utf-8 走 writeTextFile）
    expect(linkdesk.filesystem.writeTextFile).toHaveBeenCalledWith("E:/a/renamed.ts", "hello");
  });

  /* ── reloadFromDisk（E5.8#0d.9）── */

  describe("reloadFromDisk", () => {
    // load 依赖 lk.filesystem.readBinaryFile + lk.encoding.*——全局 mock 无 encoding 面，测试内注入
    const linkdesk = window.linkdesk as unknown as {
      filesystem: { readBinaryFile: ReturnType<typeof vi.fn> };
      encoding: { detect: ReturnType<typeof vi.fn>; decode: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
      linkdesk.encoding = {
        detect: vi.fn().mockResolvedValue("utf-8"),
        decode: vi.fn().mockResolvedValue(""),
      };
    });

    it("磁盘内容 = 内存内容 → null（自己 Ctrl+S 场景）", async () => {
      const m = EditorModel.fromContent("/a.ts", "hello");
      linkdesk.filesystem.readBinaryFile = vi.fn().mockResolvedValue(new Uint8Array());
      linkdesk.encoding.decode.mockResolvedValue("hello");
      await expect(m.reloadFromDisk()).resolves.toBeNull();
    });

    it("磁盘内容 ≠ 内存内容 → 返回磁盘新值（不动 model）", async () => {
      const m = EditorModel.fromContent("/a.ts", "hello");
      linkdesk.filesystem.readBinaryFile = vi.fn().mockResolvedValue(new Uint8Array());
      linkdesk.encoding.decode.mockResolvedValue("world");
      await expect(m.reloadFromDisk()).resolves.toBe("world");
      // 只比较不落盘——model 内容与脏状态不变
      expect(m.getValue()).toBe("hello");
      expect(m.isDirty()).toBe(false);
    });

    it("读失败 → null（保守 no-op）", async () => {
      const m = EditorModel.fromContent("/a.ts", "hello");
      linkdesk.filesystem.readBinaryFile = vi.fn().mockRejectedValue(new Error("ENOENT"));
      await expect(m.reloadFromDisk()).resolves.toBeNull();
    });
  });
});
