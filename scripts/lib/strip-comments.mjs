/**
 * 注释剥离（**字符串感知**）——把行/块注释内容替换成等长空格（保留换行 ⇒ 剥离后偏移与行号不变），
 * 字符串字面量（含转义）原样保留。
 *
 * 两个消费者：
 *   · `check-ipc-audit.mjs`——扫描源文件的裸 `webContents.send`；以及 channels.ts 的 `loadIpcMap`
 *     （注释里的引号曾把括号配对吃坏、后段通道组从映射整体消失——2026-09-13 修 5.1 登记项）。
 *   · `check-namespace-matrix.mjs`——channels.ts 的 §3 通道计数器（同一文件、同一坑）。
 *
 * 🔴 必须字符串感知：旧正则版不认字符串——字符串里含 `//`（非 http:// 形态）或注释里含引号时
 *   会误伤/漏剥。单一实现，不许两处各写一份（jscpd 也正拦这种复制）。
 */
export function stripComments(src) {
  let out = "";
  let state = "normal"; // normal | line | block | string
  let quote = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === "normal") {
      if (ch === "/" && next === "/") { state = "line"; out += "  "; i++; continue; }
      if (ch === "/" && next === "*") { state = "block"; out += "  "; i++; continue; }
      if (ch === "'" || ch === '"' || ch === "`") { state = "string"; quote = ch; out += ch; continue; }
      out += ch;
    } else if (state === "line") {
      if (ch === "\n") { state = "normal"; out += ch; } else out += " ";
    } else if (state === "block") {
      if (ch === "*" && next === "/") { state = "normal"; out += "  "; i++; }
      else out += ch === "\n" ? "\n" : " ";
    } else {
      // 字符串内：转义与引号原样保留（不当地注释边界）
      if (ch === "\\") { out += ch + (next ?? ""); i++; continue; }
      if (ch === quote) state = "normal";
      out += ch;
    }
  }
  return out;
}
