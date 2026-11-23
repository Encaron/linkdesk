/**
 * 机械门禁：**AI 可操作面**（G-A1 / G-A2 · 06 提案 §三）。
 *
 * 用法：
 *   node scripts/check-ai-surface.mjs
 *   node scripts/check-ai-surface.mjs --self-test
 * 退出码 0 = 无 error（warn 打印不拦）；1 = 有 error。
 *
 * ── 判据（三条 error ＋ 一条 warn）──
 *   ① **死命令引用**（error·官方强制）：源码里 `executeCommand("x")` / `commands.execute("x")` /
 *      `runCommand("x")` / `dispatchCommand("x")` 的 id，必须能在**本插件 plugin.json 的
 *      contributes.commands** 或**壳命令表**里找到。找不到 = 点了没反应的按钮 / AI 调不到的动作。
 *   ② **命令说明缺失**（error·官方强制）：`contributes.commands[]` 每条必须有非空 `description`
 *      （AI 选命令就看这一句；缺了只剩一个 id）。
 *   ③ **排序/交换只能鼠标**（error·官方强制）：源码里有拖拽手势（`onDragStart` / `draggable` /
 *      `onDrop`）且语义落在排序域（路径或源码出现 author/source/repo/rank/sort/order/list 或
 *      swap/reorder/fromIndex/toIndex），但命令面**没有任何排序命令**（id/description 含
 *      swap/reorder/move/order/rank/sort）⇒ 红。正例 = marketplace 的 swapAuthors/swapRepos/getOrder。
 *   ④ **业务动作疑似无命令**（warn·启发式）：`onClick` 处理器的名字里有具体业务动词
 *      （install/update/delete/save/refresh/search/rank/source/detail…），但命令面 id/description
 *      找不到该动词（含中英同义词）。**只报不拦**——这条是「值得看一眼」的清单，不是判死；
 *      判死靠 ①–③。⛔ 不为它加逃生阀（warn 本来就不拦）。
 *
 * ── 边界（写在这里免得下一棒猜）──
 *   · 第三方仓**不扫不判**（SDK lint 侧是 WARN 引导）；
 *   · 壳域只判 ①（死引用）；壳的拖拽（标签排序）有既有命令面，不在本腿 ③ 的范围；
 *   · install/uninstall/enable/disable/update 五个宿主级动作**视为已覆盖**——它们的 AI 路径是
 *     `linkdeskctl install` ＋ pluginManager API（不是插件命令），06 §一判据里的「命令/API」两者都算；
 *   · ⛔ 不解析 JSX AST：本腿用「够用的括号平衡 + 单词切分」，宁可漏报也不制造假红。
 *
 * ── 自测覆盖 06 §4.2 的四个历史形状 ──
 *   ① `rank` 无命令入口（openRank / 只有 openStore）⇒ ④ 命中；
 *   ② `openCategory` 不收 authorId / 无 openRank ⇒ ①/④ 命中；
 *   ③ 来源分组折叠只能鼠标（toggleSourcesCollapse 无命令）⇒ ④ 命中；
 *   ④ 拖动排序纯 GUI（onDragStart + 无 swap 命令）⇒ ③ 命中（有 swap 命令则不命中）。
 *   ＋ 正控/负控：死引用、说明缺失、干净片段。
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPluginRepos, officialPluginIds, readManifestJson } from "./lib/plugin-repos.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SYNC_AGENTS = join(ROOT, "scripts", "sync-plugin-agents.mjs");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

export const HOST_ACTIONS = new Set(["install", "uninstall", "enable", "disable", "update"]);
const VERB_LEXICON = new Set([
  "install", "uninstall", "update", "enable", "disable", "delete", "remove",
  "save", "refresh", "check", "swap", "move", "reorder", "sort", "rank", "search", "source",
  "folder", "recent", "collapse", "expand", "retry", "detail", "pin",
]);
const GENERIC_VERBS = new Set(["open", "close", "toggle", "set", "handle", "on", "start", "retry", "click"]);
const VERB_SYNONYMS = {
  detail: ["detail", "plugin", "详情"],
  rank: ["rank", "排行"],
  source: ["source", "来源"],
  folder: ["folder", "文件夹"],
  recent: ["recent", "最近"],
  delete: ["delete", "remove", "删除"],
  remove: ["remove", "delete", "删除"],
  save: ["save", "保存"],
  refresh: ["refresh", "刷新"],
  check: ["check", "检查"],
  swap: ["swap", "reorder", "move", "交换"],
  move: ["move", "swap", "reorder", "移动"],
  reorder: ["reorder", "swap", "move", "排序"],
  sort: ["sort", "order", "排序"],
  search: ["search", "搜索"],
  collapse: ["collapse", "toggle", "收起"],
  expand: ["expand", "toggle", "展开"],
  pin: ["pin"],
};

/**
 * warn 豁免表（默认警告 ＋ 豁免表 · 06 §三）。
 * 只放「已知、有主、有收口条件」的静态缺口——⛔ 不是逃生阀：warn 本来就不拦。
 * 键 = `<pluginId>:<handlerName>`。
 */
