#!/usr/bin/env node
/**
 * 构建期收割（第 5 波 T6 件 1）：随包插件的 `contributes.fileAssociations[].extension`
 *   → **安装器静态扩展名清单**（唯一真相源，两份同源产物）。
 *
 * ── 为什么要它 ──
 * 「打开方式」候选（`HKCU\Software\Classes\<ext>\OpenWithProgids`）今天有两处来源：
 *   ① **静态半**：安装时就写好的一批扩展名——本轮之前是 `syswrite.cpp` 里**手抄的 13 条**
 *      （外加 `registry-integration.ts` 里手抄的第二份、`build/installer.nsh` 的待删后路、
 *      两支 PS 验收脚本），与随包插件真正声明的 45 条**已经漂移**。
 *   ② **动态半**：插件装/卸时增撤的那部分（`electron/services/os-associations.ts`）。
 * 本脚本把 ① 的清单改成**从声明收割**（`E27`：两处清单必然漂移 ⇒ 只留一处真源），
 * 一份收割出两份产物：安装器 C++ 头 + 运行期 TS 常量，`--check` 逐字节比对。
 *
 * ── 判据（写完即锁，负控必须真红）──
 *   · **E27 唯一性**：同一扩展名被两只随包插件声明 ⇒ 红（列全声明方）——安装器静态清单
 *     没法表达「两家抢一个类型」，出现即说明随包件之间冲突，必须回插件仓解决。
 *   · **可执行类禁登记**：`.exe/.com/.scr/…` 出现即红（`EXECUTABLE_DENY`）——「exe 永不登记」
 *     是 T6 判据 ③。**判红而不是静默剔除**：静默剔除会让「清单 = 声明」不成立，
 *     判据「逐字节一致」就没法陈述了。
 *   · **形状**：归一化（去点、去空白、小写）后必须匹配 `EXT_SHAPE`，否则红。
 *
 * ── 用法 ──
 *   node scripts/gen-assoc-exts.mjs              # 收割并写两份产物
 *   node scripts/gen-assoc-exts.mjs --check      # 只比对（挂 npm run check；红 = 忘了重收）
 *   node scripts/gen-assoc-exts.mjs --self-test  # 门禁自测：正控 + 三条负控必须真红
 * 退出码 0 = 合规；1 = 判红。
 *
 * ⚠️ 本轮只收 **seed:true** 的随包件（`bundled-plugins/` 下真有 zip 的那 6 只）——非 seed 行
 * 是市场目录行、本机没有 zip，不属于「随包」。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { readZipManifest } from "./lib/bundled-fingerprint.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const LOCK_REL = "bundled-plugins.lock.json";
const BUNDLED_DIR_REL = "bundled-plugins";
/** 产物 ①：安装器引导器编译源（syswrite.cpp `#include` 它） */
const HEADER_REL = "build/installer/bootstrapper/lk-assoc-exts.generated.h";
/** 产物 ②：运行期静态清单（registry-integration / os-associations 消费） */
const TS_REL = "electron/services/os-associations-static.generated.ts";

/**
 * 可执行类扩展名（无点小写）——**上了就是装错东西**：这类「文件类型」不是「可编辑的文档」，
 * 登记进「打开方式」等于把 LinkDesk 摆成它们的编辑器候选。T6 判据 ③「exe 永不登记」的实现。
 * ⚠️ 只列**二进制容器/快捷方式**——`.bat`/`.cmd`/`.sh`/`.ps1` 是文本脚本，`editor` 就正经声明了
 *    `.bat`/`.cmd`（当文本编辑），故**不在**禁列。
 */
const EXECUTABLE_DENY = new Set([
  "exe", "com", "scr", "pif", "msi", "msp", "cpl", "dll", "sys", "drv", "ocx", "lnk",
]);

/** 归一化后的扩展名形状：字母数字起头，其后字母数字 / `+` / `_` / `-`（`.c++` `.f#` 这类先不收） */
const EXT_SHAPE = /^[a-z0-9][a-z0-9+_-]*$/;

/** 归一化：去首尾空白 → 去前导点 → 小写（`".MD"` / `"md"` / `". md"` 同归一） */
export function normalizeExt(raw) {
  return typeof raw === "string" ? raw.trim().replace(/^\.+/, "").toLowerCase() : "";
}

/**
 * 从一份插件清单声明里取出候选扩展名（容忍三种写法：字符串数组 / `{extension}` 数组 / 单条对象）。
 * @returns {unknown[]} 原始（未归一）候选串
 */
