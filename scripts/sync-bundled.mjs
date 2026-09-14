#!/usr/bin/env node
/**
 * `sync:bundled`——**出厂种子保鲜**（E6#101，L7 第 7.4 轮）。
 *
 * ── 它回答的问题（用户原话）──
 *   「软件更新到了第二版，插件没更新无所谓；但有一天我给**设置插件**更新到第二版，
 *     一个新的用户下载软件，**我就应该给他提供第二版的软件和第二版的插件一起下载**。」
 *   ⇒ 出厂套装 = **打包那一刻，各 bootstrap 插件的最新已发布版**（决策 D3）。
 *
 * ── 三件套里它是「机制」，另两件是「账」与「门禁」──
 *   账  = `bundled-plugins.lock.json`（#101a）：每只随包插件的 id / 仓 / 版本 / 直链 / 指纹；
 *   机制 = 本脚本：按账把箱子**拉齐**（默认档可复现；`--latest` 显式追新；`--offline` 断网校验）；
 *   门禁 = `check-bundled-freshness.mjs`（#101c）：只查不改，落后/不符 ⇒ 红。
 *   ⇒ **只有门禁 = 只报警不解决；只有机制 = 没人守得住**。所以三件一起上，缺一不成立。
 *
 * ── 三个档（05-出厂种子保鲜.md §二，一档一个用途，别混）──
 *   `npm run sync:bundled`             复现档：**只读 lock**（不出网查新），逐只校验箱内种子
 *                                      「版本 + 内容指纹」与账一致；缺的/不符的**按账从直链拉回来覆盖**；
 *                                      并把箱子里**不属于 seed 集**的 zip 清掉（箱子 ≡ 账的 seed 集）。
 *                                      用途：发壳前跑一次——**同一个 commit 两次构建装进同样的箱子**。
 *   `npm run sync:bundled -- --latest` 追新档：读**官方目录**最新版 → 拉产物 → 刷账（version /
 *                                      downloadUrl / fingerprint）→ 更新箱内种子。**只有显式跑它才会动账**，
 *                                      且账的变更进 commit、可审查（这是「可复现」与「追新」的边界）。
 *   `npm run sync:bundled -- --offline` 断网档：**不出网**，只用账里已有的指纹校验箱内种子。
 *                                      🔴 **指纹不符一律红——不许假装成功**（这是本档存在的全部意义）。
 *   另：`--dry-run` 只报不改（看「即将发生什么」，尤其修剪与追新）。
 *
 * ── 为什么默认档是「按 lock」而不是「按最新」──
 *   可复现。壳的发布是「打 tag → 事后可重建」的模型：**同一个 commit 必须装进同一个箱子**。
 *   若默认追最新，同一个 commit 在两天后构建出的产物就不同了。⇒ 刷账必须是**显式动作**（`--latest`）。
 *
 * ── bootstrap 清单的载体（🔴 硬约束 10 的红线）──
 *   「哪几只随包」= **账里 `seed: true` 的那些条目**（数据），不是本文件里的某张名单（代码）。
 *   本脚本**一个插件 id 字面量都没有**，也不许有——它只认账与目录。想改「谁随包」= 改数据。
 *
 * ── 网络口径（本机实测，2026-09-14）──
 *   `api.github.com` 直连可通；Release asset（`github.com/…/releases/download/…`）**要代理**。
 *   Node 的 fetch 不读系统代理 ⇒ 走代理请开 `NODE_USE_ENV_PROXY=1` 并设 `HTTPS_PROXY`（话术在 lib 里）。
 *
 * 退出码 0 = 齐/已拉齐；1 = 有红（缺种子 / 指纹不符 / 账与箱不符 / 网络失败）。
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { fingerprintZip, readZipVersion } from "./lib/bundled-fingerprint.mjs";
import {
  PLUGIN_REPO,
  compareVersions,
  catalogIndexOf,
  networkHint,
  readLatestReleaseTag,
  readOfficialCatalog,
} from "./lib/official-catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const BUNDLED_DIR = join(ROOT, "bundled-plugins");
const LOCK_PATH = join(ROOT, "bundled-plugins.lock.json");
const EXT = ".linkdesk-plugin";
/** 账的 schema 版本——结构变更时才 +1（读到不认识的版本 ⇒ 红，不猜） */
const SCHEMA_VERSION = 1;

