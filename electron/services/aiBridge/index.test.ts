/**
 * AI 接入内核单测——M4 `AI#32`（网关）＋ `AI#33`（白名单）的可机械面。
 *
 * 真机面（通道监听 / token 流转 / 壳请求缝）归 CLI 实测（交接读数），这里只钉三件纯逻辑：
 *   1. 🔴 配置解析——「回环是配置的结果，不是代码的假设」：host/port 全可配；默认关（AI#39 门锁
 *      的前置）；env 显式覆盖设置键；settings.json 读不动 = 关（不是抛）。
 *   2. 🔴 凭据校验收敛一处（`tokenOk`）——空凭据 / 非串 / 长度不等一律 false（timingSafeEqual 前置）。
 *   3. 🔴 白名单自省面从操作表**派生**（AI#33 判据）——opCatalog 与 OPS 同源，每条自带 help/params。
 *   4. 🔴 多窗口目标窗裁决（AI#41）——聚焦窗优先 / 死了回退注册表首个（`pickShellWindow` 纯函数）。
 * fixture 全虚构（token / 路径 / 端口，硬约束 21）。
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, afterEach } from "vitest";

// 🔴 共享桩必须先于 SUT import（electron-mock.ts 头注「纪律」）——SUT 顶部 import { app } from "electron"
import { electronMock } from "../electron-mock.js";
void electronMock;

import { resolveBridgeConfig, tokenOk, pickShellWindow } from "./index.js";
import { OPS, opCatalog, WHITELIST_VERSION, coded } from "./whitelist.js";

let tmpDirs: string[] = [];
function settingsFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aibridge-test-"));
  tmpDirs.push(dir);
  const p = path.join(dir, "settings.json");
  fs.writeFileSync(p, content);
  return p;
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs = [];
});

describe("resolveBridgeConfig（AI#32：开关与回环口子）", () => {
  it("env 显式 tcp/pipe ⇒ 开，来源 env", () => {
    expect(resolveBridgeConfig({ LINKDESK_AIBRIDGE: "tcp" }, "/nonexistent/settings.json").enabled).toBe(true);
    const pipe = resolveBridgeConfig({ LINKDESK_AIBRIDGE: "pipe" }, "/nonexistent/settings.json");
    expect(pipe.enabled).toBe(true);
    expect(pipe.transport).toBe("pipe");
  });

  it("env 显式 off ⇒ 明确关（不看设置键——dev 临时全关的逃生口）", () => {
    const cfg = resolveBridgeConfig(
      { LINKDESK_AIBRIDGE: "off" },
      settingsFile('{"ai.cli.enabled": true}'),
    );
    expect(cfg.enabled).toBe(false);
    expect(cfg.source).toBe("env");
  });

  it("设置键 ai.cli.enabled / ai.mcp.enabled 任一为 true ⇒ 开（AI#38.3 的正式键，本格只读取口）", () => {
    expect(resolveBridgeConfig({}, settingsFile('{"ai.cli.enabled": true}')).enabled).toBe(true);
    expect(resolveBridgeConfig({}, settingsFile('{"ai.mcp.enabled": true}')).enabled).toBe(true);
    expect(resolveBridgeConfig({}, settingsFile('{"ai.cli.enabled": false}')).enabled).toBe(false);
  });

  it("两键都缺席 / 文件不存在 / 读不动 ⇒ 默认关（门锁语义，不是错误）", () => {
    const off = resolveBridgeConfig({}, settingsFile('{"app.theme": "dark"}'));
    expect(off.enabled).toBe(false);
    expect(off.source).toBe("default-off");
    expect(resolveBridgeConfig({}, "/nonexistent/settings.json").enabled).toBe(false);
    expect(resolveBridgeConfig({}, settingsFile("{oops")).enabled).toBe(false);
  });

  it("🔴 地址与端口全是配置——env 给什么听什么（回环只是默认值，⛔ 代码无一处「非本机即拒」）", () => {
    const cfg = resolveBridgeConfig(
      { LINKDESK_AIBRIDGE: "tcp", LINKDESK_AIBRIDGE_HOST: "127.0.0.2", LINKDESK_AIBRIDGE_PORT: "59123" },
      "/nonexistent/settings.json",
    );
    expect(cfg.host).toBe("127.0.0.2");
    expect(cfg.port).toBe(59123);
    expect(resolveBridgeConfig({}, "/nonexistent/settings.json").host).toBe("127.0.0.1");
    expect(resolveBridgeConfig({}, "/nonexistent/settings.json").port).toBe(0); // 0 = OS 派临时端口
    expect(resolveBridgeConfig({ LINKDESK_AIBRIDGE_PORT: "not-a-number" }, "/x").port).toBe(0);
  });
});

describe("tokenOk（AI#32：凭据校验收敛一处）", () => {
  const TOKEN = "a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8";
  it("对的凭据放行，错的拒绝", () => {
    expect(tokenOk(TOKEN, TOKEN)).toBe(true);
    expect(tokenOk("9" + TOKEN.slice(1), TOKEN)).toBe(false);
  });
  it("空凭据 / 非串 / 内核无凭据 ⇒ 一律拒绝（不抛）", () => {
    expect(tokenOk("", TOKEN)).toBe(false);
    expect(tokenOk(undefined, TOKEN)).toBe(false);
    expect(tokenOk(123, TOKEN)).toBe(false);
    expect(tokenOk(TOKEN, null)).toBe(false);
    expect(tokenOk(TOKEN, "")).toBe(false);
  });
});

describe("OPS 白名单（AI#33：自省面从同一张表派生）", () => {
  it("opCatalog 与 OPS 同源——条数一致、每条自带 help/params（清单与真实现不可能漂移）", () => {
    const names = Object.keys(OPS);
    const catalog = opCatalog();
    expect(catalog).toHaveLength(names.length);
    for (const entry of catalog) {
      const op = OPS[entry.name];
      expect(op).toBeDefined();
      expect(entry.help).toBe(op.help);
      expect(entry.params).toEqual(op.params);
      expect(op.help.length).toBeGreaterThan(0);
    }
    expect(catalog.every((e) => e.params.every((p) => typeof p.name === "string" && typeof p.type === "string"))).toBe(true);
  });

  it("白名单面 = 本棒九条语义操作（两张皮共账）", () => {
    expect(Object.keys(OPS).sort()).toEqual(
      ["describe", "exec", "install", "log", "notifications", "notifyAction", "openTab", "ping", "tabs"].sort(),
    );
    expect(WHITELIST_VERSION).toBe(1);
  });

  it("exec / install / notifyAction 的必填参数声明与 run 的校验对得上（describe 说的就是实现的）", () => {
    const requiredOf = (name: string) => OPS[name].params.filter((p) => p.required).map((p) => p.name);
    expect(requiredOf("exec")).toEqual(["commandId"]);
    expect(requiredOf("install")).toEqual(["source"]);
    expect(requiredOf("notifyAction")).toEqual(["notificationId", "action"]);
    expect(requiredOf("openTab")).toEqual(["type"]);
  });

  it("coded 带机读 code（客户端按 code 分类，message 给人）", () => {
    const e = coded("EDEMO", "演示错误");
    expect(e.code).toBe("EDEMO");
    expect(e.message).toBe("演示错误");
    expect(e).toBeInstanceOf(Error);
  });
});

/**
 * AI#41 多窗口：目标壳窗裁决（纯函数）。真机读数（两窗实例 ping / 操作落在聚焦窗）在交接条里；
 * 这里钉「谁是目标」的规则——焦点优先、聚焦窗死了回退注册表首个、全死 = null（等窗循环的输入）。
 */
