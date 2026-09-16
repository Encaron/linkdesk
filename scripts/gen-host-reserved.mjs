/**
 * 宿主保留面账草案生成器（只读壳仓，产出 scripts/host-reserved.json）。
 * ⚠️ 这是「机制 A（宿主保留名账进 SDK）」的原型：真门禁要的是生成式 + 双向对账，
 *    本脚本只做**生成侧**的雏形，供第 0 格量爆炸半径与 1.31–1.38 评估轮复量用。
 * ⚠️ 跑法：node scripts/gen-host-reserved.mjs（它只写不读，改完壳仓命令/设置面须重跑）。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function walk(dir, f, out = []) {
  let e; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const x of e) {
    if (["node_modules", ".git", "dist"].includes(x.name)) continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) walk(p, f, out); else if (f(p)) out.push(p);
  }
  return out;
}

/* ① 宿主命令前缀 */
const prefix = new Set();
for (const f of walk(path.join(ROOT, "src", "core", "commands"), (x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
  for (const m of fs.readFileSync(f, "utf8").matchAll(/command:\s*"([a-zA-Z][^"]*)"/g)) {
    prefix.add(m[1].split(".")[0] + ".");
  }
}
/* ② 宿主 app.* 配置键 */
const keys = new Set();
for (const f of walk(path.join(ROOT, "src", "App", "config"), (x) => x.endsWith(".ts"))) {
  for (const m of fs.readFileSync(f, "utf8").matchAll(/"(app\.[a-zA-Z0-9_.]+)"/g)) keys.add(m[1]);
}
/* ③ 宿主伪 pluginId */
const pseudo = ["app"];
for (const f of walk(path.join(ROOT, "src", "App"), (x) => x.endsWith(".ts"))) {
  for (const m of fs.readFileSync(f, "utf8").matchAll(/registerConfiguration\(\s*"([a-z][a-z0-9-]*)"/g)) pseudo.push(m[1]);
}
/* ④ 宿主/共享组件写入 ＋ 宿主 when 读取的 context key */
const ctxWrite = new Set(), ctxRead = new Set();
for (const f of walk(path.join(ROOT, "src"), (x) => /\.tsx?$/.test(x) && !x.includes(".test."))) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/ContextKeyService\.setValue\(\s*["'`]([^"'`]+)["'`]/g)) ctxWrite.add(m[1]);
  for (const m of src.matchAll(/contextKey[?.]*\.set[?.]*\(\s*["'`]([^"'`]+)["'`]/g)) ctxWrite.add(m[1]);
  for (const m of src.matchAll(/when:\s*["'`]([^"'`]+)["'`]/g)) {
    for (const t of m[1].split(/[^A-Za-z0-9_]+/)) {
      if (!t || ["true", "false", "and", "or", "not", "in", "regex"].includes(t)) continue;
      if (/^[a-z]/.test(t)) ctxRead.add(t);
    }
  }
}
for (const k of ["activeEditor", "editorHasSelection", "editorCount"]) { ctxWrite.add(k); ctxRead.add(k); }
/* ⑤ 宿主兜底外观 id —— 从 registerFallbackThemes 体内取 id: "..."（配方 id ＋ 配色变体 id） */
const appearance = new Set();
{
  const f = path.join(ROOT, "src", "core", "services", "ui", "ThemeEngine", "registry.ts");
  const src = fs.readFileSync(f, "utf8");
  const body = src.slice(src.indexOf("export function registerFallbackThemes"), src.indexOf("export function registerFallbackThemes") + 1200);
  for (const m of body.matchAll(/\bid:\s*"([^"]+)"/g)) appearance.add(m[1]);
}
/* ⑤b updateActionable / updateButtonLabel —— 以常量注册（非字面量），补上 */
{
  const f = path.join(ROOT, "src", "core", "commands", "shell", "updateCommands.ts");
  for (const m of fs.readFileSync(f, "utf8").matchAll(/export const UPDATE_[A-Z_]*KEY\s*=\s*"([^"]+)"/g)) {
    ctxWrite.add(m[1]); ctxRead.add(m[1]);
  }
}

const out = {
  $comment: "宿主保留面账（草案·生成式）——非样式命名空间归一化机制 A 的原型产物。插件不得占用这些名字；改动本账 = 一次公共面决策。",
  commandPrefixes: [...prefix].sort(),
  configKeys: [...keys].sort(),
  pseudoPluginIds: [...new Set(pseudo)].sort(),
  contextKeys: [...new Set([...ctxWrite, ...ctxRead])].sort(),
  appearanceIds: [...appearance].sort(),
};
fs.writeFileSync(path.join(ROOT, "scripts", "host-reserved.json"), JSON.stringify(out, null, 2) + "\n");
console.log("命令前缀", out.commandPrefixes.length, JSON.stringify(out.commandPrefixes));
console.log("app.* 键", out.configKeys.length);
console.log("伪 pluginId", JSON.stringify(out.pseudoPluginIds));
console.log("context key", out.contextKeys.length, JSON.stringify(out.contextKeys));
console.log("宿主兜底外观 id", JSON.stringify(out.appearanceIds));
