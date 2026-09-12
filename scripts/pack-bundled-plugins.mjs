#!/usr/bin/env node
/**
 * E6#15d G3b（JSON 半边补发）——打包 `plugins/` 下 entryless 纯 JSON 插件为
 * `.linkdesk-plugin` 直落 `bundled-plugins/`（boot bundled-install 自动装到 userData）。
 *
 * 为什么需要独立打包器（不走 plugin-sdk build）：
 *   - SDK `collectSurfaces`（vite-config.ts:178-183）要求 entry 或 contributes.views[].render，
 *     theme×10/lang×2 两者皆缺 → 直接 throw「无可编译表面」——SDK 无纯数据包路径。
 *   - SDK 静态拷贝清单只含 plugin.json/i18n/icon/README/CHANGELOG（vite-config.ts:297-306），
 *     **不含 contributes.themes[].path 的 JSON 数据文件**（themes/*.json / en.json / icons/**）——
 *     这些正是数据包本体，运行时经 linkdesk://<id>/… 按相对路径 fetch。
 *   本脚本语义 = 打包「目录整树」：plugin.json + 全部随包资源（SDK 平铺包契约——plugin.json 在顶）。
 *
 * 只打 entryless 目录（无 plugin.json.entry 且无 src/ = 纯数据/无编译表面）——
 *   React 8 有 entry/src，由各自 SDK build 产 zip，此处不碰（防双源漂移）。
 * zip 名 = 目录名（manifest 无 pluginId 时 bundle-zip deriveBundlePluginId 回退 zip 基名）。
 * 幂等：整树重打覆盖——bundled-plugins 是随壳只读发货夹，版本幂等由 bundled-install 处理。
 *
 * 🔴 **产物的行尾与工作区解耦**（2026-09-12 修，同族第 5 次）：本脚本此前 `readFileSync` 原样
 * 入包，于是 **zip 的内容取决于打包时工作区的行尾**——`.gitattributes` 管不住**已检出**的存量
 * 文件（本机实测 `git ls-files --eol` = `i/lf w/crlf`）⇒ 同一份源码重打一次就换了内容指纹 ⇒
 * `check-bundled-version-bump.mjs` 判「改内容没 bump」满屏**假红**，而它给的唯一出路是
 * 「bump 插件版本」（假红让真红失效，人就会条件反射去 bump 或绕过）。
 *
 * 修法 = 文本条目一律归一 LF 再入包（二进制原样），判据与病根全在 `scripts/lib/text-eol.mjs`
 * ——**同一个规则门禁那边也要用**（基线 zip 自身就是混合行尾打出来的），所以只写那**一处**。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { normalizeEol } from "./lib/text-eol.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const pluginsDir = join(repoRoot, "plugins");
const bundledDir = join(repoRoot, "bundled-plugins");

/**
 * 🔴 **条目时间戳固定**（2026-09-12，与上一个坑同族）——JSZip 默认给每个条目盖 `new Date()`，
 * 于是**内容一个字没改，重打一次 zip 的字节也全变**（实测：同一源码连打两次 sha256 不同）⇒
 * 产物不可复现：工作区恒脏（`git status` 永远显示这 12 个 zip 被改）、无法用「重打一遍」验证
 * 干净的产物、也没法判断某次 diff 是真改了内容还是只换了时间。
 * 门禁本来就明确不比 zip 字节（只比内容指纹，见 `check-bundled-version-bump.mjs`）——那是**绕开**，
 * 这里把元数据也钉死，让「同样的输入 ⇒ 同样的字节」成立。值本身无意义，只要跨机器恒定。
 */
const ZIP_ENTRY_DATE = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));

/** 目录递归收集相对路径文件——zip 条目相对插件根、正斜杠（bundle-zip 解压期待平铺，无 wrapper） */
function collectFiles(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

const packed = [];
const skipped = [];
/** 被归一行尾（CRLF → LF）的条目数——不为零 = 这台机器的检出是 CRLF，产物已与工作区行尾解耦 */
let normalizedCount = 0;
for (const dirName of readdirSync(pluginsDir)) {
  const dir = join(pluginsDir, dirName);
  const manifestPath = join(dir, "plugin.json");
  if (!statSync(dir).isDirectory() || !existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const hasEntry = typeof manifest.entry === "string" && manifest.entry !== "";
  const hasSrc = existsSync(join(dir, "src")) && statSync(join(dir, "src")).isDirectory();
  if (hasEntry || hasSrc) {
    skipped.push(dirName);
    continue; // React 插件——SDK build 产 zip，双源只准一处
  }

  const zip = new JSZip();
  for (const rel of collectFiles(dir)) {
    const { buf, normalized } = normalizeEol(readFileSync(join(dir, rel)));
    if (normalized) normalizedCount += 1;
    zip.file(rel, buf, { date: ZIP_ENTRY_DATE });
  }
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const out = join(bundledDir, `${dirName}.linkdesk-plugin`);
  writeFileSync(out, buf);
  packed.push(`${dirName}.linkdesk-plugin (${(buf.byteLength / 1024).toFixed(1)} KB)`);
}

console.log(`[pack-bundled-plugins] JSON 纯数据包打包完成 → bundled-plugins/ (${packed.length})`);
console.log(`[pack-bundled-plugins] 行尾归一到 LF 的条目：${normalizedCount}（二进制条目原样，未计入）`);
for (const p of packed) console.log(`  ✔ ${p}`);
if (skipped.length) console.log(`[pack-bundled-plugins] 跳过（React/有编译表面，SDK 产）: ${skipped.join(", ")}`);
