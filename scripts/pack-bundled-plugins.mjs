#!/usr/bin/env node
/**
 * E6#15d G3b（JSON 半边补发）——把 `plugins/` 下 **entryless 纯数据插件**（主题 / 语言 / 图标集）打成
 * `.linkdesk-plugin` 直落 `bundled-plugins/`（boot bundled-install 自动装到 userData）。
 *
 * 🔴 **本脚本现在只是「编排壳」**（E6#98c，L7 第 7.1 轮改造）：真正「一个插件目录 → 一个 zip」的打包
 * 实现已收进 `@linkdesk/plugin-sdk` 的 `pack`（`packages/plugin-sdk/src/pack.ts`）——因为源码搬进各自
 * 独立的仓之后，插件仓里要有自己的产 zip 手段，而**两条路径的打包行为必须逐字节一致**（否则同一插件
 * 「壳内打的 zip」与「插件仓打的 zip」内容指纹不同，`check-bundled-version-bump.mjs` 会互相打架）。
 * 收进 SDK 后「打包实现」在全仓只此一份，本脚本负责的是**壳仓侧的编排**：扫 `plugins/`、挑出
 * entryless 的、定产物名、落 `bundled-plugins/`。
 *
 * 为什么这类插件不能走 `plugin-sdk build`：
 *   - SDK `collectSurfaces` 要求 entry 或 `contributes.views[].render`，theme×10/lang×2/iconset×1
 *     两者皆缺 → 直接 throw「无可编译表面」——这正是本轮补 `pack` 的原因。
 *   - SDK `build` 的静态拷贝清单只含 plugin.json/i18n/icon/README/CHANGELOG，**不含
 *     `contributes.themes[].path` 指向的数据文件**（themes/*.json / en.json / icons/**）——那些正是
 *     数据包本体，运行时经 `linkdesk://<id>/…` 按相对路径 fetch。故 `pack` 的语义 = 打包**目录整树**
 *     （plugin.json 在顶，平铺包契约）。
 *
 * 只打 entryless 目录（无 `plugin.json.entry` 且无 `src/` = 纯数据/无编译表面）——React 插件有 entry/src，
 * 由各自 SDK build 产 zip，此处不碰（防双源漂移）。
 *
 * 幂等：整树重打覆盖——`bundled-plugins/` 是随壳只读发货夹，版本幂等由 bundled-install 处理。
 * ⚠️ 「重打覆盖」意味着**改了插件源码内容却不 bump `plugin.json.version`** ⇒
 * `scripts/check-bundled-version-bump.mjs` 当场红（内容变更必 bump，已装用户按版本固化）。
 *
 * SDK 未构建时本脚本**自动构建一次**（postinstall 不产 `packages/plugin-sdk/dist`；六只 React 插件的
 * `npm run build` 同样吃这份 dist——这条前置由本脚本自愈，不靠人记得）。
 *
 * 行尾归一与固定时间戳两条行为（产物可复现、与工作区行尾解耦）现在都在 SDK 的 `pack` 里，见
 * `packages/plugin-sdk/src/pack.ts` 文件头 🔴 段——本脚本不再自己实现一遍。
 */
import { existsSync, readdirSync, statSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const pluginsDir = join(repoRoot, "plugins");
const bundledDir = join(repoRoot, "bundled-plugins");
const sdkDir = join(repoRoot, "packages", "plugin-sdk");
const sdkPackEntry = join(sdkDir, "dist", "pack.js");

/** SDK 未构建 ⇒ 就地构建一次（tsc 走仓根 typescript，不经 shell——Windows 上 npm 是 .cmd 要 shell:true） */
function buildSdkIfNeeded() {
  if (existsSync(sdkPackEntry)) return;
  const tscBin = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tscBin)) {
    console.error(`❌ @linkdesk/plugin-sdk 未构建且找不到仓根 typescript（${tscBin}）——先 npm install`);
    process.exit(1);
  }
  console.log("[pack-bundled-plugins] @linkdesk/plugin-sdk 尚未构建 → 先构建一次（tsc -p tsconfig.build.json）");
  const r = spawnSync(process.execPath, [tscBin, "-p", join(sdkDir, "tsconfig.build.json")], {
    stdio: "inherit",
    cwd: sdkDir,
  });
  if (r.status !== 0 || !existsSync(sdkPackEntry)) {
    console.error("❌ @linkdesk/plugin-sdk 构建失败——纯数据包打包中止");
    process.exit(r.status ?? 1);
  }
}