/* ── 参数 ─────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const o = { latest: false, offline: false, dryRun: false, help: false, bad: null };
  for (const a of argv) {
    if (a === "--latest") o.latest = true;
    else if (a === "--offline") o.offline = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else o.bad = a;
  }
  return o;
}

function usage() {
  console.log(
    [
      "[sync-bundled] 出厂种子保鲜——按账把 bundled-plugins/ 拉齐（E6#101）",
      "",
      "  npm run sync:bundled                  复现档：按 lock 校验/拉取 + 修剪到 seed 集（可复现，不查新）",
      "  npm run sync:bundled -- --latest      追新档：读官方目录最新版 → 刷 lock + zip（显式动作）",
      "  npm run sync:bundled -- --offline     断网档：不出网，只按 lock 指纹校验（不符必红）",
      "  加 --dry-run 只报不改。",
      "",
      "  账 = bundled-plugins.lock.json（谁随包 = 账里 seed:true 的那些条目；改「谁随包」= 改数据）",
    ].join("\n"),
  );
}

/* ── 账（lock）读写 ───────────────────────────────────────────────── */

/** 读账；不存在 → null（调用方按「缺失即红」处置——不许由脚本凭空推断随包集） */
function readLock() {
  if (!existsSync(LOCK_PATH)) return null;
  const parsed = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.plugins)) {
    throw new Error("bundled-plugins.lock.json 结构不认识：缺 `plugins` 数组");
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `bundled-plugins.lock.json schemaVersion=${parsed.schemaVersion}，本脚本只认 ${SCHEMA_VERSION}` +
        `——结构变了要先升级脚本，不许猜着读`,
    );
  }
  return parsed;
}

/** 写账：字段顺序固定 + 2 空格缩进 + 结尾换行——diff 友好（账是要被审查的数据） */
function writeLock(lock, dryRun) {
  const out = {
    schemaVersion: SCHEMA_VERSION,
    syncedAt: lock.syncedAt,
    note: lock.note,
    plugins: lock.plugins.map((p) => ({
      id: p.id,
      repo: p.repo,
      version: p.version,
      downloadUrl: p.downloadUrl,
      fingerprint: p.fingerprint,
      seed: p.seed === true,
    })),
  };
  const text = `${JSON.stringify(out, null, 2)}\n`;
  if (dryRun) {
    console.log("[sync-bundled] （--dry-run）账本将写入，未落盘");
    return;
  }
  writeFileSync(LOCK_PATH, text, "utf8");
}

/* ── 箱内种子 ─────────────────────────────────────────────────────── */

/** 箱内现有 zip 的 id 列表（= 文件名基名；箱子按目录说话，不给任何名字特权） */
function boxIds() {
  if (!existsSync(BUNDLED_DIR)) return [];
  return readdirSync(BUNDLED_DIR)
    .filter((n) => n.endsWith(EXT))
    .map((n) => basename(n, EXT))
    .sort();
}

/** 读一只箱内 zip 的 `{ version, fingerprint }` */
async function readBoxZip(id) {
  const file = join(BUNDLED_DIR, `${id}${EXT}`);
  const zip = await JSZip.loadAsync(readFileSync(file));
  return { version: await readZipVersion(zip), fingerprint: await fingerprintZip(zip) };
}

/** 落一只 zip（先写 `.part` 再改名——不留半截产物） */
function placeZip(id, buf, dryRun) {
  if (dryRun) return;
  mkdirSync(BUNDLED_DIR, { recursive: true });
  const file = join(BUNDLED_DIR, `${id}${EXT}`);
  const tmp = `${file}.part`;
  writeFileSync(tmp, buf);
  renameSync(tmp, file);
}

/* ── 网络（下载 + 判错话术）───────────────────────────────────────── */

/** 拉一只已发布产物 → Buffer（🔴 **下载后要自己算指纹**——只信账里打印的 URL 会骗人） */
async function downloadAsset(url, what) {
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": "linkdesk-bundled-sync" }, redirect: "follow" });
  } catch (e) {
    const cause = e instanceof Error && e.cause ? e.cause.code || e.cause.message : null;
    throw new Error(networkHint(what, url) + (cause ? `\n   （底层错误：${cause}）` : ""));
  }
  if (!res.ok) throw new Error(`❌ 拉不到${what}：HTTP ${res.status} ${res.statusText}（${url}）`);
  return Buffer.from(await res.arrayBuffer());
}

/** 条目的直链：优先账里那一条（账是审查对象）；缺则按 GitHub Release 约定拼 */
function assetUrlOf(entry) {
  if (typeof entry.downloadUrl === "string" && entry.downloadUrl !== "") return entry.downloadUrl;
  return `https://github.com/${entry.repo}/releases/download/v${entry.version}/${entry.id}${EXT}`;
}

/* ── 主流程 ───────────────────────────────────────────────────────── */

const errors = [];
const red = (msg) => {
  errors.push(msg);
  console.error(`❌ ${msg}`);
};

