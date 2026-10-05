/**
 * EncodingService.isBinary 单测（T1 二进制守卫 · 阶段 2①）。
 *
 * 判据（[01 §T1](../../../../docs/04-软件更新/已落地/文件打开方式与贡献点/01-方案与落点契约.md)）：
 *   正例 pdf/exe/png 头 → true；负例 md/ts/json → false；
 *   **负控**：把 pdf 样例里的 NUL 摘掉 → 应判 false（证明 NUL 检查是承重的，不是摆设）。
 */
import { describe, it, expect } from "vitest";
import { EncodingService } from "./EncodingService";

const enc = new TextEncoder();
const u8 = (...bytes: number[]): Uint8Array => new Uint8Array(bytes);

/* ── 正例：真实文件头 + 二进制流 ── */

/** %PDF-1.4\n%âãÏÓ\n1 0 obj… stream\n<NUL×5>…endstream */
const PDF = u8(
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, // %PDF-1.4\n
  0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, //               %âãÏÓ\n
  0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, //   1 0 obj\n
  0x73, 0x74, 0x72, 0x65, 0x61, 0x6d, 0x0a, //         stream\n
  0x00, 0x00, 0x00, 0x00, 0x00, //                      NUL × 5
  0x0a, 0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d, // \nendstream
);

/** MZ 头（Windows PE） */
const EXE = u8(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00);

/** PNG 签名 + IHDR 长度字段 */
const PNG = u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52);

describe("EncodingService.isBinary", () => {
  it("正例：pdf / exe / png 头判为二进制", () => {
    expect(EncodingService.isBinary(PDF)).toBe(true);
    expect(EncodingService.isBinary(EXE)).toBe(true);
    expect(EncodingService.isBinary(PNG)).toBe(true);
  });

  it("负例：md / ts / json 文本判为非二进制", () => {
    expect(EncodingService.isBinary(enc.encode("# 标题\n\n正文 with **bold**\n\t缩进\n"))).toBe(false);
    expect(EncodingService.isBinary(enc.encode("export const x: number = 1;\n// 注释\n"))).toBe(false);
    expect(EncodingService.isBinary(enc.encode('{"a": 1, "b": [true, null]}\n'))).toBe(false);
  });

  it("负控：摘掉 NUL 后 pdf 样例应判假（NUL 检查承重）", () => {
    const noNul = PDF.filter((b) => b !== 0x00);
    expect(noNul.length).toBeLessThan(PDF.length); // 确实摘掉了东西
    expect(EncodingService.isBinary(noNul)).toBe(false);
  });

  it("文本的高字节（GBK 中文）不误判为二进制", () => {
    expect(EncodingService.isBinary(u8(0xd6, 0xd0, 0xce, 0xc4, 0x0a))).toBe(false);
  });

  it("空 buffer = 文本", () => {
    expect(EncodingService.isBinary(new Uint8Array(0))).toBe(false);
  });

  it("UTF-16 BOM 正文不误判为二进制", () => {
    const le = new Uint8Array([0xff, 0xfe, ...enc.encode("hello world")]);
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]);
    expect(EncodingService.isBinary(le)).toBe(false);
    expect(EncodingService.isBinary(be)).toBe(false);
  });

  it("无 BOM 的 UTF-16（NUL 同奇偶交替）不误判为二进制", () => {
    // "hello" 的 UTF-16LE：68 00 65 00 6c 00 6c 00 6f 00
    const leNoBom = u8(0x68, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00);
    expect(EncodingService.isBinary(leNoBom)).toBe(false);
  });

  it("首 8KB 之外的内容不参与判定（只看样本）", () => {
    const big = new Uint8Array(9000);
    big.fill(0x61); // 'a'
    big[8500] = 0x00; // 样本外
    expect(EncodingService.isBinary(big)).toBe(false);
  });

  it("首 8KB 内 NUL 出现在样本区即判二进制", () => {
    const big = new Uint8Array(9000);
    big.fill(0x61);
    big[100] = 0x00;
    expect(EncodingService.isBinary(big)).toBe(true);
  });
});