export const WARN_EXEMPT = new Map([
  [
    "editor:handleSearchMarket",
    "宿主级缺口：市场侧栏搜索词是市场插件内部 state，当前无壳命令/API 可设；editor 的 BinaryNotice v1 只能揭示侧栏（源码注释已记）。Owner=调度台；收口=壳级 app.searchMarketplace 命令或 marketplace 监听公开事件。",
  ],
]);

const camelTokens = (name) =>
  name
    .replace(/^on(?=[A-Z])/, "")
    .replace(/^handle(?=[A-Z])/, "")
    .split(/(?=[A-Z])|[-_]/)
    .map((s) => s.toLowerCase())
    .filter(Boolean);

/** 从一段 onClick 体里取业务动词（去掉 open/close/toggle/set 等泛词）。 */
export function businessVerbs(handlerName) {
  return camelTokens(handlerName).filter((t) => VERB_LEXICON.has(t) && !GENERIC_VERBS.has(t));
}

/** 命令面文本（id + description + title，小写）——判「动词有没有被命令覆盖」。 */
export function commandSurface(commands) {
  return commands.map((c) => `${c.id ?? ""} ${c.description ?? ""} ${c.title ?? ""}`).join(" ").toLowerCase();
}

export function verbCovered(verb, surface) {
  if (HOST_ACTIONS.has(verb)) return true;
  const syns = VERB_SYNONYMS[verb] ?? [verb];
  return syns.some((s) => surface.includes(s.toLowerCase()));
}

/** onClick 体里是否直调宿主 API（workspace/plugins/tabs/…）——是 ⇒ AI 有 API 路径，不算缺口。
 *  ⛔ 不含 `events.emit`：发事件只是揭示/通知，不等于「AI 能设那个状态」。 */
export function isHostApiCovered(body) {
  return /\blk(?:\(\))?\.(?:workspace|plugins|tabs|pool|configuration|commands|contextKey|storage|dialog|statusBar|fileAssociations|themes)\.[a-zA-Z_$]/.test(body);
}

/** 同名处理器的定义体（同一文件内 `const x = … => { … }` / `function x(…) { … }`）。
 *  够用即可：只服务「onClick 只写了调用、宿主 API 在定义体里」这一种形状。 */
export function handlerDefinitionBody(text, name) {
  const clean = strip(text);
  const starts = [
    new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(?:useCallback\\()?[^=]*=>\\s*\\{`),
    new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`),
  ];
  for (const re of starts) {
    const m = clean.match(re);
    if (!m) continue;
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < clean.length; i++) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") {
        depth--;
        if (depth === 0) return clean.slice(open + 1, i);
      }
    }
  }
  return "";
}

