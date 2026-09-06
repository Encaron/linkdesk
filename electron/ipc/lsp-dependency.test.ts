/**
 * E5.8#24.6：checkLspDependency 哨兵单元测试。
 * 回归 #24 防护：pyright 被误删（spawn 字符串引用在 knip 静态图盲区）→ spawn ENOENT →
 * invoke 仍返 channelId → client.start() 挂死 → 跳转静默消失。哨兵在 spawn 前把缺失显性化。
 * 纯函数无 electron import——直接 vitest。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { checkLspDependency } from "./lsp-dependency";

/** 每个测试独立临时根——防前一个测试创建的文件污染后一个测试的"缺失"断言 */
function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ld-lsp-dependency-"));
}

describe("checkLspDependency（E5.8#24.6 spawn 前哨兵）", () => {
  it("args 脚本存在（pyright 就位）→ null", () => {
    const root = makeRoot();
    try {
      const script = path.join(root, "node_modules", "pyright", "dist", "pyright-langserver.js");
      fs.mkdirSync(path.dirname(script), { recursive: true });
      fs.writeFileSync(script, "// fake");
      // 相对 args 走 baseDir 回退基准（spawn 实参实际已注册绝对化——此处测哨兵相对回退分支）
      const res = checkLspDependency("node", ["node_modules/pyright/dist/pyright-langserver.js", "--stdio"], root);
      expect(res).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("args 脚本缺失（回归 #24：pyright 被删）→ 返回缺失路径", () => {
    const root = makeRoot();
    try {
      const missing = "node_modules/pyright/dist/pyright-langserver.js";
      const res = checkLspDependency("node", [missing, "--stdio"], root);
      expect(res).toBe(missing);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("command 是内建（node）但 args 脚本缺失 → 仍返回缺失脚本（内建不豁免 args）", () => {
    const root = makeRoot();
    try {
      const res = checkLspDependency("node", ["node_modules/does-not-exist/clang.js", "--stdio"], root);
      expect(res).toBe("node_modules/does-not-exist/clang.js");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("非二进制 args（--stdio 等 flag）→ 不误报", () => {
    const root = makeRoot();
    try {
      const res = checkLspDependency("node", ["--stdio", "--no-lsp"], root);
      expect(res).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("绝对路径 command 存在 → null", () => {
    const root = makeRoot();
    try {
      const bin = path.join(root, "langserver.cmd");
      fs.writeFileSync(bin, "@echo off");
      expect(checkLspDependency(bin, [], root)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("绝对路径 command 缺失 → 返回 command", () => {
    const root = makeRoot();
    try {
      const missing = path.join(root, "no-such-langserver.cmd");
      expect(checkLspDependency(missing, [], root)).toBe(missing);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("baseDir 下相对脚本 command 存在 → null", () => {
    const root = makeRoot();
    try {
      const script = path.join(root, "tools", "lsp.js");
      fs.mkdirSync(path.dirname(script), { recursive: true });
      fs.writeFileSync(script, "// fake");
      expect(checkLspDependency("tools/lsp.js", [], root)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("非内建 + 非 baseDir 相对文件 = PATH 二进制（clangd 等）→ 同步无法验证返回 null（渲染超时兜底）", () => {
    const root = makeRoot();
    try {
      const res = checkLspDependency("clangd", [], root);
      expect(res).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("E6 联动：绝对路径 args（搬迁到 {userData}/plugins/<id>/node_modules/）→ 直接命中", () => {
    const root = makeRoot();
    try {
      const absScript = path.join(root, "userData", "plugins", "python", "node_modules", "pyright", "dist", "pyright-langserver.js");
      fs.mkdirSync(path.dirname(absScript), { recursive: true });
      fs.writeFileSync(absScript, "// fake");
      expect(checkLspDependency("node", [absScript, "--stdio"], root)).toBeNull();

      const absMissing = path.join(root, "userData", "plugins", "python", "node_modules", "pyright", "dist", "missing.js");
      expect(checkLspDependency("node", [absMissing], root)).toBe(absMissing);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
