#!/usr/bin/env node
/**
 * E6#106 目录条目**身份图回填**——把 18 只插件仓的 `marketplace.json` 条目补成「未装态也能显形」的形态。
 *
 * ── 为什么需要这把工具（而不是逐仓手改）──
 *   插件源码外移后，目录条目由各仓 `publish` 自动写。`publish` 在 E6#106 之前**只搬 `icon`**：
 *   ① `marketIcon`（Type-2 身份图）从没进过条目 ⇒ 图标栏插件（`icon` = Type-1 白线剪影）在市场行显剪影；
 *   ② `icon` 存的是**包内相对路径**（`resources/icon.svg`）⇒ 未装用户拿到的 URL 是 `linkdesk://…`，恒 404。
 *   两处都要改，而已经发出去的 18 条是**历史数据**——它们不会自己变。18 只手改必然出错（本仓 L7 的
 *   官方目录工具当初就是为「把 18 条手敲降成看一眼 diff」而造），故同样做成数据驱动的工具。
 *
 * ── 硬边界（照 L7 的官方目录工具同规）──
 *   ① **只改条目元数据**：不动 Release、**不动插件版本号**（`publish` 以 `plugin.json.version` 为 tag，
 *      已发布版本重开 Release 会被拦；纯元数据回填不必也不该 bump）。
 *   ② **不手抄数据**：`icon`/`marketIcon` 一律从该仓 `plugin.json` 读；`owner/repo/tag` 从条目自带的
 *      `readmeUrl` 反解（它已是发布时写下的真值），解不出则退回仓名约定——**不猜就报错**。
 *   ③ **URL 规则不在本文件重写**：直接调 SDK 的 `withCatalogIdentity`（`publish` 用的同一函数），
 *      两处各写一套必然漂移，漂移的表现是「发布写回的 URL 与回填的 URL 长得不一样」。
 *      故本工具**要求 SDK dist 已构建**（`npm run --prefix packages/plugin-sdk build`），
 *      导入失败或函数缺失即**抛错**（宁可停，不静默按旧规则写）。
 *   ④ **幂等**：已是正确形态的条目 = 零改动（`--check` 用它做空跑核验）。
 *   ⑤ 只写本地仓；**推送等用户点头**（memory `push-wait-for-user`）。
 *
 * ── 用法 ──
 *   node scripts/backfill-catalog-identity.mjs --check          # 空跑：只列将改动什么（有漂移 ⇒ exit 1）
 *   node scripts/backfill-catalog-identity.mjs                  # 真写（默认容器 E:\linkdesk-plugins\official）
 *   node scripts/backfill-catalog-identity.mjs --dir <path>     # 指定容器目录
 *   node scripts/backfill-catalog-identity.mjs --self-test      # 纯函数负控（不动磁盘）
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_DIR = "E:\\linkdesk-plugins\\official";
const SDK_DIST = join(ROOT, "packages", "plugin-sdk", "dist", "publish.js");

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const selfTest = argv.includes("--self-test");
const dirArg = argv.indexOf("--dir");
const targetDir = dirArg >= 0 ? argv[dirArg + 1] : DEFAULT_DIR;

/* ── SDK 导入（规则单一真相源）────────────────────────────────────────── */

async function loadSdk() {
  if (!existsSync(SDK_DIST)) {
    throw new Error(
      `SDK dist 不存在（${SDK_DIST}）——先跑：npm run --prefix packages/plugin-sdk build\n` +
        `  （本工具刻意不自己重写 URL 规则：那是 publish 的同一处逻辑，两处各写一套必漂移）`,
    );
  }
  const m = await import(pathToFileURL(SDK_DIST).href);
  if (typeof m.withCatalogIdentity !== "function") {
    throw new Error(
      `SDK dist 里没有 withCatalogIdentity —— dist 是旧的（E6#106 之前构建的）。\n` +
        `  先跑：npm run --prefix packages/plugin-sdk build`,
    );
  }
  return m.withCatalogIdentity;
}

/* ── 纯函数：单条条目的回填计划 ───────────────────────────────────────── */

