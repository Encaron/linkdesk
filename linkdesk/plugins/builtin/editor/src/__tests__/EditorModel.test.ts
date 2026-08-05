/**
 * EditorModel 单元测试。
 * fromContent / getValue / setValue / isDirty / markSaved / uri。
 * load/save 依赖 FileService→需 mock。
 */

import { describe, it, expect, vi } from "vitest";
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
});
