/**
 * 插件 Vite 构建配置（E6#4）——`defineLinkdeskPluginConfig()` 一键产出 `.linkdesk-plugin` zip。
 *
 * 作者用法：工程根放 plugin.json + src/index.tsx，vite.config.ts 写
 * `export default defineLinkdeskPluginConfig()`，`npm run build`（= linkdesk-plugin-sdk build）即得
 * `<id>.linkdesk-plugin`。产物两份（对齐脚手架/流水线文档 01/03）：
 *   - 项目根 `./<id>.linkdesk-plugin`（zip 单文件，分发态）
 *   - `dist/<id>.linkdesk-plugin/`（解包目录，#4a 目录产物，调试/壳加载调试面）
 *
 * 构建裁决：
 *   - React/react-dom/react-i18next/**i18next** external（壳提供——插件自打 i18next 实例 → 翻译全空，
 *     B3 教训）；其他依赖 inline 完全自包含。
 *   - 打包 = 内嵌私有插件 `linkdesk-plugin-packager` 的 Vite hook 序列（closeBundle 时机 zip，归属唯一，
 *     bin 只编排不重复 zip）：
 *       configResolved → buildStart 跑 validatePluginJson（build 前校验，失败即 abort，#5b）
 *       → buildEnd 记 failed → closeBundle（failed 或 bundle 缺失则跳过）拷静态清单 + jszip。
 *   - 静态清单从**源码 pluginRoot** 拷贝（非 outDir——outDir 每次 emptyOutDir 清空），含 plugin.json/
 *     icon/README.md/CHANGELOG.md（K2 缝隙）/ i18n 声明文件；build 产物 index.bundle.js + assets/ 从
 *     outDir 深拷贝进 pkgDir。
 *   - zip 条目相对 pkgDir、正斜杠、无外层目录（loader 解压期待 plugin.json 在顶，E6#7 契约）。
 *   - dev/serve 不触发 build 系 hook → packager 天然只在 build 跑。
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Plugin, UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import JSZip from "jszip";
import {
  collectI18nDecls,
  derivePluginId,
  isWithinRoot,
  readPluginManifest,
  validatePluginJson,
} from "./validate.js";

/** 壳提供、插件不得重复打包的依赖——i18next 必须 external（B3：自打实例 → 翻译全空） */
const DEFAULT_EXTERNAL = ["react", "react-dom", "react/jsx-runtime", "react-i18next", "i18next"];

export interface LinkdeskPluginOptions {
  /** 入口文件，默认 plugin.json 的 entry，再缺省 "src/index.tsx" */
  entry?: string;
  /** 输出目录，默认 "dist" */
  outDir?: string;
  /** 额外 external 依赖（壳还可能提供别的共享件） */
  external?: string[];
}

/**
 * 从 srcDir 深拷贝到 destDir，跳过顶层 skip 名——packager 把 Vite build 产物移入 pkgDir 用。
 * pkgDir 建在 outDir 内，靠 skip 自身名避免递归进 zip 目录。
 */
function copyTree(srcDir: string, destDir: string, skipNames: Set<string>): void {
  mkdirSync(destDir, { recursive: true });
  for (const e of readdirSync(srcDir, { withFileTypes: true })) {
    if (skipNames.has(e.name)) continue;
    const s = join(srcDir, e.name);
    const d = join(destDir, e.name);
    if (e.isDirectory()) copyTree(s, d, new Set());
    else copyFileSync(s, d);
  }
}