/** 从条目反解 {owner, repo, tag}——readmeUrl / downloadUrl 两源，都不成 ⇒ null（调用方报错，不猜） */
export function deriveRemote(entry) {
  const src = [entry.readmeUrl, entry.downloadUrl].filter((u) => typeof u === "string");
  for (const url of src) {
    const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//.exec(url);
    if (m) return { owner: m[1], repo: m[2], tag: m[3] };
    const d = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\//.exec(url);
    if (d) return { owner: d[1], repo: d[2], tag: d[3] };
  }
  return null;
}

/**
 * 单条条目 → 回填后的条目 + 是否变化。纯函数（自测覆盖）。
 * 规则：manifest 有该字段 ⇒ 用它（URL 化）；manifest 没有而条目里的值看着像包内路径 ⇒ 就地 URL 化
 * （历史条目可能只有 `icon`）；其余字段**原样保留**（含 versions[]、updatedAt、author…）。
 */
export function planEntry(withCatalogIdentity, manifest, entry, remote, tag) {
  const next = { ...entry };
  const identity = withCatalogIdentity(
    {
      id: manifest.pluginId ?? entry.id,
      name: manifest.name ?? entry.name,
      version: manifest.version ?? entry.version,
      icon: manifest.icon,
      iconSource: manifest.iconSource,
      marketIcon: manifest.marketIcon,
      marketIconSource: manifest.marketIconSource,
    },
    remote,
    tag,
  );

  const hasPath = (v) => typeof v === "string" && !/^https?:\/\//i.test(v) && (v.includes("/") || v.includes("."));
  if (identity.icon !== undefined) {
    next.icon = identity.icon;
    next.iconSource = identity.iconSource;
  } else if (hasPath(entry.icon)) {
    // manifest 没声明但条目里有包内路径（历史残留）——照样 URL 化，否则未装恒 404
    const fallback = withCatalogIdentity({ id: entry.id, name: entry.name, version: entry.version, icon: entry.icon }, remote, tag);
    next.icon = fallback.icon;
    next.iconSource = fallback.iconSource;
  }
  if (identity.marketIcon !== undefined) {
    next.marketIcon = identity.marketIcon;
    next.marketIconSource = identity.marketIconSource;
  } else if (hasPath(entry.marketIcon)) {
    const fallback = withCatalogIdentity({ id: entry.id, name: entry.name, version: entry.version, marketIcon: entry.marketIcon }, remote, tag);
    next.marketIcon = fallback.marketIcon;
    next.marketIconSource = fallback.marketIconSource;
  }
  return { next, changed: JSON.stringify(next) !== JSON.stringify(entry) };
}

/* ── 自测（纯函数负控）────────────────────────────────────────────────── */

async function runSelfTest() {
  const withCatalogIdentity = await loadSdk();
  const remote = { owner: "owner-two", repo: "demo-repo" };
  const tag = "v1.0.0";
  const cases = [];
  const t = (name, cond) => cases.push({ name, ok: !!cond });

  // ① 图标栏插件：两条都 URL 化，且 icon 仍是剪影（不是身份图）——「选哪张」由字段决定，工具不越权
  const r1 = planEntry(
    withCatalogIdentity,
    { pluginId: "demo", name: "Demo", version: "1.0.0", icon: "resources/icon-bar.svg", marketIcon: "resources/icon.svg" },
    { id: "demo", name: "Demo", version: "1.0.0", icon: "resources/icon-bar.svg" },
    remote,
    tag,
  );
  t("① 身份图补进条目", r1.next.marketIcon === "https://raw.githubusercontent.com/owner-two/demo-repo/v1.0.0/resources/icon.svg");
  t("① icon 同步 URL 化且仍是剪影文件", r1.next.icon.endsWith("/resources/icon-bar.svg"));
  t("① 来源标 url", r1.next.iconSource === "url" && r1.next.marketIconSource === "url");
  t("① 判为有变化", r1.changed);

  // ② 幂等：同一 manifest 下，对已回填的条目再跑一次 = 零改动（--check 的空跑核验靠这条）
  const r2 = planEntry(
    withCatalogIdentity,
    { pluginId: "demo", name: "Demo", version: "1.0.0", icon: "resources/icon-bar.svg", marketIcon: "resources/icon.svg" },
    r1.next,
    remote,
    tag,
  );
  t("② 幂等（同一声明再跑一次零改动）", !r2.changed);

  // ③ 负控：manifest 无 marketIcon 且条目也无 ⇒ 不凭空造键
  const r3 = planEntry(withCatalogIdentity, { pluginId: "demo", name: "Demo", version: "1.0.0", icon: "resources/icon.svg" }, { id: "demo", name: "Demo", version: "1.0.0" }, remote, tag);
  t("③ 无声明不造 marketIcon 键", !("marketIcon" in r3.next));

  // ④ 负控：仓库反解不出来就必须报错（不猜）
  t("④ 反解失败可检出", deriveRemote({ id: "x" }) === null);
  t("④ readmeUrl 可反解", JSON.stringify(deriveRemote({ readmeUrl: "https://raw.githubusercontent.com/o/r/v1.2.3/README.md" })) === JSON.stringify({ owner: "o", repo: "r", tag: "v1.2.3" }));
  t("④ downloadUrl 兜底可反解", JSON.stringify(deriveRemote({ downloadUrl: "https://github.com/o/r/releases/download/v1.0.0/x.linkdesk-plugin" })) === JSON.stringify({ owner: "o", repo: "r", tag: "v1.0.0" }));

  const bad = cases.filter((c) => !c.ok);
  for (const c of cases) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
  console.log(bad.length === 0 ? "\n自测全过（8 例）" : `\n🔴 自测失败 ${bad.length} 例`);
  process.exit(bad.length === 0 ? 0 : 1);
}

