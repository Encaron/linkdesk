/**
 * E5.7#82：linkdesk:// 协议路径解析单元测试。
 * 从 electron/protocol.ts 抽出的纯函数——E6 打包格式适用性实证：
 * 预构建 chunk（linkdesk://{id}/{id}.js）经子目录扫描透明命中，解析方无需知道子目录。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveLinkdeskPath } from "./linkdeskProtocolPath";

let tmpRoot: string;
let pluginsDir: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "linkdesk-protocol-"));
  pluginsDir = path.join(tmpRoot, "plugins");
  fs.mkdirSync(path.join(pluginsDir, "builtin", "editor"), { recursive: true });
  fs.mkdirSync(path.join(pluginsDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, "builtin", "editor", "editor.js"), "console.log(1)");
  fs.writeFileSync(path.join(pluginsDir, "assets", "shared.js"), "console.log(2)");
  fs.writeFileSync(path.join(pluginsDir, "root.txt"), "root");
  // 根目录与子目录同名文件——锁定子目录命中覆盖根命中的原语义
  fs.writeFileSync(path.join(pluginsDir, "dup.txt"), "root");
  fs.writeFileSync(path.join(pluginsDir, "builtin", "dup.txt"), "sub");
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("resolveLinkdeskPath", () => {
  it("路径穿越 ../ → 403", () => {
    expect(resolveLinkdeskPath(pluginsDir, ["builtin"], "../etc/passwd"))
      .toEqual({ ok: false, status: 403 });
  });

  it("路径穿越 ..\\ → 403", () => {
    expect(resolveLinkdeskPath(pluginsDir, ["builtin"], "..\\evil.txt"))
      .toEqual({ ok: false, status: 403 });
  });

  it("根目录直接命中", () => {
    expect(resolveLinkdeskPath(pluginsDir, ["builtin"], "root.txt"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "root.txt") });
  });

  it("E6 打包格式——chunk 经子目录扫描透明命中（解析方无需知道 builtin）", () => {
    // linkdesk://editor/editor.js → pluginsDir/builtin/editor/editor.js
    expect(resolveLinkdeskPath(pluginsDir, ["builtin"], "editor/editor.js"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "builtin", "editor", "editor.js") });
  });

  it("共享 chunk assets 目录同样可命中（chunk 相对 import ../../assets 的落点）", () => {
    expect(resolveLinkdeskPath(pluginsDir, ["builtin"], "assets/shared.js"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "assets", "shared.js") });
  });

  it("子目录命中覆盖根目录命中（与 protocol.ts 原实现逐字节一致）", () => {
    expect(resolveLinkdeskPath(pluginsDir, ["builtin"], "dup.txt"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "builtin", "dup.txt") });
  });

  it("文件不存在 → 404", () => {
    expect(resolveLinkdeskPath(pluginsDir, ["builtin"], "missing.js"))
      .toEqual({ ok: false, status: 404 });
  });
});
