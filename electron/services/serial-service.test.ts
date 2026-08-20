/**
 * serial-service 服务层单测——E5.8#26 多口 Map 化行为验证。
 *
 * mock serialport（主进程硬件封装）——测纯服务层语义：
 *   端口共存（D1）/ 同口二开拒绝（D8）/ 唯一口语义（D2）/ getStatus 双形态（D5）/ 卸载连坐（D8）。
 * serialService 是模块单例——每用例 vi.resetModules() 重 import = 干净 Map，互不污染。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// serialport mock——实例级 open/close/flush 状态机 + list 静态。工厂内自含（vi.mock hoisted）。
vi.mock("serialport", () => {
  class MockSerialPort {
    static list = vi.fn(async () => []);
    isOpen = false;
    open(cb: (err: Error | null) => void): void {
      this.isOpen = true;
      cb(null);
    }
    close(cb: (err: Error | null) => void): void {
      this.isOpen = false;
      cb(null);
    }
    flush(cb: () => void): void {
      cb();
    }
    write(): void {
      /* no-op */
    }
    set(_opts: unknown, cb: (err: Error | null) => void): void {
      cb(null);
    }
    on(): MockSerialPort {
      return this;
    }
  }
  return { SerialPort: MockSerialPort };
});

type SerialServiceModule = typeof import("./serial-service");

let serialService: SerialServiceModule["serialService"];
let systems: string[];

beforeEach(async () => {
  vi.resetModules();
  ({ serialService } = await import("./serial-service"));
  systems = [];
  serialService.setCallbacks({
    onData: () => {},
    onStats: () => {},
    onSystem: (msg) => {
      systems.push(msg);
    },
  });
});

/** 打开端口的简写——ownerPluginId 可选（D8 资源归属） */
async function open(portName: string, ownerPluginId?: string): Promise<void> {
  await serialService.openPort({ portName, baudRate: 115200, ownerPluginId });
}

describe("serial-service 多口 Map 化（E5.8#26）", () => {
  it("端口共存——两个不同口可同时打开（D1）", async () => {
    await open("COM3");
    await open("COM4");

    const statuses = serialService.getStatus();
    expect(statuses).toHaveLength(2);
    expect(statuses.map((s) => s.portName).sort()).toEqual(["COM3", "COM4"]);
  });

  it("同口二开拒绝——不顶替先开者（D8）", async () => {
    await open("COM3");
    await expect(open("COM3")).rejects.toThrow("已被打开");
    // 错误提示走 onSystem（用户可见）
    expect(systems.join()).toContain("已被打开");
    // 先开者数据不断
    expect(serialService.getStatus("COM3").isOpen).toBe(true);
  });

  it("缺省唯一口语义——0 口抛未打开 / ≥2 口抛歧义（D2）", async () => {
    await expect(serialService.closePort()).rejects.toThrow("串口未打开");

    await open("COM3");
    await open("COM4");
    await expect(serialService.closePort()).rejects.toThrow("多串口已打开");

    // 有参精确关
    await serialService.closePort("COM3");
    expect(serialService.getStatus()).toHaveLength(1);
    // 已关口再查——抛未打开（失败可见性）
    expect(() => serialService.getStatus("COM3")).toThrow("串口未打开");
  });

  it("getStatus 双形态——无参全口数组 / 有参单口快照（D5）", async () => {
    await open("COM3");

    const statuses = serialService.getStatus();
    expect(Array.isArray(statuses)).toBe(true);
    expect(statuses[0]).toMatchObject({ portName: "COM3", isOpen: true });

    const single = serialService.getStatus("COM3");
    expect(Array.isArray(single)).toBe(false);
    expect(single).toMatchObject({ portName: "COM3", isOpen: true });
  });

  it("卸载连坐——closePortsByOwner 只关 owner 的口，幂等（D8）", async () => {
    await open("COM3", "serial-monitor");
    await open("COM4", "other-plugin");
    await open("COM5"); // 无归属——永不连坐

    await serialService.closePortsByOwner("serial-monitor");

    expect(serialService.getStatus().map((s) => s.portName).sort()).toEqual([
      "COM4",
      "COM5",
    ]);
    expect(() => serialService.getStatus("COM3")).toThrow("串口未打开");

    // 幂等：重复调用（插件主动关 + 连坐）no-op
    await serialService.closePortsByOwner("serial-monitor");
    expect(serialService.getStatus()).toHaveLength(2);
  });

  it("getPortOwners 只含声明归属的口——壳开的口永不进连坐名单", async () => {
    await open("COM3", "a-plugin");
    await open("COM4"); // 无归属（壳/老调用）

    expect(serialService.getPortOwners()).toEqual(["a-plugin"]);
  });
});