/** 箱内出现账里没有的 zip / 非 seed 的 zip —— 按账修剪（箱子 ≡ 账的 seed 集） */
function pruneToSeedSet(lock, dryRun) {
  const seedIds = new Set(lock.plugins.filter((p) => p.seed === true).map((p) => p.id));
  const removal = boxIds().filter((id) => !seedIds.has(id));
  for (const id of removal) {
    const known = lock.plugins.find((p) => p.id === id);
    const why = known ? "账里 seed:false（纯市场、不随包）" : "⚠ 账里根本没有这条（来历不明的 zip）";
    console.log(`  − 移出箱子：${id}${EXT}（${why}）${dryRun ? "  [--dry-run 未删]" : ""}`);
    if (!dryRun) unlinkSync(join(BUNDLED_DIR, `${id}${EXT}`));
  }
  return removal.length;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.bad) {
    console.error(`[sync-bundled] 未知参数：${o.bad}`);
    usage();
    return 1;
  }
  if (o.help) {
    usage();
    return 0;
  }
  if (o.latest && o.offline) {
    console.error("[sync-bundled] 🔴 --latest 与 --offline 互相矛盾（一个要查新、一个不出网）——请二选一");
    return 1;
  }

  const lock = readLock();
  if (!lock) {
    console.error(
      "[sync-bundled] 🔴 账不在：bundled-plugins.lock.json\n" +
        "   它是「谁随包 + 每只从哪来 + 内容指纹」的**唯一数据真相源**（硬约束 10：随包集是数据不是代码）。\n" +
        "   缺失不能由脚本凭空推断（凭空推断出来的随包集 = 把名单写回代码里），必须**先把账建好并提交**。\n" +
        "   建账：人工确认 id/repo/version/downloadUrl/seed 后落盘，再跑 --latest 补齐指纹。",
    );
    return 1;
  }

  const seedEntries = lock.plugins.filter((p) => p.seed === true);
  const mode = o.latest ? "追新（--latest）" : o.offline ? "断网（--offline）" : "复现（按 lock）";
  console.log(
    `[sync-bundled] 档位：${mode}${o.dryRun ? " + --dry-run" : ""}｜账：${lock.plugins.length} 条，其中 seed:true ${seedEntries.length} 只`,
  );

  // ── 档 1：追新——读官方目录，刷账 + 更新箱内种子 ──
  if (o.latest) {
    console.log("[sync-bundled] 读官方目录（api.github.com Contents，无 CDN 缓存）……");
    const catalog = await readOfficialCatalog();
    const index = catalogIndexOf(catalog);
    // 「是我们的」判据 = 条目指向我们的插件仓（**不是 id 白名单**——与 sync-official-catalog 同规，硬约束 10）
    const oursIds = [...index.values()]
      .filter(
        (cat) =>
          (cat.downloadUrl && cat.downloadUrl.includes(`${PLUGIN_REPO.owner}/${PLUGIN_REPO.prefix}`)) ||
          (cat.repo && cat.repo.includes(`${PLUGIN_REPO.owner}/${PLUGIN_REPO.prefix}`)),
      )
      .map((cat) => cat.id);
    console.log(`[sync-bundled] 官方目录 ${catalog.plugins.length} 条（其中指向我们插件仓的 ${oursIds.length} 条）`);

    // 新增：目录里「是我们的」但账里没有的 → 补一条（seed:false —— 随包是人为决定，不自动放行）
    const known = new Set(lock.plugins.map((p) => p.id));
    for (const id of oursIds.filter((x) => !known.has(x))) {
      const cat = index.get(id);
      lock.plugins.push({
        id,
        repo: `${PLUGIN_REPO.owner}/${PLUGIN_REPO.prefix}${id}`,
        version: cat.version,
        downloadUrl: cat.downloadUrl,
        fingerprint: null,
        seed: false,
      });
      console.log(`  + 账里新增：${id}（官方目录里有、账里没有）——**seed 默认 false**（随包与否是人为决定，见账的 seed 字段）`);
    }

    for (const entry of lock.plugins) {
      const cat = index.get(entry.id);
      if (!cat) {
        if (entry.seed === true) {
          red(
            `随包种子 ${entry.id} 不在官方目录里——用户卸掉它之后**没地方拿回来**（这正是 L7 要解的痛点）。` +
              `先把它收录进官方目录（npm run catalog:official），再跑 --latest。`,
          );
        } else {
          console.warn(`  ⚠ ${entry.id} 不在官方目录里（账保留原样，不静默删条目）`);
        }
        continue;
      }
      const targetVersion = cat.version ?? entry.version;
      const targetUrl = cat.downloadUrl ?? assetUrlOf({ ...entry, version: targetVersion });
      const buf = await downloadAsset(targetUrl, `${entry.id} 的已发布产物`);
      const zip = await JSZip.loadAsync(buf);
      const fingerprint = await fingerprintZip(zip);
      const zipVersion = await readZipVersion(zip);
      if (zipVersion !== targetVersion) {
        red(
          `${entry.id}：目录写 ${targetVersion}，拉下来的包里 plugin.json 写 ${zipVersion}` +
            `——目录与产物不符（账不许把一个说不清来历的箱子交出去）`,
        );
        continue;
      }
      const oldVersion = entry.version;
      const changed = oldVersion !== targetVersion;
      entry.version = targetVersion;
      entry.downloadUrl = targetUrl;
      entry.fingerprint = fingerprint;
      if (changed) console.log(`  ↑ ${entry.id}：${oldVersion} → ${targetVersion}${entry.seed === true ? "（随包，已更新箱内种子）" : "（纯市场，仅账）"}`);
      else console.log(`  = ${entry.id}@${targetVersion}（已是最新，指纹已核对）`);
      if (entry.seed === true) placeZip(entry.id, buf, o.dryRun);
      // 「目录落后于 Release」窗口提示（publish 是第一步、收录目录是第二步，中间有窗口）
      const releaseTag = await readLatestReleaseTag(entry.repo);
      if (releaseTag && compareVersions(releaseTag, targetVersion) > 0) {
        console.warn(
          `  ⚠ ${entry.id}：插件仓已发 v${releaseTag}，官方目录还停在 ${targetVersion}` +
            `（收录是第二步）⇒ 箱子跟**目录**走（用户能装到的就是目录那版）。补收录：npm run catalog:official`,
        );
      }
    }
    lock.syncedAt = new Date().toISOString();
    writeLock(lock, o.dryRun);
    pruneToSeedSet(lock, o.dryRun);
    return report(lock, o);
  }

  // ── 档 2/3：复现（可联网补件）与断网（只校验） ──
  const allowRepair = !o.offline;
  for (const entry of seedEntries) {
    const present = existsSync(join(BUNDLED_DIR, `${entry.id}${EXT}`));
    let actual = null;
    if (present) {
      try {
        actual = await readBoxZip(entry.id);
      } catch (e) {
        red(`${entry.id}：箱内 zip 打不开——${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }
    const versionOk = present && actual.version === entry.version;
    const fpOk = present && actual.fingerprint === entry.fingerprint;
    if (versionOk && fpOk) {
      console.log(`  ✓ ${entry.id}@${entry.version}（版本 + 指纹与账一致）`);
      continue;
    }
    const why = !present ? "箱内没有这只种子" : !versionOk ? `箱内 ${actual.version} ≠ 账 ${entry.version}` : "内容指纹与账不符";
    if (!allowRepair) {
      red(`${entry.id}：${why}——**--offline 只用账里已有的指纹校验，不许假装成功**（它是断网复现的判据）`);
      continue;
    }
    console.log(`  ↓ ${entry.id}：${why} → 按账从直链拉 ${entry.version} 覆盖`);
    const url = assetUrlOf(entry);
    let buf;
    try {
      buf = await downloadAsset(url, `${entry.id} 的已发布产物`);
    } catch (e) {
      red(`${entry.id}：${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const zip = await JSZip.loadAsync(buf);
    const fingerprint = await fingerprintZip(zip);
    const version = await readZipVersion(zip);
    if (fingerprint !== entry.fingerprint || version !== entry.version) {
      red(
        `${entry.id}：拉回来的产物与账不符（账 ${entry.version}/指纹 ${entry.fingerprint.slice(0, 12)}…，` +
          `实得 ${version}/指纹 ${fingerprint.slice(0, 12)}…）——账过期或上游重传了内容。` +
          `**不写进箱子**：账与箱子对不上时，宁可不装也不许装错。跑 --latest 刷账后重来。`,
      );
      continue;
    }
    placeZip(entry.id, buf, o.dryRun);
  }
  pruneToSeedSet(lock, o.dryRun);
  return report(lock, o);
}

/** 收尾小结 + 退出码 */
function report(lock, o) {
  const seeds = lock.plugins.filter((p) => p.seed === true).length;
  console.log(
    `\n[sync-bundled] 箱内 ${boxIds().length} 只（账 seed:true ${seeds} 只 / 账共 ${lock.plugins.length} 条）` +
      `${o.dryRun ? "｜--dry-run：未写任何东西" : ""}`,
  );
  if (errors.length > 0) {
    console.error(`\n[sync-bundled] 🔴 ${errors.length} 处红——出厂种子未拉齐，别打包。`);
    return 1;
  }
  console.log("[sync-bundled] ✓ 出厂种子与账一致。");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`[sync-bundled] 脚本异常：${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
