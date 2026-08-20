/**
 * serialHandlers 行为测试。
 * 不依赖 TerminalView 组件——直接测 RingBuffer + portOpenRef 的核心逻辑。
 * B24/B25/B26 回归防护。
 *
 * E5.8#28：模拟 handler 载荷升级为对象形（SerialDataPayload/SerialSystemPayload——
 * 对齐新 wire 契约 {portName, text|message}，旧 string 载荷已从推流面消失）。
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
  const portOpenRef = { current: true }; // 默认 true
  const pausedBuffer: string[] = [];

  const onSerialData = (payload: SerialDataPayload) => {
    if (!portOpenRef.current) return; // 关门则丢弃
    ringBuffer.write({ text: payload.text, type: "received" });
  };

  const onSerialSystem = (payload: SerialSystemPayload) => {
    const msg = payload.message;
    if (/Port opened|已打开/.test(msg)) {
      portOpenRef.current = true;
      pausedBuffer.length = 0;
    }
    if (/Port closed|关闭/.test(msg)) {
      portOpenRef.current = false;
      ringBuffer.drainAll();
    }
    ringBuffer.write({ text: msg, type: "system" });
  };

  return { ringBuffer, portOpenRef, pausedBuffer, onSerialData, onSerialSystem };
}

/** 构造系统消息载荷的简写——portName 与消息文本一致（对 open/close 格式：从 message 里挖口名） */
function sys(portName: string, message: string): SerialSystemPayload {
  return { portName, message };
}
/** 构造数据载荷的简写 */
function data(portName: string, text: string): SerialDataPayload {
  return { portName, text };
}

describe("serial handlers", () => {
  /* ── B24：关串口残留数据 ── */

  it("关闭后 serial-data 被拒绝（portOpenRef 门控）", () => {
    const { ringBuffer, portOpenRef, onSerialData, onSerialSystem } = createHandlers();

    onSerialSystem(sys("COM3", "---- 已打开串行端口 COM3 ----"));
    expect(portOpenRef.current).toBe(true);

    // 关闭
    onSerialSystem(sys("COM3", "---- 关闭串行端口 COM3 ----"));
    expect(portOpenRef.current).toBe(false);

    // 关闭后到达的数据——被拒绝，不报错
    onSerialData(data("COM3", "S502"));
    onSerialData(data("COM3", "S503"));

    // 清理后 buffer 里只有关闭消息（drainAll 清空了前面的）
    const items = ringBuffer.drainAll();
    const systems = items.filter((i) => i.type === "system");
    expect(systems.length).toBe(1);
    expect(systems[0].text).toContain("关闭");
  });

  it("关闭前在 buffer 中的数据被 drainAll 清空（不显示残留）", () => {
    const { ringBuffer, onSerialData, onSerialSystem } = createHandlers();

    onSerialData(data("COM3", "S500"));
    onSerialData(data("COM3", "S501"));
    onSerialSystem(sys("COM3", "---- 关闭串行端口 COM3 ----"));

    const received = ringBuffer.drainAll().filter((i) => i.type === "received");
    expect(received).toEqual([]); // S500/S501 被 drainAll 清掉了
  });

  /* ── B26：portOpenRef 初始值 + 正则 ── */

  it("默认 portOpenRef=true——标签页创建后即可接收（串口可能已打开）", () => {
    const { portOpenRef, onSerialData, ringBuffer } = createHandlers();

    expect(portOpenRef.current).toBe(true);
    onSerialData(data("COM3", "S500"));
    expect(ringBuffer.drainAll().length).toBe(1);
  });

  it("正则命中所有打开变体（中/英/不同格式）", () => {
    const { portOpenRef, onSerialSystem } = createHandlers();

    const variants = [
      sys("COM3", "---- 已打开串行端口 COM3 ----"),
      sys("COM3", "串口已打开 — COM3, 115200 baud"),
      sys("COM3", "Port opened — COM3"),
    ];

    for (const msg of variants) {
      portOpenRef.current = false;
      onSerialSystem(msg);
      expect(portOpenRef.current).toBe(true);
    }
  });

  it("正则命中所有关闭变体", () => {
    const { portOpenRef, onSerialSystem } = createHandlers();

    const variants = [
      sys("COM3", "---- 关闭串行端口 COM3 ----"),
      sys("COM3", "Port closed — COM3"),
    ];

    for (const msg of variants) {
      portOpenRef.current = true;
      onSerialSystem(msg);
      expect(portOpenRef.current).toBe(false);
    }
  });

  /* ── B25：暂停消息不重复（逻辑验证） ── */

  it("打开时重置暂停状态", () => {
    const { pausedBuffer, onSerialSystem } = createHandlers();
    pausedBuffer.push("old1", "old2");

    onSerialSystem(sys("COM3", "---- 已打开串行端口 COM3 ----"));
    expect(pausedBuffer).toEqual([]);
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
