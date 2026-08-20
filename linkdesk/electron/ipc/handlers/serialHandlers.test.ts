/**
 * serialHandlers 行为测试。
 * 不依赖 TerminalView 组件——直接测 RingBuffer + portFilter 的核心逻辑。
 * B24/B25/B26 回归防护。
 *
 * E5.8#28：模拟 handler 载荷升级为对象形（SerialDataPayload/SerialSystemPayload——
 * 对齐新 wire 契约 {portName, text|message}，旧 string 载荷已从推流面消失）。
 * E5.8#29：portOpenRef 全局门控删除——改由 portFilter 键控过滤（payload.portName 匹配会话口）。
 * 测试语义同步：B24 残留清空 / B26 变体正则不再挖口名（S12）/ 新增多口各收各的断言。
 */
import { describe, it, expect } from "vitest";
import { RingBuffer } from "../../../src/core/pipeline/RingBuffer";
import type { SerialDataPayload, SerialSystemPayload } from "../../../src/core/types/ipc/serial";

/* ── 模拟 handler 逻辑（与 index.tsx 一致） ── */

interface SerialEntry {
  text: string;
  type: "received" | "sent" | "system";
}

function createHandlers() {
  const ringBuffer = new RingBuffer<SerialEntry>(512);
  const pausedBuffer: string[] = [];
  const sessionPortRef = { current: "COM3" }; // #29：会话配置的口——portFilter 按它过滤

  /** E5.8#29：三态过滤——无 key→收 / 不匹配→滤 / 匹配→收（与 utils/portFilter.ts 同款内联模拟） */
  const matchesPort = (payloadPortName: string | undefined, sessionPort: string | null): boolean => {
    if (!payloadPortName) return true; // 无路由键——旧数据/单口，不过滤
    if (!sessionPort) return false;    // 本会话未配置端口——一律滤
    return payloadPortName === sessionPort;
  };

  const onSerialData = (payload: SerialDataPayload) => {
    // E5.8#29：portFilter 取代 portOpenRef 门控——本会话口匹配才收（他口数据滤掉）
    if (!matchesPort(payload.portName, sessionPortRef.current)) return;
    ringBuffer.write({ text: payload.text, type: "received" });
  };

  const onSerialSystem = (payload: SerialSystemPayload) => {
    const msg = payload.message;
    // E5.8#29（S12）：payload.portName 直接路由（不挖消息文本）——非本会话口只显示系统文本
    if (!matchesPort(payload.portName, sessionPortRef.current)) {
      ringBuffer.write({ text: msg, type: "system" });
      return;
    }
    if (/Port opened|已打开/.test(msg)) {
      pausedBuffer.length = 0;
    }
    if (/Port closed|关闭/.test(msg)) {
      ringBuffer.drainAll(); // B24：关闭时清空已缓冲数据
    }
    ringBuffer.write({ text: msg, type: "system" });
  };

  return { ringBuffer, pausedBuffer, sessionPortRef, onSerialData, onSerialSystem };
}

/** 构造系统消息载荷——portName 路由键独立于消息文本（#28 契约） */
function sys(portName: string, message: string): SerialSystemPayload {
  return { portName, message };
}
/** 构造数据载荷 */
function data(portName: string, text: string): SerialDataPayload {
  return { portName, text };
}

