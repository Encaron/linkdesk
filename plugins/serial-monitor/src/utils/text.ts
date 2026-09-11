/**
 * 文本处理纯函数——E6#87b 从 src/index.tsx 搬出（只搬不改）。
 */

/** E5.8#30.19b：不可见字符 → 可见符号（Unicode Control Pictures，␀-␟/␡/␉/␊/␍）。
 *  渲染时转义，原始数据不动（导出/过滤/快照仍走原始文本）。 */
export function escapeInvisible(s: string): string {
  return s.replace(/[\x00-\x1F\x7F]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code === 0x09) return "␉"; // TAB
    if (code === 0x0A) return "␊"; // LF
    if (code === 0x0D) return "␍"; // CR
    if (code === 0x7F) return "␡"; // DEL
    return String.fromCharCode(0x2400 + code); // 其余 C0 控制符
  });
}

/** E5.8#30.20：文件名消毒——Windows 非法文件名字符（\ / : * ? " < > |）与控制字符 → "_"（防路径穿越 + 防非法文件名）。 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").replace(/[\x00-\x1F\x7F]/g, "_").trim();
  return cleaned || "serial";
}
