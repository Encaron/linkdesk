/**
 * E5.7#82：linkdesk:// 协议路径解析单元测试。
 * 从 electron/protocol.ts 抽出的纯函数——2026-09-05 塌平单根：代码根直接含插件目录（root-direct，
 * 无 builtin/user 子目录扫描层），fixture 平铺镜像真实双根接线（app 根在前遮蔽 userData）。
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
  pluginsDir = path.join(tmpRoot, "plugins"); // app 根（平铺）
  userDataDir = path.join(tmpRoot, "userData-plugins"); // {userData}/plugins 用户安装家（平铺）
  // app 根平铺——插件目录直落 + 共享 assets 同级
  fs.mkdirSync(path.join(pluginsDir, "editor"), { recursive: true });
  fs.mkdirSync(path.join(pluginsDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, "editor", "editor.js"), "console.log(1)");
  fs.writeFileSync(path.join(pluginsDir, "assets", "shared.js"), "console.log(2)");
  fs.writeFileSync(path.join(pluginsDir, "root.txt"), "root");

  // userData 家——解压包目录平铺 {userData}/plugins/<id>/（index.bundle.js 等）
  fs.mkdirSync(path.join(userDataDir, "demo-bundle"), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, "demo-bundle", "index.bundle.js"), "console.log(3)");
  fs.writeFileSync(path.join(userDataDir, "demo-bundle", "plugin.json"), "{}");
  // 与 app 根同名插件——app 根应遮蔽 userData（先命中先赢）
  fs.mkdirSync(path.join(userDataDir, "editor"), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, "editor", "editor.js"), "console.log(4)");
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** app 根在前、userData 在后的双根表——protocol.ts 接线形状（平铺：subdirs 层已删） */
function roots() {
  return [{ root: pluginsDir }, { root: userDataDir }];
}

describe("resolveLinkdeskPath", () => {
  it("路径穿越 ../ → 403", () => {
    expect(resolveLinkdeskPath(pluginsDir, "../etc/passwd"))
      .toEqual({ ok: false, status: 403 });
  });

  it("路径穿越 ..\\ → 403", () => {
    expect(resolveLinkdeskPath(pluginsDir, "..\\evil.txt"))
      .toEqual({ ok: false, status: 403 });
  });

  it("根目录直接命中", () => {
    expect(resolveLinkdeskPath(pluginsDir, "root.txt"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "root.txt") });
  });

  it("E6 打包格式——插件目录根直命中（平铺：linkdesk://editor/editor.js → plugins/editor/editor.js）", () => {
    expect(resolveLinkdeskPath(pluginsDir, "editor/editor.js"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "editor", "editor.js") });
  });

  it("共享 chunk assets 目录同样可命中（chunk 相对 import ../../assets 的落点）", () => {
    expect(resolveLinkdeskPath(pluginsDir, "assets/shared.js"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "assets", "shared.js") });
  });

  it("文件不存在 → 404", () => {
    expect(resolveLinkdeskPath(pluginsDir, "missing.js"))
      .toEqual({ ok: false, status: 404 });
  });
});

describe("resolveLinkdeskPathMulti（E6#7 双根——app 根优先遮蔽，userData 包可达）", () => {
  it("app 根命中 → 与单根结果一致（先命中先赢，现行为不回归）", () => {
    // linkdesk://editor/editor.js → app 根 plugins/editor/editor.js
    expect(resolveLinkdeskPathMulti(roots(), "editor/editor.js"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "editor", "editor.js") });
  });

  it("app 根无、userData 包有 → 命中第二根（index.bundle.js 解压产物可达）", () => {
    // demo-bundle 只在 userData 根——linkdesk://demo-bundle/index.bundle.js 命中
    expect(resolveLinkdeskPathMulti(roots(), "demo-bundle/index.bundle.js"))
      .toEqual({ ok: true, fullPath: path.join(userDataDir, "demo-bundle", "index.bundle.js") });
  });

  it("同名插件两根皆有 → app 根遮蔽 userData（与 plugin-file-service 双根语义一致）", () => {
    // editor 在 userData 根也有 editor/editor.js——app 根先扫 → app 版本胜
    expect(resolveLinkdeskPathMulti(roots(), "editor/editor.js"))
      .toEqual({ ok: true, fullPath: path.join(pluginsDir, "editor", "editor.js") });
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
