/**
 * HEX 自动格式化——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 * 过滤非法字符 → 每两字符插空格 → 非法字符汇总成提示文案。t() 由调用方注入（保持 i18n 同源）。
 */

import { HEX_WARNING_MAX_CHARS } from "../../constants";

export function makeAutoFormatHex(t: (key: string, opts?: Record<string, unknown>) => string) {
  return (raw: string): { formatted: string; warning: string } => {
    const valid = raw.replace(/[^A-Fa-f0-9 ]/g, "");
    const invalid = raw.split("").filter((c) => !/[A-Fa-f0-9 ]/.test(c) && c !== "");

    const hex = valid.replace(/\s/g, "").toUpperCase();
    let formatted = "";
    for (let i = 0; i < hex.length; i++) {
      if (i > 0 && i % 2 === 0) formatted += " ";
      formatted += hex[i];
    }

    const warning = invalid.length > 0
      ? t("⚠ HEX 输入包含无效字符: {{chars}}", { chars: [...new Set(invalid)].slice(0, HEX_WARNING_MAX_CHARS).join(" ") })
      : "";

    return { formatted, warning };
  };
}
