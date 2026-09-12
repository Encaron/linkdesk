/**
 * E6#57.15a：把发布身份写进 `electron/product.json`——版本 / commit / 构建日期 / 质量通道。
 *
 * 为什么必须由脚本写、不许手抄（02-产品身份与版本 §2.3）：
 *   `package.json` 的 version 是发布时的**唯一真值**；product.json 里再写一份手抄的版本号，
 *   就是第二份真相——两份迟早不一样。规则原话：「任何地方都不手写第二份版本号」。
 *   运行时版本走 `app.getVersion()`（Electron 直接读 package.json），product.json 的 version
 *   **只供打包产物自证**（`#57.15c` 解包 asar 复核的就是它）。
 *
 * 🔴 被写进去的四个字段各自防一件事：
 *   - `version`  ← `package.json`（不是手抄）——供产物自证与发布门禁比对
 *   - `commit`   ← `git rev-parse --short HEAD`——回答「用户装的是哪个提交」
 *   - `date`     ← 构建时刻（UTC ISO 8601）——回答「这个包什么时候造的」
 *   - `quality`  ← 当前恒 `stable`（02 §2.2 的 preview 通道第二版才启用）
 *
 * ── 开发期 vs 发布期（02 §2.3 明写：开发期留占位）──
 *   dev 打包**不调用本脚本**，`electron/product.json` 保持占位（version 0.1.0 / commit/date 空）。
 *   发布期调用它。**动过这个文件就必须还原**——否则仓库里躺着一份发布期的版本号，
 *   下次有人提交时顺手带上，就又变成「手写第二份」。故本脚本：
 *     · 写之前把**原始字节**备份到系统临时目录
 *     · `--restore` 逐字节还原（不是「重写一份占位」，是**原样放回**）
 *     · 编排者 scripts/publish.mjs 用 try/finally 保证「构建炸了也还原」
 *
 * 真值来源一律**现场读**（package.json / git / 时钟），无一字写死在本文件里。
 * 唯一的字面量是 `quality: 'stable'`——因为它是**产品决策**（02 §2.2），不是可推导值。
 *
 * 用法：
 *   node scripts/write-product-json.mjs            # 写（发布期；自动备份原文件）
 *   node scripts/write-product-json.mjs --restore  # 逐字节还原成写之前的样子
 *   node scripts/write-product-json.mjs --assert   # 只断言：product.json 的 version === package.json
 *   node scripts/write-product-json.mjs --self-test
 * 退出码 0 = 成功；1 = 红（打印到 stderr）。
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG = join(ROOT, "package.json");
const PRODUCT = join(ROOT, "electron", "product.json");
/** 备份放系统临时目录——**不落仓库**，免得留下的 .bak 被误提交或误当真理源。 */
const BACKUP = join(tmpdir(), "linkdesk-product-json.backup.json");

/** 当前质量通道。写死是**产品决策**（02 §2.2：preview 第二版才用），不是推导值。 */
const QUALITY = "stable";

// ─────────────────────────── 纯判据（--self-test 注入输入） ───────────────────────────

/**
 * 用现场真值生成发布期 product.json 的内容。
 * **只覆盖四个字段，其余原样保留**——`updateUrl` 是更新源（丢了就等于更新器瞎了）、
 * nameLong/nameShort 是品牌名，都不归本脚本管。
 * 返回**字符串**（保持 2 空格缩进 + 末尾换行，与既有文件同形，diff 才不会满屏）。
 */
function renderProduct(current, { version, commit, date }) {
  const next = { ...current, version, commit, date, quality: QUALITY };
  return JSON.stringify(next, null, 2) + "\n";
}

/** 判定 product.json 内容是否自证一致（version 同步 + 更新源在位）。 */
function checkProductContent(text, pkgVersion) {
  if (typeof text !== "string") {
    return { ok: false, msg: "product.json 读不出来" };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, msg: `product.json 不是合法 JSON：${e.message}` };
  }
  const problems = [];
  if (parsed.version !== pkgVersion) {
    problems.push(`version 不一致：product.json = ${JSON.stringify(parsed.version)}，package.json = ${pkgVersion}`);
  }
  if (typeof parsed.updateUrl !== "string" || parsed.updateUrl === "") {
    problems.push("updateUrl 是空串（更新源丢了 ⇒ 更新器瞎）");
  }
  return problems.length === 0
    ? { ok: true, msg: `product.json 自证一致（version = ${pkgVersion}，updateUrl 非空）` }
    : { ok: false, msg: `product.json 不合格：\n      ${problems.join("\n      ")}` };
}

