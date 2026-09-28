#!/usr/bin/env node
/**
 * 插件仓发现 —— **唯一真相源**。
 *
 * 出处：原住在 `scripts/audit-plugin-tests.mjs`（只报不拦尺，2026-09-26 落地）；2026-09-28 加
 * 「有视图零命令」尺时抽出——两把尺子必须用**同一套仓发现与同一套名单来源**，
 * ⛔ 复制一份 = 两把尺子必然漂移（同一只仓在一把尺里在场、另一把里缺席，而没有任何灯会亮）。
 *
 * 三件东西在这里各写一遍：
 *   ① `discoverPluginRepos` —— 容器两级内找 `<组>/<仓>/plugin.json`（容器本身是仓也认）；
 *   ② `officialPluginIds`  —— **官方仓名单唯一真相源** = `scripts/sync-plugin-agents.mjs` 的 FACTS 表；
 *   ③ `readManifestJson`   —— `plugin.json` 是 **JSONC**（作者可写注释与尾逗号），
 *      解析口径与壳侧 `src/pluginLoader/jsonc.ts` / SDK `validate.ts` 同款
 *      （`jsonc-parser`：`allowTrailingComma` + 允许注释）⇒ 审计尺与壳读到的**是同一份清单**。
 *
 * ⚠️ 只读：本文件与调用方都不写任何插件仓（第三方仓尤其）。
 */
import fs from "node:fs";
import path from "node:path";
import * as jsonc from "jsonc-parser";

/** 下钻时跳过的目录名（构建产物/依赖/版本库）——**模块内私有**：两把尺子只用本文件的
 *  `discoverPluginRepos`，⛔ 不该各自再拿一份名单去下钻（那正是本文件要治的「两份必然漂移」）。 */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "release", "resources"]);

/**
 * 容器两级内找 `<组>/<仓>/plugin.json`（也接受容器本身就是一只仓）。
 * @param {string} root 插件容器目录（如 E:/linkdesk-plugins）
 * @returns {{dir: string, id: string, group: string}[]} 按 id 排序
 */
export function discoverPluginRepos(root) {
  const isRepo = (d) => {
    try {
      return fs.statSync(path.join(d, "plugin.json")).isFile();
    } catch {
      return false;
    }
  };
  if (isRepo(root)) return [{ dir: root, id: path.basename(root), group: "" }];
  const out = [];
  let groups = [];
  try {
    groups = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const g of groups) {
    if (!g.isDirectory() || SKIP_DIRS.has(g.name)) continue;
    const gp = path.join(root, g.name);
    if (isRepo(gp)) {
      out.push({ dir: gp, id: g.name, group: "" });
      continue;
    }
    let kids = [];
    try {
      kids = fs.readdirSync(gp, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const k of kids) {
      if (!k.isDirectory() || SKIP_DIRS.has(k.name)) continue;
      const kp = path.join(gp, k.name);
      if (isRepo(kp)) out.push({ dir: kp, id: k.name, group: g.name });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 官方仓名单 = `scripts/sync-plugin-agents.mjs` 的 FACTS 表（唯一真相源）。
 * 读不到 ⇒ `null`（调用方降级：全部按官方报，并打一行警告）。
 * 不在表里的仓 = 第三方作者仓（只读报出，⛔ 不代改）。
 * @param {string} agentsScriptPath sync-plugin-agents.mjs 绝对路径
 * @returns {Set<string> | null}
 */
export function officialPluginIds(agentsScriptPath) {
  try {
    const text = fs.readFileSync(agentsScriptPath, "utf8");
    const start = text.indexOf("const FACTS = {");
    const end = text.indexOf("\n};", start);
    if (start < 0 || end < 0) return null;
    const ids = [...text.slice(start, end).matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z][\w-]*)): \{/gm)].map((m) => m[1] || m[2]);
    return ids.length ? new Set(ids) : null;
  } catch {
    return null;
  }
}

/**
 * 读 `plugin.json`（JSONC——允许注释与尾逗号）。
 * @returns {{ok: true, manifest: any} | {ok: false, why: string}}
 */
export function readManifestJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { ok: false, why: `读不到文件（${e.code || e.message}）` };
  }
  const errors = [];
  const manifest = jsonc.parse(raw, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    const first = errors[0];
    const { line, column } = offsetToLineCol(raw, first.offset);
    return { ok: false, why: `JSONC 语法错误：第 ${line} 行第 ${column} 列（code ${first.error}）` };
  }
  if (!manifest || typeof manifest !== "object") return { ok: false, why: "顶层不是对象" };
  return { ok: true, manifest };
}

/** offset → 1 起 {line, column}（与壳侧 jsonc.ts 同口径：CRLF 的 `\r` 算一列，可读性足够） */
function offsetToLineCol(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - (before.lastIndexOf("\n") + 1) + 1;
  return { line, column };
}
