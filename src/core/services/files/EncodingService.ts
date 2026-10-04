/**
 * 编码检测与转换服务——对标 VS Code encoding.ts。
 * E4 #85 / #119：file-tree 搜索 + editor 共享。
 *
 * 🔥 在核心——多消费方准入（file-tree 搜索 + editor ≥ 2）。
 * 纯逻辑，不涉 UI。状态栏编码切换由 editor 插件负责。
 *
 * VS Code 对标：src/vs/base/common/encoding.ts
 * 底层：TextDecoder/TextEncoder（Chromium 支持 GBK）+ iconv-lite（GBK 编码）
 */

import * as iconv from "iconv-lite";

/* ── BOM 常量 ── */

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16_LE = [0xff, 0xfe];
const BOM_UTF16_BE = [0xfe, 0xff];

/* ── 编码规范化 ── */

/** 将编码别名归一化为标准名 */
function normalize(encoding: string): string {
  const lower = encoding.toLowerCase().replace(/[-_]/g, "");
  if (lower === "utf8" || lower === "utf8bom") return "utf-8";
  if (lower === "utf16le" || lower === "utf16") return "utf-16le";
  if (lower === "utf16be") return "utf-16be";
  if (lower === "gbk" || lower === "gb2312" || lower === "gb18030" || lower === "cp936") return "gbk";
  return lower;
}

/* ── BOM 检测（原始字节） ── */

function startsWith(buffer: Uint8Array, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

/** 去除 BOM——返回去除 BOM 后的 buffer */
function stripBom(buffer: Uint8Array): Uint8Array {
  if (startsWith(buffer, BOM_UTF8)) return buffer.slice(3);
  if (startsWith(buffer, BOM_UTF16_LE) || startsWith(buffer, BOM_UTF16_BE)) return buffer.slice(2);
  return buffer;
}

/* ── UTF-8 有效性校验 ── */

function isValidUtf8(buffer: Uint8Array): boolean {
  let i = 0;
  while (i < buffer.length) {
    const b = buffer[i];
    if (b < 0x80) {
      i++;
      continue;
    }
    // 2-byte sequence: 110xxxxx 10xxxxxx
    if ((b & 0xe0) === 0xc0) {
      if (i + 1 >= buffer.length) return false;
      if ((buffer[i + 1] & 0xc0) !== 0x80) return false;
      i += 2;
      continue;
    }
    // 3-byte sequence: 1110xxxx 10xxxxxx 10xxxxxx
    if ((b & 0xf0) === 0xe0) {
      if (i + 2 >= buffer.length) return false;
      if ((buffer[i + 1] & 0xc0) !== 0x80) return false;
      if ((buffer[i + 2] & 0xc0) !== 0x80) return false;
      i += 3;
      continue;
    }
    // 4-byte sequence: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
    if ((b & 0xf8) === 0xf0) {
      if (i + 3 >= buffer.length) return false;
      if ((buffer[i + 1] & 0xc0) !== 0x80) return false;
      if ((buffer[i + 2] & 0xc0) !== 0x80) return false;
      if ((buffer[i + 3] & 0xc0) !== 0x80) return false;
      i += 4;
      continue;
    }
    // Invalid leading byte → not valid UTF-8
    return false;
  }
  return true;
}

/* ── GBK 特征检测 ── */

function hasGbkPattern(buffer: Uint8Array): boolean {
  let gbkBytes = 0;
  let totalNonAscii = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] < 0x80) continue; // ASCII — skip
    totalNonAscii++;

    // GBK first byte range: 0x81-0xFE
    if (buffer[i] >= 0x81 && buffer[i] <= 0xfe) {
      if (i + 1 < buffer.length) {
        const next = buffer[i + 1];
        // GBK second byte: 0x40-0x7E | 0x80-0xFE
        if ((next >= 0x40 && next <= 0x7e) || (next >= 0x80 && next <= 0xfe)) {
          gbkBytes++;
          i++; // consumed second byte
        }
      }
    }
  }

  // >50% of non-ASCII bytes form valid GBK pairs → likely GBK
  return totalNonAscii > 0 && gbkBytes / totalNonAscii > 0.5;
}

/* ── EncodingService ── */

export class EncodingService {
  /** 已知编码列表（供 UI 下拉选择） */
  static readonly knownEncodings = [
    { id: "utf8", label: "UTF-8" },
    { id: "utf8bom", label: "UTF-8 with BOM" },
    { id: "utf16le", label: "UTF-16 LE" },
    { id: "utf16be", label: "UTF-16 BE" },
    { id: "gbk", label: "GBK (GB2312/GB18030)" },
  ] as const;

