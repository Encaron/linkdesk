#!/usr/bin/env node
/**
 * `check-bundled-freshness`——出厂种子的**新鲜度门禁**（E6#101，L7 第 7.4 轮）。
 *
 * ── 它管什么（与隔壁门禁的**分工**，别搞混）──
 *   `check-bundled-version-bump`：**内容纪律**——改了箱内 zip 的内容就必须 bump 那只插件的 version；
 *   本门禁：**新鲜度**——箱子里这颗种子是不是「官方目录里的最新版」。
 *   两者**正交**：同一个 zip 可以既满足前者又落后于后者（内容与版本号一致 ≠ 它是最新版）。
 *
 * ── 判据（四红一警）──
 *   ① 账在（`bundled-plugins.lock.json`；缺 ⇒ 红——它是「谁随包」的数据真相源）
 *   ② 箱内**恰好**是账的 `seed:true` 集：少一只 ⇒ 红；多一只（含账里没有的 zip）⇒ 红
 *      ⇒ 箱子与账不一致时**不装东西**：宁可拦住，也不许「说不清箱子里是什么」就发货
 *   ③ 每只箱内种子的 **version + 内容指纹** 与账一致（换旧版 zip / 手改 zip ⇒ 红）
 *   ④ 联网比对：每只随包种子的版本 **≥ 官方目录该插件最新版**；落后 ⇒ 红；不在目录里 ⇒ 红
 *      （不在目录 = 用户卸了拿不回来——那正是 L7 要解的痛点，必须拦）
 *   ⚠ 目录**落后于** Release（publish 第一步与收录第二步之间的窗口）只提示不判红——见下「判定方向」。
 *
 * ── 判定方向：为什么是「目录 > 箱 ⇒ 红」，而不是「不相等就红」──
 *   官方目录那条读取路径（raw CDN）实测有 `max-age=300` 缓存（7.3 `#100c-2`：写完约 5 分钟才翻档）。
 *   定成「不相等就红」的话，**缓存滞后会让箱子被判成「超前」而假红**——而假红会让真红失效（本仓最贵的坏法）。
 *   取「目录比箱新才红」之后，任何缓存滞后都只会**延迟发现落后**，**永不假红**。
 *
 * ── 联网口径（2026-09-14 用户裁）──
 *   `npm run check` 里默认**联网**比对：**无网络时红**（不许假装绿），并提示 `--offline` 档
 *   ——那是**明示降级**（只做①②③，打印一行 ⚠ 说明新鲜度这一半未生效），不是静默放行。
 *
 * 用法：
 *   node scripts/check-bundled-freshness.mjs               # 挂 npm run check（联网）
 *   node scripts/check-bundled-freshness.mjs --offline     # 明示降级：只校验箱子与账一致（不出网）
 *   node scripts/check-bundled-freshness.mjs --self-test   # 合成 fixture 负控（不碰网络、不碰真箱）
 * 退出码 0 = 全过，1 = 有红（打印到 stderr）。
 */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { fingerprintZip, readZipVersion } from "./lib/bundled-fingerprint.mjs";
import { catalogIndexOf, compareVersions, readOfficialCatalog } from "./lib/official-catalog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BUNDLED_DIR = join(ROOT, "bundled-plugins");
const LOCK_PATH = join(ROOT, "bundled-plugins.lock.json");
const EXT = ".linkdesk-plugin";

/* ── ① ② ③：箱子 ↔ 账（离线可判，负控就钉在这一段）─────────────── */

/**
 * @returns {Promise<{errors: string[], checked: number}>}
 */