function rawExtensionsOf(pluginJson) {
  const fa = pluginJson?.contributes?.fileAssociations;
  if (Array.isArray(fa)) {
    return fa.map((item) =>
      typeof item === "string" ? item : (item && typeof item.extension === "string" ? item.extension : null)
    ).filter((x) => x !== null);
  }
  if (fa && typeof fa === "object" && typeof fa.extension === "string") return [fa.extension];
  return [];
}

/**
 * 纯判据：把「各随包插件的声明」收成清单——单测/自测只打这个函数。
 * @param {Array<{id: string, json: any}>} manifests 逐只随包件的 plugin.json
 * @returns {{exts: string[], conflicts: Array<{ext: string, plugins: string[]}>,
 *            denied: Array<{ext: string, plugin: string}>, invalid: Array<{raw: string, plugin: string}>}}
 */
export function collectExtensions(manifests) {
  /** ext → 声明方（保序去重） */
  const byExt = new Map();
  const denied = [];
  const invalid = [];

  for (const { id, json } of manifests) {
    for (const raw of rawExtensionsOf(json)) {
      const ext = normalizeExt(raw);
      if (!ext || !EXT_SHAPE.test(ext)) {
        invalid.push({ raw: String(raw), plugin: id });
        continue;
      }
      if (EXECUTABLE_DENY.has(ext)) {
        denied.push({ ext, plugin: id });
        continue; // 已判红，不再进 conflicts 账（一条错报一次就够）
      }
      const owners = byExt.get(ext) ?? [];
      if (!owners.includes(id)) owners.push(id);
      byExt.set(ext, owners);
    }
  }

  const exts = [...byExt.keys()].sort();
  const conflicts = [...byExt.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([ext, plugins]) => ({ ext, plugins }))
    .sort((a, b) => (a.ext < b.ext ? -1 : 1));

  return { exts, conflicts, denied, invalid };
}

/** 产物 ①：给 syswrite.cpp 的 C++ 头（`kExts[]`；4 个一行） */
export function renderHeader(exts, sourceCount) {
  const rows = [];
  for (let i = 0; i < exts.length; i += 4) {
    rows.push("    " + exts.slice(i, i + 4).map((e) => `L".${e}"`).join(", ") + ",");
  }
  return [
    "// ══════════════════════════════════════════════════════════════════════════",
    "// 🔴 生成物 —— ⛔ 勿手改。生成器 scripts/gen-assoc-exts.mjs（门禁 gen:assoc-exts --check 逐字节比对）。",
    `// 来源 = bundled-plugins.lock.json 里 seed:true 的随包件声明（${exts.length} 条 / ${sourceCount} 只插件）。`,
    "// 用途 = syswrite.cpp 的 kExts[]：写/删 HKCU\\Software\\Classes\\<ext>\\OpenWithProgids 与",
    "//        HKCU\\Software\\LinkDesk\\Capabilities\\FileAssociations —— 即**安装器静态半**。",
    "// 与运行期半的关系：插件装卸产生的动态半住 electron/services/os-associations.ts，",
    "//        且**只碰不在本清单里的扩展名**（静态半由安装器管，软件内不重复写）。",
    "// 改声明请改插件仓的 contributes.fileAssociations，然后 npm run gen:assoc-exts。",
    "// ══════════════════════════════════════════════════════════════════════════",
    "#pragma once",
    "",
    "/** 按扩展名字典序（生成器排序 ⇒ 跨机逐字节一致） */",
    "static const wchar_t* kExts[] = {",
    ...rows,
    "};",
    "",
  ].join("\n");
}