  /**
   * 检测文件编码。
   * 检测顺序：BOM → UTF-8 有效性 → GBK 特征 → 默认 UTF-8。
   */
  static detect(buffer: Uint8Array): string {
    if (buffer.length === 0) return "utf8";

    // 1. BOM 检测
    if (startsWith(buffer, BOM_UTF8)) return "utf8bom";
    if (startsWith(buffer, BOM_UTF16_LE)) return "utf16le";
    if (startsWith(buffer, BOM_UTF16_BE)) return "utf16be";

    // 2. UTF-8 有效性检测
    if (isValidUtf8(buffer)) return "utf8";

    // 3. GBK 特征检测
    if (hasGbkPattern(buffer)) return "gbk";

    // 4. 默认 UTF-8
    return "utf8";
  }

  /**
   * 解码字节数组为文本。
   * Chromium TextDecoder 支持 UTF-8 / UTF-16 / GBK。
   */
  static decode(buffer: Uint8Array, encoding: string): string {
    const enc = normalize(encoding);
    const stripped = stripBom(buffer);
    // Chromium TextDecoder supports 'gbk' natively
    return new TextDecoder(enc).decode(stripped);
  }

  /**
   * 编码文本为字节数组。
   * TextEncoder 仅支持 UTF-8，GBK 编码需要 iconv-lite（未来增强）。
   */
  static encode(text: string, encoding: string): Uint8Array {
    const enc = normalize(encoding);
    if (enc === "utf-8") {
      return new TextEncoder().encode(text);
    }
    // E4V#40w——iconv-lite 编码 GBK/UTF-16
    // iconv-lite.encode() 返回 Node Buffer，是 Uint8Array 的子类 → 直接返回
    return iconv.encode(text, enc) as Uint8Array;
  }

  /**
   * 二进制判定（T1 二进制守卫——判定归壳，一处真相源）。
   *
   * 启发式，只读**首 8KB** 样本：
   *   1. 空 buffer → 文本（false）：空文件不是二进制。
   *   2. UTF-16 BOM → 文本（false）：UTF-16 正文天然半数 0x00，不能靠 NUL 判。
   *   3. 无 BOM 的 UTF-16 形态（NUL 按奇/偶位交替 ≥90%）→ 文本（false）：同上，防误杀。
   *   4. 出现任一 NUL(0x00) → 二进制（true）：文本编码里 0x00 无合法用途，是最强信号。
   *   5. 控制字符密度 >10% → 二进制（true）：兜住首 8KB 无 NUL 的二进制格式。
   *     控制字符 = 0x00–0x1F 去掉 \t \n \r \f（正文合法空白）；0x00 已由第 4 步收口。
   *   ⇒ 否则文本（false）。
   *
   * ⚠️ 命名空间：经 `lk.encoding.isBinary(bytes)` 暴露（不是 `lk.files`——插件面无 files 域）。
   */
  static isBinary(bytes: Uint8Array): boolean {
    const SAMPLE = 8192;
    if (bytes.length === 0) return false;

    // UTF-16 BOM：正文含大量 NUL，但确系文本
    if (startsWith(bytes, BOM_UTF16_LE) || startsWith(bytes, BOM_UTF16_BE)) return false;

    const sample = bytes.length > SAMPLE ? bytes.subarray(0, SAMPLE) : bytes;

    let nulCount = 0;
    let nulEven = 0;
    let controlCount = 0;

    for (let i = 0; i < sample.length; i++) {
      const b = sample[i];
      if (b === 0x00) {
        nulCount++;
        if (i % 2 === 0) nulEven++;
      } else if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) {
        // 0x00 已单独统计；此处为其余控制字符（0x01–0x08 / 0x0b / 0x0e–0x1f）
        controlCount++;
      }
    }

    // 无 BOM 的 UTF-16：NUL 全落在同一奇偶位 ⇒ 文本，不是二进制
    if (nulCount > 0) {
      const sameParity = Math.max(nulEven, nulCount - nulEven);
      if (sameParity / nulCount >= 0.9 && nulCount / sample.length > 0.15) return false;
      return true;
    }

    return controlCount / sample.length > 0.1;
  }

  /** 编码名是否为有效编码 */
  static isValidEncoding(name: string): boolean {
    try {
      const enc = normalize(name);
      if (enc === "utf-8") return true;
      // Check if TextDecoder supports this encoding
      new TextDecoder(enc);
      return true;
    } catch {
      return false;
    }
  }
}
