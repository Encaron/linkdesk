#!/usr/bin/env node
// E6#15m 第二形态演示 LSP 服务器（虚构 demo-* 命名，硬约束 21）。
// 目的不是实现真语言服务，而是让打包态验证走通 spawn → initialize → didOpen → definition 全握手：
// 证明 SDK 打包器把 node_modules/.bin/demo-langserver shim 背后真入口随了包、dist plugin.json 的
// args 改写真路径后，node 能真跑起来回帧。零依赖（手写 Content-Length 帧），Windows/dev 通用。
"use strict";

const { stdin, stdout } = require("node:process");

let buf = "";
// uri -> 最近一次 didOpen 的文本（definition 在文档里找 "demo_def" 行，演示用）
const openedDocs = new Map();

function frame(obj) {
  const body = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
}

function respond(id, result) {
  stdout.write(frame({ jsonrpc: "2.0", id, result }));
}

function definitionFor(uri) {
  const text = openedDocs.get(uri) || "";
  const lines = text.split("\n");
  const line = lines.findIndex((l) => l.includes("demo_def"));
  return [{ uri, range: { start: { line: Math.max(line, 0), character: 0 }, end: { line: Math.max(line, 0), character: 1 } } }];
}

stdin.setEncoding("utf-8");
stdin.on("data", (chunk) => {
  buf += chunk;
  for (;;) {
    const m = /^Content-Length: (\d+)\r\n\r\n/.exec(buf);
    if (!m) return; // 帧头未齐，等更多数据
    const len = Number(m[1]);
    const headLen = m[0].length;
    if (buf.length < headLen + len) return; // 帧体未齐
    const body = buf.slice(headLen, headLen + len);
    buf = buf.slice(headLen + len);
    let msg;
    try { msg = JSON.parse(body); } catch { continue; }

    if (msg.method === "initialize") {
      respond(msg.id, {
        capabilities: { textDocumentSync: 1, definitionProvider: true },
        serverInfo: { name: "demo-langserver", version: "1.0.0" },
      });
    } else if (msg.method === "shutdown") {
      respond(msg.id, null);
    } else if (msg.method === "exit") {
      process.exit(0);
    } else if (msg.method === "textDocument/didOpen") {
      const td = msg.params && msg.params.textDocument;
      if (td) openedDocs.set(td.uri, td.text || "");
    } else if (msg.method === "textDocument/didChange") {
      const td = msg.params && msg.params.textDocument;
      const ch = msg.params && msg.params.contentChanges;
      if (td && ch && ch.length) openedDocs.set(td.uri, ch[ch.length - 1].text || "");
    } else if (msg.method === "textDocument/definition") {
      const uri = msg.params && msg.params.textDocument && msg.params.textDocument.uri;
      respond(msg.id, uri ? definitionFor(uri) : null);
    } else if (msg.id !== undefined) {
      respond(msg.id, null); // 其余请求一律回空（不认识的请求不卡握手）
    }
  }
});
stdin.on("end", () => process.exit(0));
