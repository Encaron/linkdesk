/**
 * diag-log 单测——E6#163（诊断日志「唯一写入口 ＋ 体积上限/轮转」）。
 *
 * 用户 2026-09-30 拍板的三件事逐条钉住：
 *   ① **唯一写入口**：行格式统一（模块加 ISO 时间戳，调用方只管前缀）——七处自写 appendFileSync 已归此处；
 *   ② **上限 ＋ 轮转**：越限即轮转（旧内容进 `.1`、现行文件从零起），且**只留一代**（更旧的 `.1` 被丢）
 *      ⇒ 磁盘天花板 = 2 × 上限（⛔ 不再「无限日志」）；
 *   ③ **失败不抛**：路径不可写时静默降级（诊断日志不许影响功能）。
 * 另两条运维语义：外部删除后能自愈（每次写入真读尺寸，无内存缓存）· 真实单例确实落在 userData。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// 🔴 共享桩必须先于 SUT import（见 electron-mock.ts 头注「纪律」）
import { electronMock } from "./electron-mock.js";

import { createDiagLog, diagLog, DIAG_LOG_CAP_BYTES, DIAG_LOG_NAME } from "./diag-log.js";

/** 固定时刻——断言「时间戳由模块统一加」而不是碰运气 */
const FIXED = new Date("2026-09-30T00:00:00.000Z");
const STAMP = "[2026-09-30T00:00:00.000Z]";

/** 单行字节数（`[时间戳] [t] x\n`）——用小上限精确控制第几行触发轮转 */
const LINE_BYTES = Buffer.byteLength(`${STAMP} [t] x\n`);

let dir = "";
let file = "";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "diag-log-"));
  file = path.join(dir, DIAG_LOG_NAME);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const read = (p: string): string => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

describe("格式与追加（唯一写入口）", () => {
  it("时间戳由模块统一加，调用方只给前缀；多行顺序追加", () => {
    const log = createDiagLog({ file: () => file, now: () => FIXED });
    log("[renderer] 一");
    log("[pool] 二");

    const lines = read(file).split("\n").filter(Boolean);
    expect(lines).toEqual([`${STAMP} [renderer] 一`, `${STAMP} [pool] 二`]);
  });
});

describe("体积上限与轮转", () => {
  it("越限即轮转：旧内容进 .1、现行文件从零起（只写新那一行）", () => {
    // 上限 2 行整——第 3 行写入前触发轮转
    const log = createDiagLog({ file: () => file, capBytes: LINE_BYTES * 2, now: () => FIXED });
    log("[t] x");
    log("[t] x");
    log("[t] x");

    expect(read(file)).toBe(`${STAMP} [t] x\n`);
    expect(read(`${file}.1`)).toBe(`${STAMP} [t] x\n${STAMP} [t] x\n`);
  });

  it("只留一代：第二次轮转把上一代 .1 丢掉（磁盘天花板 = 2 × 上限）", () => {
    const log = createDiagLog({ file: () => file, capBytes: LINE_BYTES * 2, now: () => FIXED });
    log("[t] a");
    log("[t] a"); // ↑ 这两行是第一代
    log("[t] b"); // 轮转①：.1 = a,a · 现行 = b
    log("[t] b"); // 现行 = b,b
    log("[t] c"); // 轮转②：.1 = b,b · 现行 = c

    const rolled = read(`${file}.1`);
    expect(rolled).toBe(`${STAMP} [t] b\n${STAMP} [t] b\n`);
    expect(rolled).not.toContain("[t] a"); // 第一代确实被丢了（不是「一直攒着」）
    expect(read(file)).toBe(`${STAMP} [t] c\n`);
    expect(read(file).length + rolled.length).toBeLessThanOrEqual(LINE_BYTES * 3); // 上限 + 单行尾巴
  });

  it("上限默认值 = 5 MB（连同 .1 天花板 10 MB）", () => {
    expect(DIAG_LOG_CAP_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("失败不抛 ＋ 外部删除自愈", () => {
  it("目录不存在 / 路径不可写 ⇒ 静默吞掉，不抛", () => {
    const log = createDiagLog({ file: () => path.join(dir, "not-exist", DIAG_LOG_NAME) });
    expect(() => log("[t] x")).not.toThrow();
  });

  it("外部删除后下一次写入自愈：重建文件且不误轮转", () => {
    const log = createDiagLog({ file: () => file, capBytes: LINE_BYTES * 2, now: () => FIXED });
    log("[t] x");
    log("[t] x");
    fs.rmSync(file); // 用户手删日志

    log("[t] x");
    expect(read(file)).toBe(`${STAMP} [t] x\n`);
    expect(fs.existsSync(`${file}.1`)).toBe(false); // 尺寸真读，没把「空文件」当越限
  });
});

describe("真实单例落在 userData", () => {
  it("diagLog 写的是 <userData>/protocol-debug.log", () => {
    electronMock.app.userData = dir;
    diagLog("[pool] hello");

    expect(fs.readFileSync(path.join(dir, DIAG_LOG_NAME), "utf8")).toContain("[pool] hello");
  });
});