describe("pickShellWindow（AI#41：多窗口下的目标壳窗）", () => {
  /** 假壳窗——只带 alive 判定用得到的字段（真 BrowserWindow 要 Electron 运行时） */
  type FakeWin = { id: string; destroyed: boolean; wcDestroyed: boolean };
  const alive = (w: unknown): boolean => {
    const f = w as FakeWin | null | undefined;
    return !!f && !f.destroyed && !f.wcDestroyed;
  };
  const w = (id: string, dead?: "win" | "wc"): FakeWin => ({ id, destroyed: dead === "win", wcDestroyed: dead === "wc" });

  it("聚焦窗活着 ⇒ 目标是它（哪怕它不是注册表首个）", () => {
    const main = w("main");
    const ws2 = w("ws-2");
    expect(pickShellWindow({ focused: ws2 as never, shells: [main, ws2] as never, alive })).toBe(ws2);
  });

  it("无焦点（null / undefined）⇒ 回退注册表首个（主壳窗）", () => {
    const main = w("main");
    const ws2 = w("ws-2");
    expect(pickShellWindow({ focused: null, shells: [main, ws2] as never, alive })).toBe(main);
    expect(pickShellWindow({ focused: undefined, shells: [main, ws2] as never, alive })).toBe(main);
  });

  it("聚焦窗已销毁（窗关了 / webContents 没了）⇒ 回退注册表首个，不把请求发给死窗", () => {
    const main = w("main");
    const ws2 = w("ws-2");
    expect(pickShellWindow({ focused: w("ws-9", "win") as never, shells: [main, ws2] as never, alive })).toBe(main);
    // 首个也死了 ⇒ 顺位找下一只活的（注册表里跳过死窗）
    expect(pickShellWindow({ focused: w("ws-9", "wc") as never, shells: [w("main", "win"), ws2] as never, alive })).toBe(ws2);
  });

  it("一只活的都没有 ⇒ null（调用方据此进等窗循环，不是抛）", () => {
    expect(pickShellWindow({ focused: w("main", "win") as never, shells: [w("ws-2", "win")] as never, alive })).toBeNull();
    expect(pickShellWindow({ focused: null, shells: [], alive })).toBeNull();
  });
});