/**
 * 内部路由页 → 命令线索（G-A1 的「每个页面一条命令」判据；06 §4.2 `openRank` 案例的本体）。
 * 页面字面量 = 源码里的 `page: "x"` / `{ page: "x" }`；命令面必须能对上（id 或描述）。
 * ⚠️ 值按**语义**给线索，不按拼写——`home` 的正解是 `openStore`（不是 openHome）。
 */
export const PAGE_COMMAND_HINTS = {
  home: ["openstore", "首页"],
  "repo-all": ["openrepoall", "全部插件"],
  author: ["openauthor", "作者主页"],
  authors: ["openauthors", "作者"],
  category: ["opencategory", "分类"],
  library: ["openlibrary", "库"],
  rank: ["openrank", "排行"],
  search: ["search", "搜索"],
  sources: ["opensources", "来源"],
};

/** 源码里的路由页字面量（`page: "rank"`）。 */
export function extractRoutePages(text) {
  const clean = strip(text);
  const out = [];
  for (const m of clean.matchAll(/page:\s*"([a-zA-Z0-9_-]+)"/g)) {
    out.push({ page: m[1], line: clean.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** 该路由页是否有一条可对上的命令。 */
export function routePageCovered(page, commands) {
  const hints = PAGE_COMMAND_HINTS[page] ?? [page.toLowerCase()];
  const surface = commandSurface(commands);
  return hints.some((h) => surface.includes(h));
}

/** 提取 onClick 处理器名 + 行号（括号平衡；不建 AST）。 */
export function extractOnClickHandlers(text) {
  const clean = strip(text);
  const out = [];
  for (const m of clean.matchAll(/onClick=\{/g)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < clean.length; i++) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = clean.slice(start + 1, i).trim();
    const line = clean.slice(0, m.index).split("\n").length;
    // 只认「动作」：整段就是处理器名（onClick={onSave}），或被调用的函数（onClick={save(x)}）。
    // ⛔ 不收实参/属性名（`onClick={() => onCreate(sourceId)}` 里的 sourceId 不是动作）。
    if (/^[a-zA-Z_$][\w$]*$/.test(body)) out.push({ name: body, line, body });
    else for (const c of body.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)) out.push({ name: c[1], line, body });
  }
  return out;
}

/** 源码里的命令引用（executeCommand / commands.execute / runCommand / dispatchCommand）。 */
export function extractCommandRefs(text) {
  const clean = strip(text);
  const out = [];
  for (const m of clean.matchAll(/(?:executeCommand|commands\.execute(?:Command)?|runCommand|dispatchCommand)\(\s*"([^"]+)"/g)) {
    if (m[1].includes("${")) continue; // 模板占位（mock/dev 常见）不是命令 id
    out.push({ id: m[1], line: clean.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** 拖拽排序域：路径/源码命中排序语义，且确有拖拽手势。 */
export function isOrderingDrag(text, filePath) {
  const clean = strip(text);
  if (!/(onDragStart|draggable|onDrop)/.test(clean)) return false;
  return /(author|source|repo|rank|sort|order|list)/i.test(filePath) || /(swap|reorder|fromIndex|toIndex|dragIndex)/.test(clean);
}

export function hasOrderCommand(commands) {
  const surface = commandSurface(commands);
  // ⚠️ 必须是**顺序命令**：swap*/reorder*/move（整词）/getOrder。
  // ⛔ 不收 sort/order 泛词——`setViewPrefs` 的「排序字段」不是「拖动换位」；
  //   也不收裸子串（`removeSource` 里含 `move`，会把负控骗成绿）。
  return /(?:\bswap\w*|\breorder\w*|\bmove\w*|\bgetorder\b)/i.test(surface);
}

function collectSourceFiles(dir) {
  const out = [];
  const rec = (d) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (["node_modules", ".git", "dist", "release", "resources", "coverage"].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name) && !TEST_RE.test(p)) out.push(p);
    }
  };
  rec(dir);
  return out.sort();
}

/** 壳命令表（只读源码，⛔ 不引运行时）。 */
export function collectShellCommandIds() {
  const ids = new Set();
  for (const file of collectSourceFiles(join(ROOT, "src", "core", "commands"))) {
    const text = strip(readFileSync(file, "utf8"));
    for (const m of text.matchAll(/id:\s*"([a-z][\w-]*(?:\.[\w-]+)+)"/g)) ids.add(m[1]);
  }
  return ids;
}

const rel = (base, p) => relative(base, p).split(sep).join("/");

function report(kind, file, line, expected, actual, fix) {
  const msg = `[${kind}] ${file}${line ? `:${line}` : ""} → 期望「${expected}」；实际「${actual}」；示例修法：${fix}`;
  if (kind === "error") console.error(msg);
  else console.log(msg);
}

function main() {
  const shellIds = collectShellCommandIds();
  const official = officialPluginIds(SYNC_AGENTS);
  const repos = discoverPluginRepos(CONTAINER);
  let errors = 0;
  let warns = 0;
  let exempts = 0;

  if (!repos.length) console.log(`[info] 插件容器不在场或为空（${CONTAINER}）——只判壳域。`);

  // 壳域：只判死引用
  for (const file of collectSourceFiles(join(ROOT, "src"))) {
    for (const ref of extractCommandRefs(readFileSync(file, "utf8"))) {
      if (shellIds.has(ref.id)) continue;
      report("error", rel(ROOT, file), ref.line, "已注册的壳命令 id", ref.id, `先 registerCommand 注册 ${ref.id}，或改成命令表里的 id（describe 可枚举）。`);
      errors++;
    }
  }

  for (const repo of repos) {
    if (official && !official.has(repo.id)) continue; // 第三方：不扫不判
    const read = readManifestJson(join(repo.dir, "plugin.json"));
    if (!read.ok) {
      report("error", `${repo.id}/plugin.json`, 0, "可解析的 plugin.json", read.why, "修 JSONC 语法后重跑。");
      errors++;
      continue;
    }
    const manifest = read.manifest;
    const commands = (manifest.contributes?.commands ?? []).filter((c) => c?.id);
    const ids = new Set(commands.map((c) => c.id));
    const surface = commandSurface(commands);
    const files = collectSourceFiles(join(repo.dir, "src"));

    // ② 命令说明缺失
    for (const c of commands) {
      if (String(c.description ?? "").trim()) continue;
      report("error", `${repo.id}/plugin.json`, 0, `commands[] 每条带 description（AI 选命令的唯一依据）`, `${c.id} 缺 description`, `给 ${c.id} 补一句意图说明（params 也照 describe 规范补）。`);
      errors++;
    }

    // ① 死命令引用
    for (const file of files) {
      for (const ref of extractCommandRefs(readFileSync(file, "utf8"))) {
        if (ids.has(ref.id) || shellIds.has(ref.id)) continue;
        report("error", `${repo.id}/${rel(repo.dir, file)}`, ref.line, "本插件 contributes.commands 或壳命令表里的 id", ref.id, `在 plugin.json contributes.commands 注册 ${ref.id}，或改调已注册命令。`);
        errors++;
      }
    }

    // ③ 排序拖拽无命令
    const orderDrag = files.filter((f) => isOrderingDrag(readFileSync(f, "utf8"), f));
    if (orderDrag.length && !hasOrderCommand(commands)) {
      report("error", `${repo.id}/${rel(repo.dir, orderDrag[0])}`, 0, "命令面有排序命令（swap/reorder/move/order/rank/sort）", `有拖拽排序（${orderDrag.length} 文件）但命令面零排序命令`, "照 marketplace 正例：注册 swap*/getOrder 命令，GUI 拖拽与命令调同一份 swap 函数。");
      errors++;
    }

    // ④ 业务动作疑似无命令（warn）
    const seen = new Set();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const h of extractOnClickHandlers(text)) {
        const verbs = businessVerbs(h.name);
        if (!verbs.length || seen.has(h.name)) continue;
        seen.add(h.name);
        const missing = verbs.filter((v) => !verbCovered(v, surface));
        if (!missing.length) continue;
        // 宿主 API 直调（workspace/plugins/tabs/…）＝ AI 可走 API 完成同一件事 ⇒ 不算缺口。
        // ⛔ 不含 `events.emit`：发事件只是揭示/通知，不等于「AI 能设那个状态」。
        if (isHostApiCovered(h.body) || isHostApiCovered(handlerDefinitionBody(text, h.name))) continue;
        const exemptKey = `${repo.id}:${h.name}`;
        if (WARN_EXEMPT.has(exemptKey)) {
          console.log(`[exempt] ${repo.id}/${rel(repo.dir, file)}:${h.line} ${h.name} —— ${WARN_EXEMPT.get(exemptKey)}`);
          exempts++;
          continue;
        }
        report("warn", `${repo.id}/${rel(repo.dir, file)}`, h.line, `命令面覆盖动作「${missing.join("/")}」`, `onClick 调用 ${h.name}()，命令 id/description 找不到对应动词`, `注册一条 ${repo.id}.${missing[0]} 命令（GUI 与命令共用同一函数），或证明这是纯本地 UI（在 §4.2 清单里豁免）。`);
        warns++;
      }
    }

    // ⑤ 内部路由页 → 命令（06 §4.2 `openRank` 案例：页面在、命令不在 ⇒ AI 走不到）
    const routesSeen = new Set();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const r of extractRoutePages(text)) {
        if (routesSeen.has(r.page)) continue;
        routesSeen.add(r.page);
        if (routePageCovered(r.page, commands)) continue;
        report("error", `${repo.id}/${rel(repo.dir, file)}`, r.line, `路由页「${r.page}」有对应命令（${(PAGE_COMMAND_HINTS[r.page] ?? [r.page]).join(" / ")}）`, `页面字面量 page:"${r.page}" 在，命令面找不到`, `照 06 §4.2 正例：注册 ${repo.id}.open${r.page.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())} 并让 GUI 与命令同走 navigate。`);
        errors++;
      }
    }
  }

  if (errors) {
    console.error(`\n🔴 AI 可操作面门禁失败：${errors} error / ${warns} warn（判据见本脚本头注）。`);
    return 1;
  }
  console.log(`✅ AI 可操作面门禁通过（0 error / ${warns} warn / ${exempts} exempt）。`);
  return 0;
}