/** 产物 ②：运行期 TS 常量（一行一条，供 readonly 消费） */
export function renderTs(exts, sourceCount) {
  return [
    "/**",
    " * 🔴 生成物 —— ⛔ 勿手改。生成器 scripts/gen-assoc-exts.mjs（门禁 gen:assoc-exts --check 逐字节比对）。",
    ` * 来源 = bundled-plugins.lock.json 里 seed:true 的随包件声明（${exts.length} 条 / ${sourceCount} 只插件）。`,
    " *",
    " * 两个消费者：",
    " *   ① registry-integration.ts 的 ASSOC_EXTENSIONS —— 安装器静态半的同源镜像（软件内开关",
    " *      「文件关联」时写/撤的就是这批类型；⛔ 再手抄一份清单必漂移）。",
    " *   ② os-associations.ts 的静态守卫 —— 运行期动态半**只碰不在本清单里的**扩展名。",
    " */",
    "export const STATIC_ASSOC_EXTENSIONS = [",
    ...exts.map((e) => `  '.${e}',`),
    "] as const;",
    "",
    "/**",
    " * 可执行类扩展名（无点小写）——**两半共用的同一条禁列**（T6 判据 ③「exe 永不登记」）。",
    " *   静态收割侧：collectExtensions 见了就判红（随包件声明里出现即构建失败）。",
    " *   运行期侧：os-associations.ts 的 selectDynamicExtensions 直接跳过——插件声明了也不写候选。",
    " * ⚠️ 数据源 = 生成器里的 EXECUTABLE_DENY（本文件是它的产物），⛔ 别在别处再抄一份。",
    " * ⚠️ 只列**二进制容器 / 快捷方式**：`.bat`/`.cmd`/`.sh`/`.ps1` 是文本脚本，`editor` 正经声明了",
    " *   `.bat`/`.cmd`（当文本编辑）——它们**不在**禁列。",
    " */",
    "export const DENIED_ASSOC_EXTENSIONS = [",
    ...[...EXECUTABLE_DENY].sort().map((e) => `  '${e}',`),
    "] as const;",
    "",
  ].join("\n");
}

/** 读随包件（seed:true）的 plugin.json —— zip 缺失/不可解析即抛（拦在真跑里，不是人肉记） */
export async function readSeedManifests(root) {
  const lock = JSON.parse(readFileSync(join(root, LOCK_REL), "utf8"));
  const seeds = (lock.plugins ?? []).filter((p) => p.seed === true);
  if (seeds.length === 0) throw new Error(`${LOCK_REL} 里没有 seed:true 的随包件——收割清单会真空`);
  const out = [];
  for (const seed of seeds) {
    const zipPath = join(root, BUNDLED_DIR_REL, `${seed.id}.linkdesk-plugin`);
    if (!existsSync(zipPath)) {
      throw new Error(`随包件 zip 缺失：${BUNDLED_DIR_REL}/${seed.id}.linkdesk-plugin（lock 里的 seed 行没落盘）`);
    }
    const zip = await JSZip.loadAsync(readFileSync(zipPath));
    const json = await readZipManifest(zip);
    if (!json) throw new Error(`${seed.id}.linkdesk-plugin 里读不到顶层 plugin.json`);
    out.push({ id: seed.id, json });
  }
  return out;
}

/** 判据汇总 → 出错就打印并返回 false */
function report(result) {
  let ok = true;
  if (result.invalid.length > 0) {
    ok = false;
    console.error("❌ 扩展名形状不合法（归一化后须匹配 [a-z0-9][a-z0-9+_-]*）：");
    for (const v of result.invalid) console.error(`   · ${v.plugin} 声明了 "${v.raw}"`);
  }
  if (result.denied.length > 0) {
    ok = false;
    console.error("❌ 可执行类扩展名禁登记（T6 判据 ③「exe 永不登记」）：");
    for (const v of result.denied) console.error(`   · ${v.plugin} 声明了 ".${v.ext}"`);
    console.error("   处置：回插件仓删掉该声明——⛔ 不在本脚本静默剔除（那会让「清单 = 声明」不成立）。");
  }
  if (result.conflicts.length > 0) {
    ok = false;
    console.error("❌ E27：同一扩展名被多只随包插件声明（安装器静态清单无法表达「两家抢一个类型」）：");
    for (const c of result.conflicts) console.error(`   · ".${c.ext}" ← ${c.plugins.join(" + ")}`);
  }
  if (result.exts.length === 0) {
    ok = false;
    console.error("❌ 收割结果为空——随包件一条 fileAssociations 都没声明，装完「打开方式」会全空。");
  }
  return ok;
}

