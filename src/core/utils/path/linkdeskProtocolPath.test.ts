/**
 * E5.7#82：linkdesk:// 协议路径解析单元测试。
 * 从 electron/protocol.ts 抽出的纯函数——E6 打包格式适用性实证：
 * 预构建 chunk（linkdesk://{id}/{id}.js）经子目录扫描透明命中，解析方无需知道子目录。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveLinkdeskPath, resolveLinkdeskPathMulti } from "./linkdeskProtocolPath";

let tmpRoot: string;
let pluginsDir: string;
let userDataDir: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "linkdesk-protocol-"));
  pluginsDir = path.join(tmpRoot, "plugins"); // app 根
  userDataDir = path.join(tmpRoot, "userData-plugins"); // {userData}/plugins 用户安装家
  fs.mkdirSync(path.join(pluginsDir, "builtin", "editor"), { recursive: true });
  fs.mkdirSync(path.join(pluginsDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, "builtin", "editor", "editor.js"), "console.log(1)");
  fs.writeFileSync(path.join(pluginsDir, "assets", "shared.js"), "console.log(2)");
  fs.writeFileSync(path.join(pluginsDir, "root.txt"), "root");
  // 根目录与子目录同名文件——锁定子目录命中覆盖根命中的原语义
  fs.writeFileSync(path.join(pluginsDir, "dup.txt"), "root");
  fs.writeFileSync(path.join(pluginsDir, "builtin", "dup.txt"), "sub");

  // E6#7（1.2-4）：userData 家——解压包目录 {userData}/plugins/user/<id>/（index.bundle.js 等）
  fs.mkdirSync(path.join(userDataDir, "user", "demo-bundle"), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, "user", "demo-bundle", "index.bundle.js"), "console.log(3)");
  fs.writeFileSync(path.join(userDataDir, "user", "demo-bundle", "plugin.json"), "{}");
  // 与 app 根同名插件——app 根应遮蔽 userData（先命中先赢）
  fs.mkdirSync(path.join(userDataDir, "user", "editor"), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, "user", "editor", "editor.js"), "console.log(4)");
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** app 根在前、userData 在后的双根表——protocol.ts 接线形状 */
function roots() {
  return [
    { root: pluginsDir, subdirs: ["builtin", "user"] },
    { root: userDataDir, subdirs: ["builtin", "user"] },
  ];
}

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

describe("resolveLinkdeskPathMulti（E6#7 双根——app 根优先遮蔽，userData 包可达）", () => {
  it("app 根命中 → 与单根结果一致（先命中先赢，现行为不回归）", () => {
    // linkdesk://editor/editor.js → app 根 builtin/editor/editor.js
    expect(resolveLinkdeskPathMulti(roots(), "editor/editor.js"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "builtin", "editor", "editor.js") });
  });

  it("app 根无、userData 包有 → 命中第二根（index.bundle.js 解压产物可达）", () => {
    // demo-bundle 只在 userData 根——linkdesk://demo-bundle/index.bundle.js 命中 user/userData-demo
    expect(resolveLinkdeskPathMulti(roots(), "demo-bundle/index.bundle.js"))
      .toEqual({ ok: true, fullPath: path.join(userDataDir, "user", "demo-bundle", "index.bundle.js") });
  });

  it("同名插件两根皆有 → app 根遮蔽 userData（与 plugin-file-service 双根语义一致）", () => {
    // editor 在 userData 根也有 user/editor/editor.js——app 根先扫 → app 版本胜
    const res = resolveLinkdeskPathMulti(roots(), "editor/editor.js");
    expect(res.ok && res.fullPath.startsWith(pluginsDir)).toBe(true);
  });

  it("路径穿越 ../ → 403（最外层拒绝，任一根都不到）", () => {
    expect(resolveLinkdeskPathMulti(roots(), "../etc/passwd"))
      .toEqual({ ok: false, status: 403 });
    expect(resolveLinkdeskPathMulti(roots(), "..\\evil.js"))
      .toEqual({ ok: false, status: 403 });
  });

  it("两根皆无 → 404", () => {
    expect(resolveLinkdeskPathMulti(roots(), "missing.js"))
      .toEqual({ ok: false, status: 404 });
  });
});
