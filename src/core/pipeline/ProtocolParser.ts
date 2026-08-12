/**
 * 协议解析器 — 从 V2 ProtocolParser.cs 直接翻译。
 * 从接收到的文本行中提取 [id,arg1,arg2,...] 格式的消息。
 *
 * V3 协议：`[卡片ID, 字段1, 字段2, ...]`（无 type/subType，ID 即路由 key）
 */

export interface ProtocolMessage {
  /** 卡片 ID（V2 的 Type） */
  id: string;
  /** 参数字段 */
  fields: string[];
}

export interface ParseResult {
  /** 解析出的协议消息列表 */
  messages: ProtocolMessage[];
  /** 方括号外的普通文本（保留原样用于接收区显示） */
  plainText: string;
}

export function Parse(rawLine: string): ParseResult {
  const result: ParseResult = { messages: [], plainText: "" };

  if (!rawLine) {
    result.plainText = rawLine ?? "";
    return result;
  }

  let plainText = "";
  let i = 0;
  const len = rawLine.length;

  while (i < len) {
    if (rawLine[i] === "[") {
      const start = i;
      const end = findClosingBracket(rawLine, i + 1);

      if (end >= 0) {
        const bracketContent = rawLine.substring(start + 1, end);
        const msg = parseBracketContent(bracketContent);
        if (msg) {
          result.messages.push(msg);
        }
        i = end + 1;
      } else {
        plainText += rawLine[i];
        i++;
      }
    } else {
      plainText += rawLine[i];
      i++;
    }
  }

  result.plainText = plainText.trim();
  return result;
}

/** 查找匹配的 ]，处理引号内的 ] 不算结束符 */
function findClosingBracket(text: string, start: number): number {
  let inQuotes = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "]" && !inQuotes) {
      return i;
    }
  }
  return -1;
}

/** 解析方括号内的内容 */
function parseBracketContent(content: string): ProtocolMessage | null {
  if (!content) return null;

  const args = splitArgs(content);
  if (args.length === 0) return null;

  return {
    id: args[0].trim(),
    fields: args.slice(1).map((f) => f.trim()),
  };
}

/**
 * 按逗号分割参数，处理双引号包裹的字段。
 * 引号内的逗号不作为分隔符，引号本身会被剥离。
 *
 * 示例：
 *   "0,0,\"hello,18\",24" → ["0","0","hello,18","24"]
 *   "P,0.5"               → ["P","0.5"]
 */
function splitArgs(content: string): string[] {
  const result: string[] = [];
  let i = 0;
  const len = content.length;
  let current = "";

  while (i < len) {
    const c = content[i];

    if (c === '"') {
      i++; // 跳过开始引号
      while (i < len) {
        if (content[i] === '"') {
          i++; // 跳过闭合引号
          break;
        }
        current += content[i];
        i++;
      }
    } else if (c === ",") {
      result.push(current);
      current = "";
      i++;
    } else {
      current += c;
      i++;
    }
  }

  result.push(current.trim());
  return result;
}