buildSdkIfNeeded();

const { packPluginData } = await import(new URL(`file://${sdkPackEntry.replace(/\\/g, "/")}`).href);

const packed = [];
const skipped = [];
let normalizedTotal = 0;
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

  // 产物名跟**身份**走（E6#98g 起 pluginId 显式声明）。这里读一次只为定文件名，真正的 id 裁决在
  // packPluginData 内部（同一个 derivePluginId）——两处不一致就报错，不静默用错名字。
  const outBase = typeof manifest.pluginId === "string" && manifest.pluginId !== "" ? manifest.pluginId : dirName;
  const out = join(bundledDir, `${outBase}.linkdesk-plugin`);
  const tmp = `${out}.part`;

  let result;
  try {
    result = await packPluginData({ root: dir, outFile: tmp });
  } catch (e) {
    rmSync(tmp, { force: true });
    console.error(`❌ ${dirName}: 打包失败——${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  if (result.id !== outBase) {
    rmSync(tmp, { force: true });
    console.error(`❌ ${dirName}: 产物名与身份不一致（pluginId="${result.id}" ≠ 拟用名 "${outBase}"）——拒绝落位`);
    process.exit(1);
  }
  copyFileSync(tmp, out); // 先打临时名再落位，避免半截产物
  rmSync(tmp, { force: true });
  normalizedTotal += result.normalizedCount;
  packed.push({ name: `${outBase}.linkdesk-plugin`, kb: (result.bytes / 1024).toFixed(1), entries: result.entryCount });
}

console.log(`[pack-bundled-plugins] 纯数据包打包完成 → bundled-plugins/ (${packed.length})`);
for (const p of packed) console.log(`  ✔ ${p.name}（${p.kb} KB, ${p.entries} 条目）`);
console.log(`[pack-bundled-plugins] 行尾归一到 LF 的条目：${normalizedTotal}（二进制条目原样，未计入）`);
if (skipped.length) console.log(`[pack-bundled-plugins] 跳过（React/有编译表面，SDK build 产）: ${skipped.join(", ")}`);

// 🔴 E6#99（L7 第 7.2 轮）：12 只纯数据插件的**源码已外移各自独立仓** ⇒ 本脚本在壳仓里扫不到输入。
//   门禁/工具扫了个空却照常报「完成」是最贵的坏法，故此处显式说清，并给出真正的入口在哪。
//   本脚本的去向：7.4 轮落成 `sync:bundled` 时**退休**（那才是「出厂种子保鲜」的正主：按 lock 从
//   各插件仓 Release 拉已发布版）。在它落地之前保留本脚本，是为了不留「文档指向一条不存在的命令」。
if (packed.length === 0) {
  console.log(
    "[pack-bundled-plugins] ⚠ 覆盖域变更（E6#99）：仓内 plugins/ 下 0 个可打包的纯数据插件目录——本脚本当前**无对象**。" +
      "\n   原因：12 只纯数据插件（10 主题 + 2 语言）的源码已外移各自独立仓（本仓只剩两只含 src 的开发夹具，属性是「跳过」）。" +
      "\n   它们的 zip 现在由**各插件仓自己**产：`npm run build`（= `linkdesk-plugin-sdk pack`，E6#98c 落地的通道）。" +
      "\n   出厂种子保鲜 = 7.4 轮的 `sync:bundled`（本脚本届时退休）。"
  );
}