async function checkBoxAgainstLock(lock, bundledDir) {
  const errors = [];
  const seedEntries = lock.plugins.filter((p) => p.seed === true);
  const seedIds = new Set(seedEntries.map((p) => p.id));
  const boxIds = existsSync(bundledDir)
    ? readdirSync(bundledDir)
        .filter((n) => n.endsWith(EXT))
        .map((n) => basename(n, EXT))
    : [];

  // ② 箱内必须恰好是 seed 集——**多与少都红**
  for (const entry of seedEntries) {
    if (!boxIds.includes(entry.id)) {
      errors.push(`随包种子 ${entry.id} 不在箱内（账 seed:true）——箱子少了随包件；跑 npm run sync:bundled 拉齐`);
    }
  }
  for (const id of boxIds) {
    if (!seedIds.has(id)) {
      const known = lock.plugins.find((p) => p.id === id);
      errors.push(
        `箱内多出 ${id}${EXT}（${known ? "账里 seed:false——它是纯市场件，不该随包" : "账里根本没有这条"}）` +
          `——箱子与账不一致；跑 npm run sync:bundled 修剪`,
      );
    }
  }

  // ③ 逐只：version + 内容指纹与账一致
  let checked = 0;
  /** 箱内实际版本（供 ④ 拿**箱子**去比官方目录——判据问的是「箱里这颗新不新」，不是「账写得新不新」） */
  const boxVersions = new Map();
  for (const entry of seedEntries) {
    if (!boxIds.includes(entry.id)) continue;
    const file = join(bundledDir, `${entry.id}${EXT}`);
    let version;
    let fingerprint;
    try {
      const zip = await JSZip.loadAsync(readFileSync(file));
      version = await readZipVersion(zip);
      fingerprint = await fingerprintZip(zip);
    } catch (e) {
      errors.push(`${entry.id}：箱内 zip 打不开——${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    boxVersions.set(entry.id, version);
    if (version !== entry.version) {
      errors.push(`${entry.id}：箱内 ${version} ≠ 账 ${entry.version}——换成了别的版本（旧版/手放版）；跑 sync:bundled 拉齐`);
      continue;
    }
    if (fingerprint !== entry.fingerprint) {
      errors.push(
        `${entry.id}：箱内 ${version} 的内容指纹与账不符——**同一版本号被换了内容**（发行纪律禁止重打同版）。` +
          `若这是有意的内容变更 ⇒ 去插件仓 bump 版本后发版，再跑 sync:bundled --latest。`,
      );
      continue;
    }
    checked += 1;
  }
  return { errors, checked, boxVersions };
}

/* ── ④：箱子 ↔ 官方目录（联网；判定方向见文件头）────────────────── */

/**
 * 比的是**箱内那只看得到的版本**（不是账里的版本——账与箱不一致时，①②③ 已经先报了；
 * 此处若改读账，就会出现「箱子明明是旧的、新鲜度却说 6/6 全过」的错读，2026-09-14 负控实测踩到）。
 * @param {Map<string, string|null>} boxVersions 箱内实际版本（`checkBoxAgainstLock` 的读数）
 * @param {Map<string, {version: string|null}>} catalogIndex
 * @returns {{errors: string[], warns: string[], checked: number}}
 */
function judgeFreshness(lock, boxVersions, catalogIndex) {
  const errors = [];
  const warns = [];
  let checked = 0;
  for (const entry of lock.plugins.filter((p) => p.seed === true)) {
    const cat = catalogIndex.get(entry.id);
    if (!cat) {
      errors.push(
        `随包种子 ${entry.id} 不在官方目录里——用户卸掉它之后**没有地方装回来**（L7 要解的痛点原样复发）。` +
          `先收录：npm run catalog:official`,
      );
      continue;
    }
    if (!cat.version) {
      warns.push(`${entry.id}：官方目录条目没有版本号字段——本次不比新鲜度（条目本身该修）`);
      continue;
    }
    const boxVersion = boxVersions.get(entry.id) ?? entry.version;
    if (compareVersions(cat.version, boxVersion) > 0) {
      errors.push(
        `${entry.id}：箱内 ${boxVersion} **落后于**官方目录 ${cat.version}——` +
          `新用户下载软件就拿不到第二版插件（E6#101 的立项目标）。修：npm run sync:bundled -- --latest`,
      );
      continue;
    }
    checked += 1;
  }
  return { errors, warns, checked };
}

/* ── 主流程 ───────────────────────────────────────────────────────── */