/** 单个文件安全拷贝：断言 src 在 root 内，落 pkgDir 同相对路径，缺省忽略 */
function copyFileInto(root: string, pkgDir: string, rel: string): boolean {
  const src = resolve(root, rel);
  if (!isWithinRoot(root, src) || !existsSync(src)) return false;
  const dest = join(pkgDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

/** pkgDir → zip 目录遍历——条目相对 pkgDir、正斜杠归一 */
function zipTree(zip: JSZip, dir: string, prefix: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const full = join(dir, e.name);
    if (e.isDirectory()) zipTree(zip, full, rel);
    else zip.file(rel, readFileSync(full));
  }
}

export function defineLinkdeskPluginConfig(options: LinkdeskPluginOptions = {}): UserConfig {
  const root = process.cwd();
  const manifestPath = join(root, "plugin.json");

  let manifest: unknown;
  try {
    manifest = readPluginManifest(manifestPath);
  } catch (err) {
    throw new Error(
      `defineLinkdeskPluginConfig 须在插件工程根运行——${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const declaredEntry = typeof (manifest as { entry?: unknown })?.entry === "string"
    ? (manifest as { entry: string }).entry
    : "src/index.tsx";
  const entry = resolve(root, options.entry ?? declaredEntry);
  if (!existsSync(entry)) {
    throw new Error(
      `入口不存在：${relative(root, entry)}——在 plugin.json 声明 entry 或传 defineLinkdeskPluginConfig({ entry })`,
    );
  }

  const id = derivePluginId(manifest, basename(root));
  const outDir = resolve(root, options.outDir ?? "dist");
  const pkgName = `${id}.linkdesk-plugin`;
  const pkgDir = join(outDir, pkgName);

  /** 打包器——zip/校验的唯一归属点 */
  let failed = false;
  const packager: Plugin = {
    name: "linkdesk-plugin-packager",
    buildStart() {
      const res = validatePluginJson(manifestPath);
      if (!res.valid) {
        throw new Error(`plugin.json 验证失败（linkdesk-plugin-sdk validate）:\n  ${res.errors.join("\n  ")}`);
      }
    },
    buildEnd(err) {
      // Rollup 在 build 失败（含 buildStart 抛错）时也调 buildEnd(err) + closeBundle——
      // failed 是权威闸门，防残留 outDir 产物被陈旧 zip（emptyOutDir 只在正常 generate 清 outDir）
      if (err) {
        failed = true;
        this.warn(`[linkdesk-plugin-packager] build 失败（${err.message}），跳过打包`);
      }
    },
    async closeBundle() {
      if (failed) return;
      if (!existsSync(join(outDir, "index.bundle.js"))) return;
      let latest: unknown;
      try {
        latest = readPluginManifest(manifestPath);
      } catch {
        return;
      }

      // 1) 重建 pkgDir（#4a 目录产物保留；下次 build 由 emptyOutDir 清旧）
      rmSync(pkgDir, { recursive: true, force: true });
      mkdirSync(pkgDir, { recursive: true });

      // 2) Vite build 产物（index.bundle.js + assets/**）→ pkgDir（skip 自身防递归）
      copyTree(outDir, pkgDir, new Set([pkgName]));

      // 3) 静态清单从源码 pluginRoot 拷入（缺省忽略）
      //    plugin.json 例外——jsonc 归一为严格 JSON 再落 pkgDir：作者源文件可注释/尾逗号（发布向 jsonc 解析），
      //    但分发态清单须干净（壳加载走严格 JSON，H12；source 里注释是作者便利，不该进产物）
      writeFileSync(join(pkgDir, "plugin.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");
      for (const decl of collectI18nDecls(latest)) copyFileInto(root, pkgDir, decl.rel);
      copyFileInto(root, pkgDir, "icon.svg");
      copyFileInto(root, pkgDir, "README.md");
      copyFileInto(root, pkgDir, "CHANGELOG.md");
      const iconRel = (latest as { icon?: unknown })?.icon;
      if (typeof iconRel === "string" && !iconRel.includes("\\")) copyFileInto(root, pkgDir, iconRel);

      // 4) jszip 打包 → 项目根单文件
      const zip = new JSZip();
      zipTree(zip, pkgDir, "");
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const zipPath = join(root, pkgName);
      writeFileSync(zipPath, buf);
      const kb = (buf.byteLength / 1024).toFixed(1);
      console.log(`[linkdesk-plugin-sdk] ✔ ${pkgName}（${kb} KB）→ ${relative(process.cwd(), zipPath)}`);
    },
  };

  return {
    root,
    plugins: [react(), packager],
    build: {
      lib: {
        entry,
        formats: ["es"],
        // 全名含 .js——fileName 不带后缀时 Rollup 不自动补，closeBundle 的 index.bundle.js 断言会扑空
        fileName: () => "index.bundle.js",
      },
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        external: [...DEFAULT_EXTERNAL, ...(options.external ?? [])],
      },
      sourcemap: false,
      minify: "esbuild",
    },
  };
}
