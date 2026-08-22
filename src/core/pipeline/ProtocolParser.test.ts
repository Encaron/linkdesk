import { describe, it, expect } from "vitest";
import { Parse } from "./ProtocolParser";

describe("ProtocolParser", () => {
  describe("Parse", () => {
    it("空字符串", () => {
      const r = Parse("");
      expect(r.messages).toEqual([]);
      expect(r.plainText).toBe("");
    });

    it("无方括号纯文本", () => {
      const r = Parse("Hello World");
      expect(r.messages).toEqual([]);
      expect(r.plainText).toBe("Hello World");
    });

    it("V3 协议：单字段", () => {
      const r = Parse("[chip_temp, 42.5]");
      expect(r.messages).toHaveLength(1);
      expect(r.messages[0].id).toBe("chip_temp");
      expect(r.messages[0].fields).toEqual(["42.5"]);
    });

    it("V3 协议：多字段", () => {
      const r = Parse("[pid_plot, P分量, 50.0]");
      expect(r.messages[0].id).toBe("pid_plot");
      expect(r.messages[0].fields).toEqual(["P分量", "50.0"]);
    });

    it("V3 协议：卡片定义 ! 前缀", () => {
      const r = Parse("[!chip_temp, gauge, 芯片温度, °C, 0, 100]");
      expect(r.messages[0].id).toBe("!chip_temp");
      expect(r.messages[0].fields).toEqual(["gauge", "芯片温度", "°C", "0", "100"]);
    });

    it("引号包裹的逗号不作为分隔符", () => {
      const r = Parse('[btn, "hello, world", down]');
      expect(r.messages[0].id).toBe("btn");
      expect(r.messages[0].fields).toEqual(["hello, world", "down"]);
    });

    it("多组方括号", () => {
      const r = Parse("[a, 1] text [b, 2]");
      expect(r.messages).toHaveLength(2);
      expect(r.messages[0].id).toBe("a");
      expect(r.messages[1].id).toBe("b");
      expect(r.plainText).toBe("text");
    });

    it("不匹配的方括号不作为协议解析", () => {
      const r = Parse("[incomplete");
      expect(r.messages).toEqual([]);
      expect(r.plainText).toBe("[incomplete");
    });

    it("空方括号", () => {
      const r = Parse("[]");
      expect(r.messages).toEqual([]);
    });

    it("V2 旧协议兼容", () => {
      const r = Parse("[sensor, temp, chip, 42.5]");
      expect(r.messages[0].id).toBe("sensor");
      expect(r.messages[0].fields).toEqual(["temp", "chip", "42.5"]);
    });
  });
});