/** 取 git HEAD 短哈希。取不到 → 抛（**不静默填空串**：空 commit 会伪装成「注入成功」）。 */
function gitHead() {
  return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

/** ISO 8601 到秒（`2026-09-12T06:31:14Z`）——`schema` 的示例形状不带毫秒。 */
function buildDate(now) {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function fail(msg) {
  process.stderr.write(`\n🔴 ${msg}\n`);
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const CUR = {
    nameLong: "LinkDesk",
    nameShort: "LinkDesk",
    version: "0.1.0",
    commit: "",
    date: "",
    quality: "stable",
    updateUrl: "https://api.github.com/repos/encaron/linkdesk/releases/latest",
  };

  const cases = [];
  const push = (tag, result, wantOk) => cases.push([tag, result, wantOk]);

  // ── renderProduct ──
  const rendered = JSON.parse(
    renderProduct(CUR, { version: "0.1.50", commit: "abc1234", date: "2026-09-12T06:31:14Z" })
  );
  push(
    "写入(四个字段被覆盖)",
    {
      ok:
        rendered.version === "0.1.50" &&
        rendered.commit === "abc1234" &&
        rendered.date === "2026-09-12T06:31:14Z" &&
        rendered.quality === "stable",
      msg: JSON.stringify(rendered),
    },
    true
  );
  push(
    "写入(其余字段原样保留)",
    {
      ok:
        rendered.updateUrl === CUR.updateUrl && rendered.nameLong === "LinkDesk" && rendered.nameShort === "LinkDesk",
      msg: JSON.stringify({ updateUrl: rendered.updateUrl }),
    },
    true
  );
  push(
    "写入(缩进 2 空格 + 末尾换行)",
    { ok: renderProduct(CUR, { version: "1", commit: "c", date: "d" }).endsWith("\n"), msg: "末尾换行" },
    true
  );

  // ── checkProductContent ──
  push(
    "自证(一致)",
    checkProductContent(
      renderProduct(CUR, { version: "0.1.50", commit: "abc1234", date: "2026-09-12T06:31:14Z" }),
      "0.1.50"
    ),
    true
  );
  push(
    "自证(version 不一致)",
    checkProductContent(renderProduct(CUR, { version: "0.1.49", commit: "c", date: "d" }), "0.1.50"),
    false
  );
  push(
    "自证(updateUrl 空串)",
    checkProductContent(JSON.stringify({ version: "0.1.50", updateUrl: "" }), "0.1.50"),
    false
  );
  push("自证(坏 JSON)", checkProductContent("{ nope", "0.1.50"), false);
  push("自证(读不出来)", checkProductContent(null, "0.1.50"), false);

  // ── buildDate ──
  push(
    "日期(毫秒被去掉)",
    { ok: buildDate(new Date("2026-09-12T06:31:14.987Z")) === "2026-09-12T06:31:14Z", msg: buildDate(new Date()) },
    true
  );

  let bad = 0;
  for (const [tag, result, wantOk] of cases) {
    const pass = result.ok === wantOk;
    if (!pass) bad++;
    process.stdout.write(
      `${pass ? "✅" : "🔴"} ${tag} ${wantOk ? "应过" : "应红"} —— 实得 ${result.ok ? "过" : "红"}\n`
    );
    if (!pass) fail(result.msg);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ 自测全过（${cases.length} 例）——判据不是在恒绿。\n`
      : `\n🔴 自测 ${bad} 例不符。\n`
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const pkgVersion = JSON.parse(readFileSync(PKG, "utf8")).version;

  if (process.argv.includes("--assert")) {
    const r = checkProductContent(existsSync(PRODUCT) ? readFileSync(PRODUCT, "utf8") : null, pkgVersion);
    process.stdout.write(`${r.ok ? "✅" : "🔴"} ${r.msg}\n`);
    if (!r.ok) process.exit(1);
    return;
  }

  if (process.argv.includes("--restore")) {
    if (!existsSync(BACKUP)) {
      fail(
        `没有可还原的备份（${BACKUP}）。\n    要么从没跑过写入，要么临时目录被清过——` +
          `此时别手动「写回一份占位」：占位值不是推导出来的，手抄就又成了第二份真相。\n    正解 = git checkout -- electron/product.json（让它回到 HEAD 的样子）。`
      );
      process.exit(1);
    }
    copyFileSync(BACKUP, PRODUCT);
    process.stdout.write(`✅ 已逐字节还原 ${PRODUCT}\n`);
    return;
  }

  // 默认 = 写入
  if (!existsSync(PRODUCT)) {
    fail(`找不到 ${PRODUCT}——发布身份文件不该缺席，先查它是不是被删/被改名了。`);
    process.exit(1);
  }
  let commit;
  try {
    commit = gitHead();
  } catch (e) {
    fail(`取不到 git HEAD（${e.message}）——不填空串：空 commit 会伪装成「注入成功」。`);
    process.exit(1);
  }

  copyFileSync(PRODUCT, BACKUP); // 先备份原始字节，供 --restore 逐字节放回
  const current = JSON.parse(readFileSync(PRODUCT, "utf8"));
  const next = renderProduct(current, { version: pkgVersion, commit, date: buildDate(new Date()) });
  writeFileSync(PRODUCT, next);
  process.stdout.write(`  写入 electron/product.json：version=${pkgVersion} commit=${commit}\n`);

  // 写完立刻回读断言——不回读就等于「写成功」全凭 writeFileSync 不抛异常
  const r = checkProductContent(readFileSync(PRODUCT, "utf8"), pkgVersion);
  process.stdout.write(`${r.ok ? "✅" : "🔴"} ${r.msg}\n`);
  if (!r.ok) {
    fail("写入后回读不合格——原文件已备份，" + `还原：node scripts/write-product-json.mjs --restore`);
    process.exit(1);
  }
}

main();
