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
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const pluginsDir = join(repoRoot, "plugins");
const bundledDir = join(repoRoot, "bundled-plugins");

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
    if (rel === "plugin.json") {
      zip.file("plugin.json", readFileSync(join(dir, rel)));
    } else {
      zip.file(rel, readFileSync(join(dir, rel)));
    }
  }
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const out = join(bundledDir, `${dirName}.linkdesk-plugin`);
  writeFileSync(out, buf);
  packed.push(`${dirName}.linkdesk-plugin (${(buf.byteLength / 1024).toFixed(1)} KB)`);
}

console.log(`[pack-bundled-plugins] JSON 纯数据包打包完成 → bundled-plugins/ (${packed.length})`);
for (const p of packed) console.log(`  ✔ ${p}`);
if (skipped.length) console.log(`[pack-bundled-plugins] 跳过（React/有编译表面，SDK 产）: ${skipped.join(", ")}`);
