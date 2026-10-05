import fs from "node:fs";
import path from "node:path";

/**
 * 宿主保留面账的**两类协议家族**（判据与常量同住一处、只此一份）——
 * `protocolIds`（宿主内置协议处理器 id）＋ `externalProtocols`（受控 openExternal 白名单，T4）。
 *
 * 为什么在 `scripts/lib/` 而不在 `gen-host-reserved.mjs` 本体：那是**档 A 800 行生产源码门禁**
 * （E6#0.6a）的临线文件，判据塞不进去——同 `host-reserved-public-keys.mjs` 的理由。
 */

/** 生产源码递归遍历（跳过 node_modules/.git/dist；判据回调决定收哪些文件）。 */
function walk(dir, f, out = []) {
  let e;
  try {
    e = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const x of e) {
    if (["node_modules", ".git", "dist"].includes(x.name)) continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) walk(p, f, out);
    else if (f(p)) out.push(p);
  }
  return out;
}

/**
 * **宿主内置协议 id** —— `registerProtocol({ id })` 的宿主写入点（E6#111b 判据⑦：插件协议 id 不得撞它）。
 * 今日唯一写入点 = 内置方括号协议；⛔ 这里只管**壳自己注册的协议处理器**，
 * 与下面「可交系统打开」的名单是两件事（别混一栏——`audit-nonnaming` 按本栏做 exact 撞名比对）。
 *
 * @param {string} root 仓库根
 * @returns {string[]} 协议 id，已排序
 */
export function collectProtocolIds(root) {
  const out = new Set();
  for (const f of walk(path.join(root, "src"), (x) => x.endsWith(".ts") && !x.includes(".test."))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/registerProtocol\s*\(\s*\{[\s\S]{0,400}?\bid\s*:\s*["']([^"']+)["']/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * 🆕 **受控 openExternal 的协议白名单**（文件打开方式与贡献点 **T4**／2026-10-05）。
 *
 * 单一真相源 = 壳源码 `electron/windows/external-links.ts` 的 `OPEN_EXTERNAL_PROTOCOLS`：
 * 它既是 `window.open` 外链路由的名单，也是插件面 `shell.openExternal` 的闸门
 * （主进程 handler 按它校验，不在名单 ⇒ Promise reject，失败可见）。
 *
 * 为什么它进账、而不是当一条普通常量：它决定**插件能借宿主的手打开什么**——
 * 一份**公开契约**（作者照它写 URL、第三方按它判自己的 URL 过不过）⇒ 必须进账、
 * 必须双向对账（有人往数组里塞 `file:` 而忘了重跑账 ⇒ `ledger-missing` 当场红）。
 *
 * ⚠️ 扫的是**壳源码**（`electron/`），不是 `src/`——本家族是账里唯一源自 `electron/` 的一条。
 *
 * @param {string} root 仓库根
 * @returns {string[]} 协议名（不含 `:`），已排序
 */
export function collectExternalProtocols(root) {
  let src = "";
  try {
    src = fs.readFileSync(path.join(root, "electron", "windows", "external-links.ts"), "utf8");
  } catch {
    src = "";
  }
  const m = src.match(/export const OPEN_EXTERNAL_PROTOCOLS\s*=\s*\[([^\]]*)\]/);
  const out = new Set();
  if (m) for (const s of m[1].matchAll(/["']([^"']+)["']/g)) out.add(s[1]);
  return [...out].sort();
}