describe("serial handlers", () => {
  /* ── #29 portFilter：多口各收各的 ── */

  it("不同口的数据被滤——只收本会话口（portFilter 核心）", () => {
    const { ringBuffer, onSerialData } = createHandlers();

    onSerialData(data("COM13", "OTHER"));
    expect(ringBuffer.drainAll().length).toBe(0);

    onSerialData(data("COM3", "MINE"));
    expect(ringBuffer.drainAll().map((i) => i.text)).toEqual(["MINE"]);
  });

  it("无路由键载荷容错——旧数据照收（三态无 key→收）", () => {
    const { ringBuffer, onSerialData } = createHandlers();

    onSerialData({ text: "OLD" } as SerialDataPayload); // 无 portName（旧 string 载荷等价形）
    expect(ringBuffer.drainAll().length).toBe(1);
  });

  it("标签页未配端口 → 一律滤（会话口空）", () => {
    const { ringBuffer, onSerialData, sessionPortRef } = createHandlers();
    sessionPortRef.current = "";

    onSerialData(data("COM3", "X"));
    expect(ringBuffer.drainAll().length).toBe(0);
  });

  /* ── B24：关串口残留数据 ── */

  it("关闭时 drainAll 清空已缓冲数据（残留不显示）", () => {
    const { ringBuffer, onSerialData, onSerialSystem } = createHandlers();

    onSerialData(data("COM3", "S500"));
    onSerialData(data("COM3", "S501"));
    onSerialSystem(sys("COM3", "---- 关闭串行端口 COM3 ----"));

    const items = ringBuffer.drainAll();
    expect(items.filter((i) => i.type === "received")).toEqual([]); // 残留清空
    expect(items.filter((i) => i.type === "system")[0].text).toContain("关闭");
  });

  /* ── B26：打开/关闭变体正则（判断消息类型，不再挖口名——S12） ── */

  it("打开变体——重置暂停状态（不挖口名，payload.portName 路由）", () => {
    const { pausedBuffer, onSerialSystem } = createHandlers();

    const variants = [
      sys("COM3", "---- 已打开串行端口 COM3 ----"),
      sys("COM3", "串口已打开 — COM3, 115200 baud"),
      sys("COM3", "Port opened — COM3"),
    ];

    for (const v of variants) {
      pausedBuffer.push("old1", "old2");
      onSerialSystem(v);
      expect(pausedBuffer).toEqual([]);
    }
  });

  it("关闭变体——drainAll 清空数据", () => {
    const { ringBuffer, onSerialData, onSerialSystem } = createHandlers();

    const variants = [
      sys("COM3", "---- 关闭串行端口 COM3 ----"),
      sys("COM3", "Port closed — COM3"),
    ];

    for (const v of variants) {
      onSerialData(data("COM3", "D1"));
      onSerialSystem(v);
      const received = ringBuffer.drainAll().filter((i) => i.type === "received");
      expect(received).toEqual([]); // D1 被 drainAll 清掉
    }
  });

  it("非本会话口的系统消息只显示系统文本——数据照常滤（#29 多口）", () => {
    const { ringBuffer, onSerialData, onSerialSystem } = createHandlers();

    onSerialSystem(sys("COM13", "---- 已打开串行端口 COM13 ----"));
    onSerialData(data("COM13", "D1")); // 他口数据——滤

    const items = ringBuffer.drainAll();
    expect(items.filter((i) => i.type === "received")).toEqual([]);
    expect(items.filter((i) => i.type === "system")).toHaveLength(1); // 只显示系统文本
  });

  /* ── B25：暂停消息不重复 ── */

  it("打开时重置暂停状态", () => {
    const { pausedBuffer, onSerialSystem } = createHandlers();
    pausedBuffer.push("old1", "old2");

    onSerialSystem(sys("COM3", "---- 已打开串行端口 COM3 ----"));
    expect(pausedBuffer).toEqual([]);
  });

  /* ── 会话配置了口即可接收（#29：portOpenRef 初始位删除） ── */

  it("会话配置了口即可接收——无需先收打开消息", () => {
    const { ringBuffer, onSerialData } = createHandlers();

    onSerialData(data("COM3", "S500"));
    expect(ringBuffer.drainAll().length).toBe(1);
  });

  /* ── 系统消息写入 + 连续开关 ── */

  it("系统消息在 drainAll 之后写入——关闭消息是最后一条", () => {
    const { ringBuffer, onSerialSystem } = createHandlers();

    onSerialSystem(sys("COM3", "---- 关闭串行端口 COM3 ----"));

    const items = ringBuffer.drainAll();
    expect(items.length).toBe(1);
    expect(items[0].type).toBe("system");
    expect(items[0].text).toContain("关闭");
  });

  it("连续开关——第二轮数据正常，第一轮已清空", () => {
    const { ringBuffer, onSerialData, onSerialSystem } = createHandlers();

    // 第一轮
    onSerialSystem(sys("COM3", "---- 已打开串行端口 COM3 ----"));
    onSerialData(data("COM3", "D1"));
    onSerialSystem(sys("COM3", "---- 关闭串行端口 COM3 ----"));
    // → drainAll 清空 [打开, D1]，写 [关闭(1)]

    // 第二轮
    onSerialSystem(sys("COM3", "---- 已打开串行端口 COM3 ----"));
    onSerialData(data("COM3", "D2"));
    onSerialSystem(sys("COM3", "---- 关闭串行端口 COM3 ----"));
    // → drainAll 清空 [关闭(1), 打开, D2]，写 [关闭(2)]

    const items = ringBuffer.drainAll();
    const received = items.filter((i) => i.type === "received").map((i) => i.text);
    expect(received).toEqual([]); // D1、D2 都被各自的 drainAll 清了

    const systems = items.filter((i) => i.type === "system").map((i) => i.text);
    expect(systems).toEqual(["---- 关闭串行端口 COM3 ----"]); // 只有最后一轮关闭
  });

  it("只开不关——数据保留在 buffer 中", () => {
    const { ringBuffer, onSerialData, onSerialSystem } = createHandlers();

    onSerialSystem(sys("COM3", "---- 已打开串行端口 COM3 ----"));
    onSerialData(data("COM3", "D1"));
    onSerialData(data("COM3", "D2"));

    const items = ringBuffer.drainAll();
    const received = items.filter((i) => i.type === "received").map((i) => i.text);
    expect(received).toEqual(["D1", "D2"]);
  });
});