function selfTest() {
  const cases = [
    {
      name: "正控：归一化 + 同插件去重 + 排序（.TXT / md / MD 归一后只算一条）",
      manifests: [
        { id: "a", json: { contributes: { fileAssociations: [{ extension: ".TXT" }, { extension: "md" }, { extension: "MD" }] } } },
        { id: "b", json: { contributes: { fileAssociations: [{ extension: ".py" }] } } },
      ],
      expect: { exts: ["md", "py", "txt"], conflicts: 0, denied: 0, invalid: 0 },
    },
    {
      name: "负控 1（E27）：两只随包件抢同一扩展名 ⇒ 必须判红",
      manifests: [
        { id: "a", json: { contributes: { fileAssociations: [{ extension: ".md" }] } } },
        { id: "b", json: { contributes: { fileAssociations: [{ extension: "md" }] } } },
      ],
      expect: { exts: ["md"], conflicts: 1, denied: 0, invalid: 0 },
    },
    {
      name: "负控 2（判据 ③）：声明 .exe ⇒ 必须判红",
      manifests: [{ id: "a", json: { contributes: { fileAssociations: [{ extension: ".exe" }, ".txt"] } } }],
      expect: { exts: ["txt"], conflicts: 0, denied: 1, invalid: 0 },
    },
    {
      name: "负控 3：形状不合法（空串 / 纯点 / 带空格）⇒ 必须判红",
      manifests: [
        { id: "a", json: { contributes: { fileAssociations: ["", ".", "a b"] } } },
        { id: "b", json: { contributes: { fileAssociations: [{ extension: ".ok" }] } } },
      ],
      expect: { exts: ["ok"], conflicts: 0, denied: 0, invalid: 3 },
    },
  ];

  let bad = 0;
  for (const c of cases) {
    const got = collectExtensions(c.manifests);
    const mismatches = [];
    if (JSON.stringify(got.exts) !== JSON.stringify(c.expect.exts)) {
      mismatches.push(`exts=${JSON.stringify(got.exts)} 期望 ${JSON.stringify(c.expect.exts)}`);
    }
    if (got.conflicts.length !== c.expect.conflicts) mismatches.push(`conflicts=${got.conflicts.length}`);
    if (got.denied.length !== c.expect.denied) mismatches.push(`denied=${got.denied.length}`);
    if (got.invalid.length !== c.expect.invalid) mismatches.push(`invalid=${got.invalid.length}`);
    if (mismatches.length > 0) {
      bad++;
      console.error(`❌ 自测失败 · ${c.name}：${mismatches.join(" / ")}`);
    } else {
      console.log(`✅ 自测通过 · ${c.name}`);
    }
  }
  // 负控必须「真红」——判据不红 = 门禁是摆设（对标仓库里各 gate 的自测纪律）
  const negControls = cases.slice(1).map((c) => report(collectExtensions(c.manifests)));
  if (negControls.some((ok) => ok)) {
    bad++;
    console.error("❌ 自测失败：负控被判绿（门禁失灵）");
  }
  if (bad === 0) console.log("✅ gen-assoc-exts 自测全绿（1 正控 + 3 负控，负控均真红）");
  return bad === 0;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) process.exit(selfTest() ? 0 : 1);

  const check = args.includes("--check");
  const manifests = await readSeedManifests(ROOT);
  const result = collectExtensions(manifests);
  if (!report(result)) process.exit(1);

  const header = renderHeader(result.exts, manifests.length);
  const ts = renderTs(result.exts, manifests.length);

  console.log(
    `[gen-assoc-exts] 随包件 ${manifests.length} 只 → 静态扩展名 ${result.exts.length} 条：` +
      result.exts.map((e) => `.${e}`).join(" ")
  );

  if (check) {
    let drift = 0;
    for (const [rel, want] of [
      [HEADER_REL, header],
      [TS_REL, ts],
    ]) {
      const abs = join(ROOT, rel);
      const got = existsSync(abs) ? readFileSync(abs, "utf8") : null;
      if (got === want) {
        console.log(`✅ ${rel} 与随包件声明逐字节一致`);
      } else {
        drift++;
        console.error(
          `❌ ${rel} ${got === null ? "不存在" : "与随包件声明不一致"}——跑 \`npm run gen:assoc-exts\` 重收（${want.split("\n").length} 行）`
        );
      }
    }
    if (drift > 0) {
      console.error(`\n❌ ${drift} 份产物漂移（T6 判据 ①：构建期清单必须与声明逐字节一致）。`);
      process.exit(1);
    }
    return;
  }

  for (const [rel, content] of [
    [HEADER_REL, header],
    [TS_REL, ts],
  ]) {
    const abs = join(ROOT, rel);
    // 内容相同就不落盘——避免无谓的 mtime 抖动（`check-packaging-files --with-artifact`
    // 用 mtime 判「exe 是不是旧货」，白写一次会把刚编好的 exe 判成旧货）
    if (existsSync(abs) && readFileSync(abs, "utf8") === content) {
      console.log(`· ${rel} 无变化（未落盘）`);
      continue;
    }
    writeFileSync(abs, content, "utf8");
    console.log(`✅ 已写 ${rel}`);
  }
}

main().catch((e) => {
  console.error(`❌ gen-assoc-exts 失败：${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