/* ── 主流程 ───────────────────────────────────────────────────────────── */

async function main() {
  const withCatalogIdentity = await loadSdk();
  if (!existsSync(targetDir)) throw new Error(`容器目录不存在：${targetDir}`);
  const rows = [];
  let changedCount = 0;

  for (const name of readdirSync(targetDir).sort()) {
    const mp = join(targetDir, name, "marketplace.json");
    const pp = join(targetDir, name, "plugin.json");
    if (!existsSync(mp) || !existsSync(pp)) continue;
    const manifest = JSON.parse(readFileSync(pp, "utf8"));
    const catalog = JSON.parse(readFileSync(mp, "utf8"));
    const entry = catalog.plugins?.[0];
    if (!entry) {
      rows.push({ name, status: "⏭ 目录条目不唯一，跳过" });
      continue;
    }
    const remote = deriveRemote(entry);
    if (!remote) {
      throw new Error(
        `${name}：条目里反解不出 owner/repo/tag（readmeUrl / downloadUrl 都不含可识别形态）——` +
          `本工具不猜仓库名。请先让该仓 publish 一次，或手工给出仓库坐标。`,
      );
    }
    const tag = `v${entry.version}`;
    const { next, changed } = planEntry(withCatalogIdentity, manifest, entry, remote, tag);
    if (changed) {
      changedCount += 1;
      if (!check) writeFileSync(mp, `${JSON.stringify({ ...catalog, plugins: [next, ...catalog.plugins.slice(1)] }, null, 2)}\n`, "utf8");
      rows.push({
        name,
        status: check ? "✏ 需回填" : "✓ 已回填",
        icon: next.icon ?? "-",
        marketIcon: next.marketIcon ?? "-",
      });
    } else {
      rows.push({ name, status: "— 已是最新", icon: next.icon ?? "-", marketIcon: next.marketIcon ?? "-" });
    }
  }

  console.log(`\n容器：${targetDir}　模式：${check ? "空跑核验（--check）" : "真写"}\n`);
  for (const r of rows) {
    const short = (u) => (u === "-" ? "-" : u.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\//, "…/"));
    console.log(`  ${r.name.padEnd(22)} ${r.status.padEnd(12)} icon=${short(r.icon).padEnd(28)} marketIcon=${short(r.marketIcon)}`);
  }
  console.log(`\n需回填 ${changedCount} / 共 ${rows.length} 只`);
  if (check && changedCount > 0) {
    console.log("→ 去掉 --check 真写；写完全部为「已是最新」即收敛（幂等）。");
    process.exit(1);
  }
}

if (selfTest) {
  await runSelfTest();
} else {
  await main();
}
