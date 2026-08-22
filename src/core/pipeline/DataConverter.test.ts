import { describe, it, expect } from "vitest";
import { BytesToHex, HexToBytes, BytesToText, TextToBytes, ValidateHexString } from "./DataConverter";

describe("DataConverter", () => {
  describe("BytesToHex", () => {
    it("空数组返回空字符串", () => {
      expect(BytesToHex(new Uint8Array([]))).toBe("");
    });
    it("单字节转换", () => {
      expect(BytesToHex(new Uint8Array([0x0F]))).toBe("0F ");
      expect(BytesToHex(new Uint8Array([0xA3]))).toBe("A3 ");
    });
    it("多字节空格分隔", () => {
      expect(BytesToHex(new Uint8Array([0xFF, 0x00, 0xAB]))).toBe("FF 00 AB ");
    });
  });

  describe("HexToBytes", () => {
    it("空字符串返回空数组", () => {
      expect(HexToBytes("")).toEqual(new Uint8Array([]));
    });
    it("大写 HEX 解析", () => {
      expect(HexToBytes("FF 00 AB")).toEqual(new Uint8Array([0xFF, 0x00, 0xAB]));
    });
    it("小写 hex 解析", () => {
      expect(HexToBytes("ff 00 ab")).toEqual(new Uint8Array([0xFF, 0x00, 0xAB]));
    });
    it("无空格解析", () => {
      expect(HexToBytes("FF00AB")).toEqual(new Uint8Array([0xFF, 0x00, 0xAB]));
    });
    it("过滤非法字符", () => {
      expect(HexToBytes("FF,00;AB")).toEqual(new Uint8Array([0xFF, 0x00, 0xAB]));
    });
    it("奇数 hex 字符补零", () => {
      expect(HexToBytes("F")).toEqual(new Uint8Array([0x0F]));
    });
  });

  describe("BytesToText", () => {
    it("UTF-8 解码英文", () => {
      const bytes = new TextEncoder().encode("Hello");
      expect(BytesToText(bytes, "UTF-8", [])).toBe("Hello");
    });
    it("UTF-8 多字节中文", () => {
      const bytes = new TextEncoder().encode("你好");
      expect(BytesToText(bytes, "UTF-8", [])).toBe("你好");
    });
    it("不完整多字节序列保留在缓冲区", () => {
      const buf: number[] = [0xE4]; // 3字节 UTF-8 的第一字节
      const result = BytesToText(new Uint8Array([]), "UTF-8", buf);
      expect(result).toBe("");
      expect(buf.length).toBe(1); // 保留待后续字节
    });
  });

  describe("TextToBytes", () => {
    it("UTF-8 编码", () => {
      const bytes = TextToBytes("A", "UTF-8");
      expect(Array.from(bytes)).toEqual([0x41]); // E5.7#102：Uint8Array 比引用不比内容——展开后比内容
    });
  });

  describe("ValidateHexString", () => {
    it("纯 HEX 无非法字符", () => {
      expect(ValidateHexString("FF 00 AB")).toBe("");
    });
    it("合法字符包括空格和 ^", () => {
      expect(ValidateHexString("FF^00")).toBe("");
    });
    it("检测非法字符", () => {
      const invalid = ValidateHexString("FF,00;AB");
      expect(invalid).toContain(",");
      expect(invalid).toContain(";");
    });
  });
});