async function run({ offline }) {
  const errors = [];

  if (!existsSync(LOCK_PATH)) {
    console.error(
      "❌ 账不在：bundled-plugins.lock.json——它是「谁随包 + 每只从哪来 + 内容指纹」的唯一数据真相源。\n" +
        "   没有账就没有可判的新鲜度（也说明这份箱子的来历无法审查）。E6#101 的产物之一，别删。",
    );
    return 1;
  }
  const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  if (!Array.isArray(lock.plugins)) {
    console.error("❌ bundled-plugins.lock.json 结构不认识：缺 `plugins` 数组");
    return 1;
  }

  const local = await checkBoxAgainstLock(lock, BUNDLED_DIR);
  errors.push(...local.errors);
  const seeds = lock.plugins.filter((p) => p.seed === true).length;
  console.log(
    `[bundled-freshness] 账 ${lock.plugins.length} 条（seed:true ${seeds} 只）｜箱内与账一致 ${local.checked}/${seeds} 只`,
  );

  if (offline) {
    console.warn(
      "[bundled-freshness] ⚠ --offline：**新鲜度这一半未生效**（没查官方目录）——只验了「箱子与账一致」。" +
        "联网环境请不带该参数重跑；发布前那一跑必须是联网档。",
    );
  } else {
    let catalog;
    try {
      catalog = await readOfficialCatalog();
    } catch (e) {
      // 无网络 ⇒ 红（不许假装绿）。话术已在 lib 里（含代理与 GITHUB_TOKEN 的下一步）。
      console.error(`${e instanceof Error ? e.message : String(e)}`);
      console.error(
        "\n❌ 本门禁默认联网（判「箱子是否落后于官方目录」）。要**明示降级**请跑：\n" +
          "   node scripts/check-bundled-freshness.mjs --offline   （只验箱子与账一致，不判新鲜度）",
      );
      return 1;
    }
    const index = catalogIndexOf(catalog);
    const fresh = judgeFreshness(lock, local.boxVersions, index);
    errors.push(...fresh.errors);
    for (const w of fresh.warns) console.warn(`  ⚠ ${w}`);
    console.log(`[bundled-freshness] 官方目录 ${catalog.plugins.length} 条｜新鲜度已比对 ${fresh.checked}/${seeds} 只`);
    // 目录整体读数：让「目录里我们有多少条」在日志里留痕（箱子只装 seed 集，但官方全集要看得到）
    const oursInCatalog = [...index.keys()].length;
    console.log(`[bundled-freshness] 官方目录可见条目（含纯市场件）：${oursInCatalog} 只`);
  }

  if (errors.length > 0) {
    console.error(`\n[bundled-freshness] 🔴 ${errors.length} 处红：`);
    for (const e of errors) console.error(`   · ${e}`);
    return 1;
  }
  console.log(
    offline
      ? "[bundled-freshness] ✓ 箱内与账一致（⚠ 新鲜度这一半按 --offline 未验——发布前必须联网再跑一次）"
      : "[bundled-freshness] ✓ 出厂种子新鲜且与账一致。",
  );
  return 0;
}

/* ── --self-test：合成 fixture 负控（不碰网络、不碰真箱子）────────── */