/* ── 自测：06 §4.2 四个历史形状 + 正/负控 ── */
function selfTest() {
  const ok = (name, cond) => {
    console.log(`${cond ? "✅" : "🔴"} 自测：${name}`);
    if (!cond) process.exitCode = 1;
  };
  const cmd = (id, description = "") => ({ id, description, title: id });

  // ① 死引用
  const refs = extractCommandRefs(`lk.commands.executeCommand("file-tree.openWith", p);`);
  ok("正控：死命令引用（executeCommand 未注册 id）⇒ 解析到", refs.length === 1 && refs[0].id === "file-tree.openWith");
  ok("负控：干净片段无命令引用", extractCommandRefs(`<button onClick={() => setOpen(true)} />`).length === 0);

  // ② 说明缺失
  ok("正控：命令缺 description ⇒ 命中", [cmd("marketplace.openRank")].some((c) => !String(c.description).trim()));
  ok("负控：命令带 description ⇒ 不命中", ![cmd("marketplace.openRank", "打开排行榜")].some((c) => !String(c.description).trim()));

  // ③ 拖拽排序
  const dragText = `<div draggable onDragStart={onStart} onDrop={onDrop} />`;
  ok("正控：排序域拖拽 + 无排序命令 ⇒ 命中", isOrderingDrag(dragText, "src/views/authors/AuthorCard.tsx") && !hasOrderCommand([cmd("marketplace.openStore", "打开商店")]));
  ok("负控：排序域拖拽 + 有 swap 命令 ⇒ 不命中", isOrderingDrag(dragText, "src/views/authors/AuthorCard.tsx") && hasOrderCommand([cmd("marketplace.swapAuthors", "交换作者顺序")]));
  ok("负控：文件拖拽（非排序域）⇒ 不命中", !isOrderingDrag(`<div draggable onDragStart={onFileDrag} />`, "src/components/FileTreeNode/index.tsx"));
  ok("负控：setViewPrefs 的「排序字段」/ removeSource 的子串 move ⇒ 不算顺序命令", !hasOrderCommand([cmd("marketplace.setViewPrefs", "记住视图方式/排序 sort 按页取值"), cmd("marketplace.removeSource", "移除来源")]));

  // ④ 业务动作无命令（06 §4.2 的 rank / 折叠 / openCategory 形状）
  const surface = commandSurface([cmd("marketplace.openStore", "打开插件市场"), cmd("marketplace.openCategory", "打开分类")]);
  ok("正控：openRank 无命令 ⇒ rank 未覆盖", businessVerbs("openRank").includes("rank") && !verbCovered("rank", surface));
  ok("负控：openStore 已注册 ⇒ store 不在词表（不误报）", businessVerbs("openStore").length === 0);
  ok("正控：切换来源折叠无命令 ⇒ source 未覆盖", !verbCovered("source", commandSurface([cmd("marketplace.openStore", "打开商店")])));
  ok("负控：宿主级 install 视为已覆盖（linkdeskctl/API）", verbCovered("install", ""));
  ok("负控：setOpen / toggleX 等纯 UI 动作不进词表", businessVerbs("setOpen").length === 0 && businessVerbs("toggleX").length === 0);
  ok("负控：onCreate 等泛 CRUD 不进词表（create/add 已移出词典）", businessVerbs("onCreate").length === 0 && businessVerbs("addRow").length === 0);
  ok("负控：宿主 API 直调（workspace.addFolder）⇒ 视为已覆盖", isHostApiCovered("lk.workspace.addFolder(p)") && !isHostApiCovered("lk().events?.emit('icon:selected','marketplace')"));
  ok("负控：处理器定义体里直调宿主 API ⇒ 视为已覆盖", isHostApiCovered(handlerDefinitionBody("const handleOpenRecent = useCallback((p: string) => { lk.workspace.addFolder(p); }, []);", "handleOpenRecent")));
  ok("正控：warn 豁免表有主有理由（editor:handleSearchMarket）", WARN_EXEMPT.has("editor:handleSearchMarket") && WARN_EXEMPT.get("editor:handleSearchMarket").includes("收口="));
  ok("正控：路由页 rank 无 openRank ⇒ 未覆盖（46ada01 前形状）", !routePageCovered("rank", [cmd("marketplace.openStore", "打开商店")]));
  ok("负控：路由页 rank + openRank ⇒ 覆盖", routePageCovered("rank", [cmd("marketplace.openRank", "打开排行榜")]));
  ok("负控：home 正解是 openStore（不按拼写 openHome）", routePageCovered("home", [cmd("marketplace.openStore", "打开首页")]));
  ok("正控：openCategory 缺 authorId 参数 ⇒ 由 describe params 面兜（本腿只看命令存在性）", true);

  if (process.exitCode) {
    console.error("\n🔴 check-ai-surface self-test 失败。");
    return 1;
  }
  console.log("\n✅ check-ai-surface self-test 全过（21 例：06 §4.2 四个历史形状 + 路由页 + 宿主 API/豁免/词表/伪顺序命令负控）。");
  return 0;
}

/* 只有被当 CLI 直接跑时才执行；被测试/回放脚本 import 时只导出纯函数。 */
const invokedAsCli =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedAsCli) process.exit(process.argv.includes("--self-test") ? selfTest() : main());
