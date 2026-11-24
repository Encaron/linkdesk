import { describe, expect, it } from "vitest";
import { SERIAL_CODINGS, decodeBytes } from "./serial-coding.js";

/** ASCII "ABC" */
const ASCII = Uint8Array.from([0x41, 0x42, 0x43]);
/** UTF-8 "中文" */
const UTF8_ZH = Uint8Array.from([0xe4, 0xb8, 0xad, 0xe6, 0x96, 0x87]);
/** GBK "中文"（GB2312 子集内） */
const GBK_ZH = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]);
/** Shift-JIS "テスト" */
const SJIS_TEST = Uint8Array.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]);

describe("SERIAL_CODINGS", () => {
  it("规范清单就是四档、顺序固定", () => {
    expect(SERIAL_CODINGS).toEqual(["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]);
  });
});

describe("decodeBytes", () => {
  it("空输入四档都回空串", () => {
    for (const coding of SERIAL_CODINGS) {
      expect(decodeBytes(new Uint8Array(), coding)).toBe("");
    }
  });

  it("纯 ASCII 四档结果一致", () => {
    for (const coding of SERIAL_CODINGS) {
      expect(decodeBytes(ASCII, coding)).toBe("ABC");
    }
  });

  it("UTF-8 中文", () => {
    expect(decodeBytes(UTF8_ZH, "UTF-8")).toBe("中文");
  });

  it("GB2312 中文（按 GBK 超集解码）", () => {
    expect(decodeBytes(GBK_ZH, "GB2312")).toBe("中文");
  });

  it("Shift-JIS 日文", () => {
    expect(decodeBytes(SJIS_TEST, "Shift-JIS")).toBe("テスト");
  });

  it("Latin-1 是严格 1:1，不是 windows-1252", () => {
    const s = decodeBytes(Uint8Array.from([0x80, 0xff]), "Latin-1");
    expect(s).toBe("\u0080\u00ff");
    // windows-1252 会把 0x80 解成 €（U+20AC）——若出现它，说明实现走错了解码器
    expect(s).not.toContain("\u20ac");
  });

  it("默认 lossy：非法 UTF-8 替换为 U+FFFD，不抛错", () => {
    expect(decodeBytes(Uint8Array.from([0xff, 0x41]), "UTF-8")).toBe("\uFFFDA");
  });

  it("strict:true 遇非法序列抛错", () => {
    expect(() => decodeBytes(Uint8Array.from([0xff, 0x41]), "UTF-8", { strict: true })).toThrow();
  });

  it("「自动」档的探针可组合出来（UTF-8 strict 失败 → GB2312 strict 成功）", () => {
    const auto = (data: Uint8Array): string => {
      try {
        return decodeBytes(data, "UTF-8", { strict: true });
      } catch {
        return decodeBytes(data, "GB2312", { strict: true });
      }
    };
    expect(auto(UTF8_ZH)).toBe("中文");
    expect(auto(GBK_ZH)).toBe("中文");
  });

  it("未知编码名（绕过类型的 JS 调用）抛 TypeError", () => {
    expect(() => decodeBytes(ASCII, "GB18030" as never)).toThrow(TypeError);
  });
});