async function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "bundled-freshness-selftest-"));
  const boxDir = join(tmp, "bundled-plugins");
  mkdirSync(boxDir, { recursive: true });

  /** 造一只最小插件 zip（plugin.json 带 version） */
  const mkZip = async (version) => {
    const z = new JSZip();
    z.file("plugin.json", JSON.stringify({ pluginId: "demo-seed", version }));
    return z.generateAsync({ type: "nodebuffer" });
  };
  /** 造一只 zip 并算出它的指纹（账要用同一份算法） */
  const makeEntry = async (id, version, seed) => {
    const buf = await mkZip(version);
    const zip = await JSZip.loadAsync(buf);
    writeFileSync(join(boxDir, `${id}${EXT}`), buf);
    return { id, repo: `demo/${id}`, version, downloadUrl: `https://example.invalid/${id}`, fingerprint: await fingerprintZip(zip), seed };
  };

  const results = [];
  const check = (tag, ok, detail = "") => {
    results.push({ tag, ok });
    console.log(`${ok ? "✅" : "🔴"} ${tag}${detail ? ` —— ${detail}` : ""}`);
  };

  try {
    // 基线：一只 seed + 一只纯市场（不在箱里）
    const baseSeed = await makeEntry("demo-base", "1.0.0", true);
    const lock = { schemaVersion: 1, plugins: [baseSeed, { id: "demo-market", repo: "demo/demo-market", version: "2.0.0", downloadUrl: "https://example.invalid/m", fingerprint: "x", seed: false }] };

    // 正例：箱内 = seed 集且指纹一致 → 无红
    let r = await checkBoxAgainstLock(lock, boxDir);
    check("正例：箱内与账一致 → 放行", r.errors.length === 0 && r.checked === 1, r.errors.join(" | "));

    // 负控 1（05 §六 点名的那条）：把 zip 换成**旧版本** ⇒ 必红
    const oldBuf = await mkZip("0.9.0");
    writeFileSync(join(boxDir, "demo-base.linkdesk-plugin"), oldBuf);
    r = await checkBoxAgainstLock(lock, boxDir);
    check("负控：箱内换成旧版本 zip ⇒ 红", r.errors.some((e) => e.includes("≠ 账")), r.errors.join(" | "));

    // 负控 2：同版本号换内容（指纹不符）⇒ 必红
    const sameVerDiffContent = new JSZip();
    sameVerDiffContent.file("plugin.json", JSON.stringify({ pluginId: "demo-seed", version: "1.0.0" }));
    sameVerDiffContent.file("README.md", "内容变了但版本没 bump\n");
    writeFileSync(join(boxDir, "demo-base.linkdesk-plugin"), await sameVerDiffContent.generateAsync({ type: "nodebuffer" }));
    r = await checkBoxAgainstLock(lock, boxDir);
    check("负控：同版本号换内容（指纹不符）⇒ 红", r.errors.some((e) => e.includes("内容指纹")), r.errors.join(" | "));

    // 负控 3：箱内多一只纯市场件 ⇒ 必红（箱子必须恰好等于 seed 集）
    writeFileSync(join(boxDir, "demo-base.linkdesk-plugin"), await mkZip("1.0.0"));
    writeFileSync(join(boxDir, "demo-market.linkdesk-plugin"), await mkZip("2.0.0"));
    r = await checkBoxAgainstLock(lock, boxDir);
    check("负控：箱内混进纯市场件 ⇒ 红", r.errors.some((e) => e.includes("箱内多出")), r.errors.join(" | "));
    rmSync(join(boxDir, "demo-market.linkdesk-plugin"), { force: true });

    // 负控 4：seed 缺失 ⇒ 必红
    const emptyDir = join(tmp, "empty-box");
    mkdirSync(emptyDir, { recursive: true });
    r = await checkBoxAgainstLock(lock, emptyDir);
    check("负控：随包种子缺失 ⇒ 红", r.errors.some((e) => e.includes("不在箱内")), r.errors.join(" | "));

    // ④ 新鲜度判定方向：目录更新 ⇒ 红；持平 ⇒ 绿；**箱子更新（目录滞后）⇒ 绿**（Cache-Control 滞后不假红）
    const box = new Map([["demo-base", "1.0.0"]]); // 箱内实际版本
    const ahead = judgeFreshness(lock, box, new Map([["demo-base", { version: "1.1.0" }]]));
    check("负控：官方目录比箱内新 ⇒ 红", ahead.errors.some((e) => e.includes("落后于")), ahead.errors.join(" | "));
    const even = judgeFreshness(lock, box, new Map([["demo-base", { version: "1.0.0" }]]));
    check("正例：目录与箱内同版 ⇒ 放行", even.errors.length === 0, even.errors.join(" | "));
    const behind = judgeFreshness(lock, box, new Map([["demo-base", { version: "0.9.0" }]]));
    check("正例：箱子比目录新（目录 CDN 滞后）⇒ 放行不假红", behind.errors.length === 0, behind.errors.join(" | "));
    const absent = judgeFreshness(lock, box, new Map());
    check("负控：随包种子不在官方目录 ⇒ 红（卸了拿不回来）", absent.errors.some((e) => e.includes("装回来")), absent.errors.join(" | "));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const failed = results.filter((x) => !x.ok);
  console.log(
    `\n[bundled-freshness] self-test：${results.length - failed.length}/${results.length} 例过` +
      `${failed.length ? `（失败：${failed.map((f) => f.tag).join("、")}）` : "——闸不是在恒绿、也不是在恒红"}`,
  );
  return failed.length === 0 ? 0 : 1;
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  process.exit(await selfTest());
} else if (argv.some((a) => a !== "--offline")) {
  console.error(`[bundled-freshness] 未知参数：${argv.filter((a) => a !== "--offline").join(" ")}`);
  process.exit(1);
} else {
  process.exit(await run({ offline: argv.includes("--offline") }));
}
