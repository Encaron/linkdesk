/**
 * 机械检查：数据推流通道（serial.* / lsp:data / filesystem:changed:*）禁止裸 webContents.send。
 *
 * E5.8#6.5 纪律：数据推流唯一路径 = IpcBridge.broadcast（plugin:push 发壳+发池）。
 * 手动直发/双发漏一处 = 静默丢数据——serial/lsp/file 三 handler 的 E5.5 时代双发已归一化，
 * 此脚本防回归：任何裸 webContents.send(serial:* / lsp:data / filesystem:changed:*) = 违规。
 *
 * 白名单（这些通道直发是设计内，不在守卫集，天然豁免）：
 *   壳↔池 UI 指令：pool.* / window.* / keyboard.* / system:memory-pressure
 *   IpcBridge 自身：plugin:push（广播包装）/ config:changed / contextKey:changed（E5.6#2 双路径直发）
 *                  bridge:* / p2p:data（p2p 定向推流，不经 broadcast）
 *
 * 通道名从 electron/ipc/channels.ts 运行时解析——不改名漂移；审计永指单一权威源。
 * 用法：node scripts/check-ipc-audit.mjs（已挂 npm run check）
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 收集目录下所有 .ts 文件（排除 node_modules） */
function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && (extname(full) === ".ts" || extname(full) === ".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/** 从 offset 找匹配的右大括号——跳过字符串字面量 */
function findMatchingBrace(text, start) {
  let depth = 0;
  let inString = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") inString = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 递归解析 IPC 对象——产出 { 'IPC.serial.data': 'serial:data', ... } 映射 */
function parseIpcObject(body, prefix, map) {
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (i >= body.length) break;
    const keyStart = i;
    while (i < body.length && /\w/.test(body[i])) i++;
    const key = body.slice(keyStart, i);
    if (!key) { i++; continue; }
    while (i < body.length && /[\s:]/.test(body[i])) i++;
    if (body[i] === "{") {
      const end = findMatchingBrace(body, i);
      if (end === -1) break;
      parseIpcObject(body.slice(i + 1, end), `${prefix}.${key}`, map);
      i = end + 1;
    } else if (body[i] === "'" || body[i] === '"') {
      const quote = body[i];
      const valStart = ++i;
      while (i < body.length && body[i] !== quote) i++;
      map[`${prefix}.${key}`] = body.slice(valStart, i);
      i++;
    } else {
      i++; // 非字面量值（IPC 对象内不应出现，防御性跳过）
    }
  }
}

/** 解析 channels.ts → IPC 引用映射 */
function loadIpcMap() {
  const src = readFileSync(resolve(ROOT, "electron", "ipc", "channels.ts"), "utf-8");
  const map = {};
  const marker = src.indexOf("export const IPC = {");
  if (marker === -1) {
    console.error("❌ channels.ts 未找到 'export const IPC = {'——审计失效，需人工核对。");
    process.exit(1);
  }
  const objStart = src.indexOf("{", marker);
  const objEnd = findMatchingBrace(src, objStart);
  if (objEnd === -1) {
    console.error("❌ channels.ts IPC 对象括号不闭合——审计失效，需人工核对。");
    process.exit(1);
  }
  parseIpcObject(src.slice(objStart + 1, objEnd), "IPC", map);
  return map;
}

/** 数据推流守卫集——raw send 违规；其余通道天然白名单 */
function buildGuardValues(ipcMap) {
  const values = new Set();
  for (const ref of ["IPC.serial.data", "IPC.serial.stats", "IPC.serial.system", "IPC.lsp.data"]) {
    if (ipcMap[ref]) values.add(ipcMap[ref]);
  }
  return values;
}

/** 剥离行注释与块注释——注释里的示例 webContents.send 不算数（同 check-pool-css 模式）。
 *  注释内容以空格占位保留换行——剥离后行号仍对应原文件。 */
function stripComments(src) {
  let out = src;
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")); // 块注释（含跨行）
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // 行注释（避开 http:// 的 //）
  return out;
}

function main() {
  const ipcMap = loadIpcMap();
  const guardValues = buildGuardValues(ipcMap);

  const electronDir = resolve(ROOT, "electron");
  const files = collectTsFiles(electronDir);
  const violations = [];

  const sendRe = /webContents\.send\(\s*([^,\s\)]+)/g;
  // 引用路径 → 通道值；filesystemChanged(watcherId) 工厂调用 → 前缀守卫
  const isGuardedPrefix = (v) => v.startsWith("filesystem:changed:");

  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf-8"));
    const relPath = file.replace(ROOT + "/", "").replace(ROOT + "\\", "");
    let match;
    sendRe.lastIndex = 0;
    while ((match = sendRe.exec(code)) !== null) {
      const token = match[1];
      const lineNo = code.slice(0, match.index).split("\n").length;

      let channel = null;
      if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
        channel = token.slice(1, -1); // 字面量
      } else if (token.startsWith("IPC.")) {
        channel = ipcMap[token]; // IPC.x.y 引用 → 解析值
        if (!channel) {
          violations.push(
            `  ${relPath}:${lineNo}  ⚠  webContents.send(${token})——channels.ts 无此引用（拼错？），审计无法解析`,
          );
          continue;
        }
      } else if (token.startsWith("filesystemChanged(")) {
        channel = "filesystem:changed:<watcherId>"; // 工厂调用 → 前缀守卫
      } else {
        // 动态变量通道——审计无法验证，必须走 broadcast 或显式白名单
        violations.push(
          `  ${relPath}:${lineNo}  ⚠  webContents.send(非字面量通道: ${token})——无法审计，数据推流请走 IpcBridge.broadcast`,
        );
        continue;
      }

      if (guardValues.has(channel) || isGuardedPrefix(channel)) {
        violations.push(
          `  ${relPath}:${lineNo}  ⚠  webContents.send("${channel}") 数据推流直发违规——` +
          `唯一路径 = IpcBridge.broadcast（E5.8#6.5）`,
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(
      `\n❌ ${violations.length} 处数据推流直发/无法审计违规——serial.*/lsp:data/filesystem:changed:* 只经 broadcast。`,
    );
    process.exit(1);
  }

  console.log(`✅ IPC 审计干净——数据推流通道 ${files.length} 文件零裸 webContents.send。`);
}

main();
