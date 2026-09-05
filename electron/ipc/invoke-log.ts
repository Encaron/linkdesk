/**
 * invoke-log——E6#13g（1.2-5）：IPC handler 统一日志包装。
 *
 * 动机：主进程关键路径排障要能定位「哪个 channel、什么参数、耗时、错误堆栈」——
 * console.error 不进 %APPDATA%/linkdesk/protocol-debug.log（既有诊断面惯例，lsp-handlers.ts:144
 * 实证），必须直接写文件。新建 handler（#13 download/extract/update 族）从第一天走 loggedHandle，
 * 不在各 handler 内手写重复的 appendFileSync。
 *
 * 用法：`loggedHandle(IPC.plugins.download, async (_e, url) => { ... })` —— 内部注册 ipcMain.handle，
 * 自动记：入参摘要（字符串截断 / Buffer 只记字节数）+ 耗时 + 成功/失败。错误带堆栈 rethrow
 * （调用方语义不变——invoke reject 仍照常）。
 *
 * 铁律 19/20：注册者（调用本函数的人）各自持有 once-guard；本模块无监听器、无状态。
 */

import { app, ipcMain } from "electron";
import { appendFileSync } from "fs";
import * as path from "path";

/** 写主进程诊断日志——console.error 不进 protocol-debug.log，必须直写文件（lsp-handlers.ts 惯例） */
function writeIpcLog(tag: string, line: string): void {
  try {
    const logFile = path.join(app.getPath("userData"), "protocol-debug.log");
    const ts = new Date().toISOString();
    appendFileSync(logFile, `[${ts}] [main] [${tag}] ${line}\n`);
  } catch {
    /* 日志失败不阻断调用 */
  }
}

/** 单值摘要——长字符串截断、二进制只记字节数、深对象封顶，绝不 throw（循环引用等） */
function summarize(v: unknown, depth = 0): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  const t = typeof v;
  if (t === "string") {
    const s = v as string;
    return s.length > 160 ? `${JSON.stringify(s.slice(0, 160))}…(${s.length} chars)` : JSON.stringify(s);
  }
  if (t === "number" || t === "boolean") return String(v);
  if (t === "function") return "[Function]";
  if (t === "bigint") return `${String(v)}n`;
  if (t === "symbol") return "[Symbol]";
  if (Buffer.isBuffer(v)) return `Buffer(${v.byteLength}B)`;
  if (v instanceof ArrayBuffer) return `ArrayBuffer(${v.byteLength}B)`;
  if (ArrayBuffer.isView(v)) return `${(v as { constructor: { name: string } }).constructor.name}(${(v as { byteLength: number }).byteLength}B)`;
  if (depth >= 3) return "[deep]";
  if (Array.isArray(v)) {
    const inner = v.slice(0, 6).map((x) => summarize(x, depth + 1)).join(", ");
    return `[${inner}${v.length > 6 ? `, …+${v.length - 6}` : ""}]`;
  }
  if (t === "object") {
    try {
      const s = JSON.stringify(v);
      if (s === undefined) return "[unserializable]";
      return s.length > 240 ? `${s.slice(0, 240)}…(${s.length} chars)` : s;
    } catch {
      return `{${Object.keys(v as object).length} keys}`;
    }
  }
  return String(v);
}

/** args 数组摘要 */
function summarizeArgs(args: unknown[]): string {
  return args.length === 0 ? "(无参)" : args.map((a) => summarize(a)).join(", ");
}

/**
 * 注册带统一日志的 ipcMain.handle。签名/返回与裸 ipcMain.handle 全同——handler 内不用做任何日志。
 * 日志两条：入口（channel + args 摘要——耗时长的网络/fs 段挂死时可定位到哪一步）+ 出口（结果/耗时
 * 或错误 + 堆栈）。错误记完原样 rethrow。
 */
export function loggedHandle(
  channel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 签名须兼容 Electron IpcMain.handle 监听器（...args: any[]）；调用方显式标注具名参数依赖 any→具体型可赋（unknown[] 会反变炸调用方注解）
  fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const started = Date.now();
    const caller = (() => {
      try {
        const st = new Error().stack?.split("\n");
        // 栈第 3 行通常指向注册点文件（registerPluginXxxHandlers）——日志里可区分哪族 handler
        return st?.[3]?.trim().slice(0, 120) ?? "";
      } catch {
        return "";
      }
    })();
    writeIpcLog(`ipc:${channel}`, `→ 入 ${summarizeArgs(args)}${caller ? `  (${caller})` : ""}`);
    try {
      const result = await fn(event, ...args);
      const ms = Date.now() - started;
      // 结果只记形状不记内容——下载返回 zipPath 等敏感/大载荷不进日志
      const resShape =
        result === undefined ? "" :
        result === null ? " null" :
        typeof result === "object" && !Array.isArray(result) && !Buffer.isBuffer(result)
          ? ` {${Object.keys(result as object).length} keys}` :
          ` ${summarize(result).slice(0, 80)}`;
      writeIpcLog(`ipc:${channel}`, `← 出 ${ms}ms${resShape}`);
      return result;
    } catch (e) {
      const ms = Date.now() - started;
      const err = e instanceof Error ? e : new Error(String(e));
      writeIpcLog(`ipc:${channel}`, `✕ 错 ${ms}ms ${err.stack ?? err.message}`);
      throw err;
    }
  });
}
