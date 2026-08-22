/**
 * 数据转换 — 从 V2 DataConverter.cs 直接翻译，算法一字未改。
 * 仅将 byteBuffer 从 C# ref 参数改为可变参数传入。
 */

/** 字节数组 → HEX 字符串（每字节两字符大写 + 空格分隔） */
export function BytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += bytes[i].toString(16).toUpperCase().padStart(2, "0") + " ";
  }
  return result;
}

/** HEX 字符串 → 字节数组（过滤非法字符后每两个字符解析一个字节） */
export function HexToBytes(str: string): Uint8Array {
  const cleaned = str.replace(/[^A-Fa-f0-9]/g, "");
  const len = Math.ceil(cleaned.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const hex = cleaned.substring(i * 2, i * 2 + 2);
    bytes[i] = parseInt(hex || "0", 16);
  }
  return bytes;
}

/**
 * 字节数组 → 文本（支持 GBK 和 UTF-8 多字节解码）。
 * byteBuffer：外部维护的累积缓冲区（方法会修改它）。
 */
export function BytesToText(
  bytes: Uint8Array,
  encoding: string,
  byteBuffer: number[],
): string {
  const byteDecode: number[] = [];

  for (const b of bytes) {
    byteBuffer.push(b);
  }

  while (byteBuffer.length > 0) {
    if (encoding === "GBK") {
      if (byteBuffer[0] < 0x80) {
        byteDecode.push(byteBuffer.shift()!);
      } else {
        if (byteBuffer.length >= 2) {
          byteDecode.push(byteBuffer.shift()!);
          byteDecode.push(byteBuffer.shift()!);
        } else {
          break; // 不够2字节，等下次
        }
      }
    } else {
      // UTF-8
      const b0 = byteBuffer[0];
      if ((b0 & 0x80) === 0x00) {
        byteDecode.push(byteBuffer.shift()!);
      } else if ((b0 & 0xe0) === 0xc0) {
        if (byteBuffer.length >= 2) {
          byteDecode.push(byteBuffer.shift()!);
          byteDecode.push(byteBuffer.shift()!);
        } else {
          break;
        }
      } else if ((b0 & 0xf0) === 0xe0) {
        if (byteBuffer.length >= 3) {
          byteDecode.push(byteBuffer.shift()!);
          byteDecode.push(byteBuffer.shift()!);
          byteDecode.push(byteBuffer.shift()!);
        } else {
          break;
        }
      } else if ((b0 & 0xf8) === 0xf0) {
        if (byteBuffer.length >= 4) {
          byteDecode.push(byteBuffer.shift()!);
          byteDecode.push(byteBuffer.shift()!);
          byteDecode.push(byteBuffer.shift()!);
          byteDecode.push(byteBuffer.shift()!);
        } else {
          break;
        }
      } else {
        byteDecode.push(byteBuffer.shift()!);
      }
    }
  }

  return new TextDecoder(encoding.toLowerCase() === "gbk" ? "gbk" : "utf-8").decode(
    new Uint8Array(byteDecode),
  );
}

/** 文本 → 字节数组（按指定编码） */
export function TextToBytes(_str: string, _encoding: string): Uint8Array {
  return new TextEncoder().encode(_str);
}

/**
 * 检查 HEX 字符串中被 HexToBytes 过滤掉的无效字符。
 * 返回无效字符集合（去重），无则返回空字符串。
 */
export function ValidateHexString(str: string): string {
  const invalid = new Set<string>();
  for (const c of str) {
    if (
      (c >= "0" && c <= "9") ||
      (c >= "A" && c <= "F") ||
      (c >= "a" && c <= "f") ||
      c === " " ||
      c === "^"
    ) {
      continue;
    }
    invalid.add(c);
    if (invalid.size >= 10) break;
  }
  return invalid.size === 0 ? "" : [...invalid].join(" ");
}
