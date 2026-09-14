/**
 * E6#100c 官方目录批量工具——**把「18 条手敲」降成「看一眼 diff」**。
 *
 * ── 为什么必须造这把工具（详案 04-上架两步.md §2.1）──
 *   官方目录 `Encaron/linkdesk-marketplace` 的 `marketplace.json` 是**内置默认源**：
 *   用户零操作就会拉它（市场插件 `OFFICIAL_SOURCE_URL` 恒拉取 + UI「内置」锁）。
 *   它一坏 = **所有人默认可见的货架全坏**。18 只逐条手敲那个 json，**一定会改错**。
 *
 * ── 这一步在上架两步里的位置 ──
 *   ① `npm run publish`（各插件仓）——东西在网上，但**只有手动加了源 URL 的人**看得见；
 *   ② **本脚本产出的合并结果收录进官方目录**——**所有用户默认可见**。
 *   ② 才是「用户一个都不敢卸」的解药：只有进了官方目录，卸载之后才有地方拿回来。
 *
 * ── 🔴 三条硬边界（清单格 `#100c` 正文明写）──
 *   ① **只生成、不推**——产物落在壳仓 `scratch/`（gitignore 内），写官方目录仓库是**写别人的仓**
 *      ⇒ 必须用户点头（memory `push-wait-for-user`）。本脚本**零 GitHub 写调用**（只有 GET）。
 *   ② **禁止整文件覆盖**——官方目录里可能有**非官方作者的第三方条目**（§6.7 收录路径）。
 *      合并逻辑 = **只增改「自己这批」的行 + 别人的行逐字节原样搬**。本文件**没有**任何
 *      「用新数组替换 plugins」的写法——那是本脚本最容易被改错、也最贵的一处（改错 = 删掉第三方）。
 *   ③ **不许写死 18 个 id**（硬约束 10）——清单来源 = **`bundled-plugins.lock.json`（数据文件）**。
 *      壳代码零插件 ID 字面量这条不放松，**连「哪批是自己的」都只能由数据声明**。
 *      ⇒ 本轮的**清单来源是过渡形态**：lock 归 7.4（`#101a`）产出；在它落地之前，
 *      `--ids-file <path>` 代替它（本轮用 `bundled-plugins/` 目录名 + `.linkdesk-plugin` 反推）。
 *
 * ── 「自己的这批」怎么认（不是靠 id 白名单，是靠**来源仓库**）──
 *   逐仓 fetch `raw.githubusercontent.com/<owner>/<repo>/main/marketplace.json`（各插件仓 publish 的产物）。
 *   拿到的是**该插件自己的条目**。合并时按 **id** 对齐官方目录里的行：
 *     · id 在官方目录且**这一条是我们的 repo** → 增改（版本比高者胜）
 *     · id 在官方目录但**不是我们的 repo** → 🔴 **不动，原样保留**（别人的行；打印出来提示撞号）
 *     · id 不在官方目录 → 追加
 *     · 官方目录有、我们这批没有 → **原样保留**（可能是已下架的自家老货，也可能是别人的 ⇒ 一律不动）
 *
 * ── 用法 ──
 *   node scripts/sync-official-catalog.mjs                     # 读 lock（没有则读 bundled-plugins/ 目录名）
 *   node scripts/sync-official-catalog.mjs --ids-file <path>   # 过渡形态：显式给 id 清单（每行一个）
 *   node scripts/sync-official-catalog.mjs --owner Encaron     # 官方作者（缺省 Encaron）；仓库名 = linkdesk-plugin-<id>
 *   node scripts/sync-official-catalog.mjs --repo-suffix ""    # 仓库名规则改为「同名」（缺省 -<id> 前缀形态）
 *   node scripts/sync-official-catalog.mjs --out <path>        # 产物路径（缺省 scratch/official-catalog.next.json）
 *   node scripts/sync-official-catalog.mjs --offline <dir>     # 离线：从本地目录读各仓 marketplace.json（无网调试/自测）
 *   node scripts/sync-official-catalog.mjs --self-test         # 合并逻辑负例自测（不碰网络）
 *
 * 退出码 0 = 生成了（含「无变化」）；1 = 失败（fetch 失败 / 解析失败）。
 *
 * ⚠️ **产物只是「候选」**——落进官方目录仍要人过目 + 用户点头推。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// 官方目录坐标与插件仓命名规则**同源于一处**（E6#101：`sync:bundled` 与新鲜度门禁读同一份；
// 两处各写一遍 owner/prefix 迟早漂移——漂移那天的表现是「一个工具认为这批是我们的、另一个不认」）
import { OFFICIAL_REPO, PLUGIN_REPO } from "./lib/official-catalog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 官方目录仓库（本脚本**只读它**——写它要用户点头） */
const OFFICIAL_RAW = `https://raw.githubusercontent.com/${OFFICIAL_REPO.owner}/${OFFICIAL_REPO.repo}/main/marketplace.json`;

/* ── 清单来源（数据，不是代码字面量）────────────────────────────────── */

/**
 * 读 `bundled-plugins.lock.json`（7.4 `#101a` 产出）→ `id → repo`。
 * lock 不在（本轮真实状态）→ 返回 null，由调用方回落。
 */
export function readLockIds(lockPath) {
  if (!existsSync(lockPath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (e) {
    throw new Error(`bundled-plugins.lock.json 解析失败：${e instanceof Error ? e.message : String(e)}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.plugins;
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const it of list) {
    if (!it || typeof it !== "object") continue;
    const id = typeof it.id === "string" ? it.id : null;
    if (!id) continue;
    const repo = typeof it.repo === "string" ? it.repo : null;
    out.push({ id, repo });
  }
  return out.length ? out : null;
}

/** 回落①：显式清单文件（每行一个 id，`#` 注释 / 空行忽略）——过渡形态 */
export function readIdsFile(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** 回落②：`bundled-plugins/` 目录里 `<id>.linkdesk-plugin` 的基名——出厂种子即「自己这批」的数据声明 */
export function readIdsFromBundledDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".linkdesk-plugin"))
    .map((n) => n.slice(0, -".linkdesk-plugin".length))
    .sort();
}

/* ── 合并（纯函数——可自测，这是本脚本最贵的一段）──────────────────── */

/** 版本比高：数字段逐位比 + 同段字符串比（够用；不引 semver 依赖） */
function versionRank(a, b) {
  const pa = String(a ?? "").split(/[.-]/);
  const pb = String(b ?? "").split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx > ny ? 1 : -1;
    } else if (x !== y) {
      if (x === "") return -1; // 短的那方（1.0 < 1.0.1）
      if (y === "") return 1;
      return x > y ? 1 : -1;
    }
  }
  return 0;
}

/** 键排序的稳定序列化——用于**内容比较**（同一份数据被不同写入者落盘时键序可能不同，直接 stringify 会假不等） */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** 只在版本更高时替换（同版不换、更低不换——防把官方目录往回退） */
export function pickHigher(current, incoming) {
  if (!current) return incoming;
  return versionRank(incoming.version, current.version) > 0 ? incoming : current;
}

/**
 * 合并（纯函数）：官方目录 + 我们这批各仓条目 → 新目录。
 *
 * 🔴 **两条不可违**：
 *   ① 官方目录里**别人的行逐字节原样保留**（只做 `{...p}` 浅拷贝，不改字段）；
 *   ② 只动「我们的 repo 认领得到」的行。
 *
 * 返回 `{ catalog, report }`——report 里 `added` / `changed` / `keptForeign` / `unchanged`
 * 分桶，供人过目（这就是「看一眼 diff」的那个 diff）。
 */
export function mergeCatalogs(official, ours, { repoForId }) {
  const officialPlugins = Array.isArray(official?.plugins) ? official.plugins : [];
  const cloned = officialPlugins.map((p) => ({ ...p, versions: Array.isArray(p.versions) ? p.versions.map((v) => ({ ...v })) : p.versions }));

  const added = [];
  const changed = [];
  const metadataUpdated = [];
  const unchanged = [];
  const keptForeign = [];
  const byId = new Map();
  for (let i = 0; i < cloned.length; i++) byId.set(cloned[i].id, i);

  for (const entry of ours) {
    const idx = byId.get(entry.id);
    if (idx === undefined) {
      // 官方目录没有 → 追加
      cloned.push(entry);
      byId.set(entry.id, cloned.length - 1);
      added.push(entry.id);
      continue;
    }
    const existing = cloned[idx];
    // 「这条是不是我们的」= 看它现在的 downloadUrl / repository 指不指向我们的仓
    const repo = repoForId(entry.id);
    const ownNow =
      typeof existing.downloadUrl === "string" && existing.downloadUrl.includes(`/${repo}/`) ||
      typeof existing.repository === "string" && existing.repository.includes(`/${repo}`);
    if (!ownNow) {
      // 🔴 别人的行 / 认不出来 → 原样保留（绝不动）
      keptForeign.push({ id: entry.id, existingVersion: existing.version, oursVersion: entry.version });
      continue;
    }
    const better = pickHigher(existing, entry);
    if (better === existing) {
      /* E6#106：**同版本但内容有变 ⇒ 采用**（此前的「版本比高者胜」会把这类更新整条跳过）。
       *
       * 为什么必须有这条：目录条目是**各仓条目的镜像**，而「元数据回填 / 展示字段演进」这类改动
       * **不伴随版本号变化**——E6#106 把 18 只插件的 `icon`/`marketIcon` 从包内相对路径改成绝对 URL、
       * 并补上此前从未写入的 `marketIcon`，插件版本一个没动。旧规则下这 17 条会被判「同版未动」，
       * 官方目录继续挂着**未装态恒 404 的包内路径** ⇒ 修了一半，用户还是看不到图。
       *
       * 🔴 **只在版本相等时走这条路**：版本更低仍一律不动（`versionRank !== 0` 直接落 unchanged）——
       * 否则「回填」会变成把官方目录往回退的口子（这条由自测的「更低版本不许往回退」负例钉住）。
       *
       * 取「保留我方缺失的键、其余以我方为准」（`{...existing, ...entry}`）：官方目录万一有维护者手工
       * 补注（如 `repository`/`category`），不因本仓条目没写就被抹掉；反过来本仓新写的字段一定生效。
       * 与既有两条铁律不冲突——本条只走到「我们的 repo 认领得到」的行（别人的行上文已 continue）。 */
      if (versionRank(entry.version, existing.version) === 0) {
        const merged = { ...existing, ...entry };
        if (stableStringify(merged) !== stableStringify(existing)) {
          cloned[idx] = merged;
          metadataUpdated.push({ id: entry.id, version: entry.version });
          continue;
        }
      }
      unchanged.push(entry.id);
      continue;
    }
    cloned[idx] = better;
    changed.push({ id: entry.id, from: existing.version, to: better.version });
  }

  const catalog = {
    ...official,
    version: official?.version ?? "1",
    updatedAt: new Date().toISOString(),
    plugins: cloned,
  };
  return { catalog, report: { added, changed, metadataUpdated, unchanged, keptForeign } };
}

/* ── fetch ───────────────────────────────────────────────────────────── */

async function fetchJson(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "linkdesk-official-catalog" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(await res.text());
}

/** 逐仓取「该插件自己的 marketplace.json」——离线模式从 `--offline <dir>` 下 `<id>/marketplace.json` 读 */
async function entryFor(id, { repoForId, offlineDir }) {
  const repo = repoForId(id);
  const url = `https://raw.githubusercontent.com/${OFFICIAL_REPO.owner}/${repo}/main/marketplace.json`;
  let catalog;
  if (offlineDir) {
    const p = join(offlineDir, `${id}.marketplace.json`);
    if (!existsSync(p)) throw new Error(`离线模式下缺 ${p}`);
    catalog = JSON.parse(readFileSync(p, "utf8"));
  } else {
    catalog = await fetchJson(url);
  }
  const list = Array.isArray(catalog?.plugins) ? catalog.plugins : [];
  const mine = list.find((p) => p && p.id === id) ?? list[0];
  if (!mine) throw new Error(`该仓 marketplace.json 里没有条目（${url}）`);
  // 顺手补 `repository`（作者的插件自己的主页，E6#77 乙）——publish 不写这个字段，
  // 而详情页没有它就靠 downloadUrl 推（推得出，但显式更准）。这是**增量字段**，不覆盖已有值。
  const home = `https://github.com/${OFFICIAL_REPO.owner}/${repo}`;
  return { ...mine, repository: typeof mine.repository === "string" && mine.repository ? mine.repository : home };
}

/* ── 编排 ────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const o = { owner: OFFICIAL_REPO.owner, repoPrefix: PLUGIN_REPO.prefix, out: null, idsFile: null, offlineDir: null, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") o.selfTest = true;
    else if (a === "--ids-file") o.idsFile = argv[++i];
    else if (a === "--offline") o.offlineDir = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--owner") o.owner = argv[++i];
    else if (a === "--repo-prefix") o.repoPrefix = argv[++i];
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const repoForId = (id) => `${o.repoPrefix}${id}`;

  const lockPath = join(ROOT, "bundled-plugins.lock.json");
  const lock = readLockIds(lockPath);
  let ids;
  let sourceOfIds;
  if (o.idsFile) {
    ids = readIdsFile(o.idsFile);
    sourceOfIds = `--ids-file ${o.idsFile}`;
  } else if (lock) {
    ids = lock.map((x) => x.id);
    sourceOfIds = "bundled-plugins.lock.json";
  } else {
    ids = readIdsFromBundledDir(join(ROOT, "bundled-plugins"));
    sourceOfIds = "bundled-plugins/ 目录名（lock 未落地时的过渡形态——7.4 #101a 后以 lock 为准）";
  }
  if (ids.length === 0) throw new Error("清单为空——lock / --ids-file / bundled-plugins/ 三者都没给出 id");

  console.log(`[sync-official-catalog] 清单来源：${sourceOfIds}（${ids.length} 只）`);
  console.log(`[sync-official-catalog] 仓库规则：${o.owner}/${o.repoPrefix}<id>`);

  const official = o.offlineDir && existsSync(join(o.offlineDir, "official.marketplace.json"))
    ? JSON.parse(readFileSync(join(o.offlineDir, "official.marketplace.json"), "utf8"))
    : await fetchJson(OFFICIAL_RAW);
  console.log(`[sync-official-catalog] 官方目录现状：${official.plugins?.length ?? 0} 条`);

  const ours = [];
  const failed = [];
  for (const id of ids) {
    try {
      ours.push(await entryFor(id, { repoForId, offlineDir: o.offlineDir }));
    } catch (e) {
      failed.push({ id, err: e instanceof Error ? e.message : String(e) });
    }
  }
  if (failed.length) {
    console.error("[sync-official-catalog] 🔴 下列插件取条目失败——**不生成**（半份目录比没有更危险）：");
    for (const f of failed) console.error(`    ${f.id}: ${f.err}`);
    return 1;
  }

  const { catalog, report } = mergeCatalogs(official, ours, { repoForId });

  const out = o.out ?? join(ROOT, "scratch", "official-catalog.next.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  console.log("");
  console.log("  ┌─ 合并结果（这就是要人过目的那份 diff）─────────");
  console.log(`  │ 官方目录原 ${official.plugins?.length ?? 0} 条 → 新 ${catalog.plugins.length} 条`);
  console.log(`  │ 新增 ${report.added.length}：${report.added.join(", ") || "（无）"}`);
  console.log(`  │ 更新 ${report.changed.length}：${report.changed.map((c) => `${c.id} ${c.from}→${c.to}`).join(", ") || "（无）"}`);
  console.log(`  │ 同版改元数据 ${report.metadataUpdated.length}：${report.metadataUpdated.map((m) => `${m.id}(${m.version})`).join(", ") || "（无）"}`);
  console.log(`  │ 同版未动 ${report.unchanged.length}：${report.unchanged.join(", ") || "（无）"}`);
  console.log(`  │ 🔴 别人的行原样保留 ${report.keptForeign.length}：${report.keptForeign.map((k) => `${k.id}(${k.existingVersion} vs 我们${k.oursVersion})`).join(", ") || "（无）"}`);
  console.log(`  └─ 产物：${out}`);
  console.log("");
  console.log("  ⚠️ 产物只是**候选**——落进官方目录仍要人过目 + 用户点头（本脚本零写调用）。");

  if (report.keptForeign.length) {
    console.log("");
    console.log("  🔴 上面「别人的行」里有 id 撞号——**没有动它们**。若撞号的是我们自己的货，");
    console.log("     要先人工确认官方目录里那条是谁的（撞号 = 身份冲突，见 09-命名规范 §六）。");
  }
  return 0;
}

/* ── --self-test：合并逻辑负例（不碰网络）────────────────────────────── */

function selfTest() {
  const repoForId = (id) => `linkdesk-plugin-${id}`;
  const official = {
    version: "1",
    updatedAt: "2026-09-10T00:00:00.000Z",
    plugins: [
      { id: "third-party-a", name: "别人的", version: "2.0.0", downloadUrl: "https://github.com/someone/plugin-a/releases/download/v2.0.0/a.linkdesk-plugin", versions: [{ version: "2.0.0" }] },
      { id: "settings", name: "设置旧", version: "1.0.0", downloadUrl: "https://github.com/Encaron/linkdesk-plugin-settings/releases/download/v1.0.0/settings.linkdesk-plugin", versions: [{ version: "1.0.0" }] },
      { id: "hello-linkdesk", name: "Hello", version: "0.1.1", downloadUrl: "https://github.com/Encaron/hello-linkdesk/releases/download/v0.1.1/h.linkdesk-plugin", versions: [{ version: "0.1.1" }] },
    ],
  };
  const ours = [
    { id: "settings", name: "设置", version: "1.0.6", downloadUrl: "https://github.com/Encaron/linkdesk-plugin-settings/releases/download/v1.0.6/settings.linkdesk-plugin", versions: [{ version: "1.0.6" }] },
    { id: "editor", name: "编辑器", version: "1.0.10", downloadUrl: "https://github.com/Encaron/linkdesk-plugin-editor/releases/download/v1.0.10/editor.linkdesk-plugin", versions: [{ version: "1.0.10" }] },
    // 🔴 撞号负例：id 与别人的条目相同、但那条不属于我们 ⇒ 必须原样保留
    { id: "third-party-a", name: "我们的同名货", version: "9.9.9", downloadUrl: "https://github.com/Encaron/linkdesk-plugin-third-party-a/releases/download/v9.9.9/x.linkdesk-plugin", versions: [{ version: "9.9.9" }] },
  ];
  const { catalog, report } = mergeCatalogs(official, ours, { repoForId });
  const byId = new Map(catalog.plugins.map((p) => [p.id, p]));
  const fails = [];
  const check = (name, cond) => { if (!cond) fails.push(name); };

  check("别人的条目版本未被改（third-party-a 仍 2.0.0）", byId.get("third-party-a").version === "2.0.0");
  check("别人的条目按原样保留且被报告", report.keptForeign.some((k) => k.id === "third-party-a"));
  check("自家同 id 条目被更新（settings 1.0.0→1.0.6）", byId.get("settings").version === "1.0.6");
  check("新增条目进得去（editor）", byId.has("editor") && report.added.includes("editor"));
  check("官方目录里我们没碰的行原样在（hello-linkdesk）", byId.get("hello-linkdesk")?.version === "0.1.1");
  check("总条数 = 原 3 + 新 1（撞号那条不重复追加）", catalog.plugins.length === 4);
  check("别人的条目字段对象引用未被替换成我们的", byId.get("third-party-a").downloadUrl.includes("someone/plugin-a"));
  // 版本回退负例：我们的版本更低 ⇒ 不换
  const back = mergeCatalogs({ plugins: [{ id: "x", version: "2.0.0", downloadUrl: "https://github.com/Encaron/linkdesk-plugin-x/releases/download/v2.0.0/x.linkdesk-plugin" }] }, [{ id: "x", version: "1.0.0", downloadUrl: "https://github.com/Encaron/linkdesk-plugin-x/releases/download/v1.0.0/x.linkdesk-plugin" }], { repoForId });
  check("更低版本不许把官方目录往回退", back.catalog.plugins[0].version === "2.0.0");

  /* E6#106 负例：**同版本但内容有变**——「版本比高者胜」会把这类改动整条跳过，
   * 而元数据回填（如 icon 相对路径 → 绝对 URL）正是同版内容变更。 */
  const sameVer = mergeCatalogs(
    { plugins: [{ id: "settings", version: "1.0.7", icon: "resources/icon-bar.svg", downloadUrl: "https://github.com/Encaron/linkdesk-plugin-settings/releases/download/v1.0.7/settings.linkdesk-plugin", versions: [{ version: "1.0.7" }] }] },
    [{ id: "settings", version: "1.0.7", icon: "https://raw.githubusercontent.com/Encaron/linkdesk-plugin-settings/v1.0.7/resources/icon-bar.svg", iconSource: "url", downloadUrl: "https://github.com/Encaron/linkdesk-plugin-settings/releases/download/v1.0.7/settings.linkdesk-plugin", versions: [{ version: "1.0.7" }] }],
    { repoForId },
  );
  check("同版内容有变 ⇒ 采用（icon 已 URL 化进目录）", sameVer.catalog.plugins[0].icon.startsWith("https://raw.githubusercontent.com/"));
  check("同版内容变更单独入桶（metadataUpdated）", sameVer.report.metadataUpdated.some((m) => m.id === "settings"));
  check("同版内容变更不算「版本更新」", sameVer.report.changed.length === 0);
  // 同版且内容全等 ⇒ 零改动（幂等，防每次跑都产出一份「假 diff」）
  const idemDl = "https://github.com/Encaron/linkdesk-plugin-settings/releases/download/v1.0.7/settings.linkdesk-plugin";
  const idem = mergeCatalogs(
    { plugins: [{ id: "settings", version: "1.0.7", icon: "https://x.invalid/i.svg", downloadUrl: idemDl, versions: [{ version: "1.0.7" }] }] },
    [{ id: "settings", version: "1.0.7", icon: "https://x.invalid/i.svg", downloadUrl: idemDl, versions: [{ version: "1.0.7" }] }],
    { repoForId },
  );
  check("同版且内容全等 ⇒ 判未动（幂等）", idem.report.unchanged.includes("settings") && idem.report.metadataUpdated.length === 0);

  if (fails.length) {
    console.error(`[sync-official-catalog] --self-test 🔴 ${fails.length} 例不过：`);
    for (const f of fails) console.error(`    ✗ ${f}`);
    return 1;
  }
  console.log(`[sync-official-catalog] --self-test ✓ 11 例全过（含「别人的行不许动」撞号负例、版本回退负例、同版内容变更负例）`);
  return 0;
}

// 直接跑 = 主流程；被 import（自测用）不执行
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  const code = o.selfTest ? selfTest() : await main();
  process.exit(code);
}
