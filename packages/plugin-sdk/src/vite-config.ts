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
 *   - 🔥 E6#15（多表面打包）：一个插件 = 主入口 + 每 contributes.views[].render 一个编译表面。
 *     **每个表面一次独立 vite lib build**（closeBundle 编排 N 次内层 `build()`）→ 每表面单文件自包含。
 *     不赌 vite 单 build 多 JS 入口（实测 entry facade 空 chunk——rollup 把共享图并进首个入口却丢
 *     其余入口 default 导出；E6#15 实证）。各表面共享模块在表面间重复打包（react 等 external 除外，
 *     css 内联进各表面再合并去重）——zip 大一点，换来入口导出零失真 + 逐表面失败隔离。
 *     zip 内布局：
 *         index.bundle.js            主入口（entry default 组件 + 模块级贡献副作用）
 *         views/<View>.bundle.js     每 contributes.views[].render 的独立表面（独立 lib build 产物）
 *         index.bundle.css           全插件聚合 css（有则 loader <link> 注入，与 js 并列）
 *     dist/ 内 plugin.json 的 render 字段改写指向 `views/<View>.bundle.js`（编译产物路径）——
 *     源码 plugin.json 保持作者视角 `src/views/X.tsx`；壳 loader 读 dist manifest 后
 *     dynamic-import `${root}/views/X.bundle.js`（既有 glob 外回退分支，E5.7#98）即命中。
 *   - CSS：每表面 lib build cssCodeSplit 强制 false → 各产单 css → packager 合并为 `index.bundle.css`
 *     （各表面 css 规则全局性，合并 = 源码模式壳 build 全插件 css 合一语义）。壳 loader 激活 bundle
 *     插件时 `<link rel=stylesheet>` 注入、卸载移除（对标 VS Code extension css 由宿主 link 的架构模型；
 *     入口同步 css 不会被 vite style-inject，entry css 期待 html <link>，插件 chunk 无 html 消费方）。
 *   - Worker（monaco 等）：`worker.format:"es"`——lib 模式 worker 默认 iife 撞 code-split 报错
 *     （Invalid value "iife" for worker.format），es 允许 worker 内动态 import。
 *   - 打包 = 内嵌私有插件 `linkdesk-plugin-packager` 的 Vite hook 序列。外层 build 只做哑入口
 *     （虚拟模块）承载 closeBundle——真实工作全在 closeBundle：逐表面 lib build → 汇总 pkgDir →
 *     静态清单 + jszip。归属唯一（packager），bin 只编排不重复 zip。
 *   - 静态清单从**源码 pluginRoot** 拷贝（非 outDir——outDir 每次 emptyOutDir 清空），含 plugin.json/
 *     icon/README.md/CHANGELOG.md（K2 缝隙）/ i18n 声明文件。
 *   - zip 条目相对 pkgDir、正斜杠、无外层目录（loader 解压期待 plugin.json 在顶，E6#7 契约）。
 *   - dev/serve 不触发 build 系 hook → packager 天然只在 build 跑。
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { build as viteBuild, type Plugin, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import JSZip from "jszip";
import {
  collectI18nDecls,
  derivePluginId,
  isWithinRoot,
  readPluginManifest,
  validatePluginJson,
} from "./validate.js";

/** 壳提供、插件不得重复打包的依赖——i18next 必须 external（B3：自打实例 → 翻译全空）。
 *  E6#15d 消费切换实证：`react-dom/client` 必须同列 external——池 import-map 已提供 clean 副本，
 *  否则作者 import react-dom/client 时其 dev wrapper（createRoot 解析读 `process.env.NODE_ENV`，
 *  顶层执行）被内联进 bundle → 池运行态 ReferenceError: process is not defined → 视图全崩。 */
export const DEFAULT_EXTERNAL = ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react-i18next", "i18next"];

export interface LinkdeskPluginOptions {
  /** 入口文件，默认 plugin.json 的 entry，再缺省 "src/index.tsx"。无 entry（纯 contributes 插件）→ 仅 views 表面 */
  entry?: string;
  /** 输出目录，默认 "dist" */
  outDir?: string;
  /** 额外 external 依赖（壳还可能提供别的共享件） */
  external?: string[];
}

/* ── 多表面收集（E6#15） ─────────────────────────────────────────────── */

interface Surface {
  /** 唯一键——entry="index"，视图 = 去重文件名（可含 `_2` 后缀防撞） */
  key: string;
  /** 最终相对 zip 根路径（index.bundle.js / views/<key>.bundle.js） */
  finalName: string;
  /** 绝对入口文件 */
  abs: string;
}

/** 收集可编译表面 = [entry?] + 每唯一 contributes.views[].render */
function collectSurfaces(root: string, manifest: unknown, options: LinkdeskPluginOptions): Surface[] {
  const entry = options.entry ?? (manifest as { entry?: unknown })?.entry;
  const entryAbs = typeof entry === "string" ? resolve(root, entry) : undefined;
  if (entryAbs && !existsSync(entryAbs)) {
    throw new Error(
      `入口不存在：${relative(root, entryAbs)}——在 plugin.json 声明 entry 或传 defineLinkdeskPluginConfig({ entry })`,
    );
  }

  const surfaces: Surface[] = [];
  const usedKeys = new Set<string>();
  if (entryAbs) {
    surfaces.push({ key: "index", finalName: "index.bundle.js", abs: entryAbs });
    usedKeys.add("index");
  }

  const contributes = (manifest as { contributes?: unknown })?.contributes as
    | { views?: Record<string, Array<{ render?: unknown }>> }
    | undefined;
  const views = contributes?.views ?? {};
  const seenRel = new Set<string>();
  for (const viewDefs of Object.values(views)) {
    if (!Array.isArray(viewDefs)) continue;
    for (const vd of viewDefs) {
      const rel = typeof vd?.render === "string" ? vd.render : undefined;
      if (!rel || !rel.endsWith(".tsx") || seenRel.has(rel)) continue;
      const abs = resolve(root, rel);
      if (!existsSync(abs)) continue; // render 指向缺失文件——validate 已报，build 不 abort
      seenRel.add(rel);
      let key = basename(rel, extname(rel)).replace(/[^A-Za-z0-9_.-]/g, "_");
      while (usedKeys.has(key)) key += "_";
      usedKeys.add(key);
      surfaces.push({ key, finalName: `views/${key}.bundle.js`, abs });
    }
  }
  return surfaces;
}

/** dist plugin.json 深变换——把每 render 改写为编译 chunk 相对路径（按 rel → finalName 映射） */
function rewriteDistManifest(manifest: unknown, surfaceByRel: Map<string, string>): unknown {
  const clone: unknown = JSON.parse(JSON.stringify(manifest));
  const contributes = (clone as { contributes?: unknown })?.contributes as
    | { views?: Record<string, Array<{ render?: unknown }>> }
    | undefined;
  const views = contributes?.views;
  if (!views) return clone;
  for (const viewDefs of Object.values(views)) {
    if (!Array.isArray(viewDefs)) continue;
    for (const vd of viewDefs) {
      const rel = typeof vd?.render === "string" ? vd.render : undefined;
      if (rel && surfaceByRel.has(rel)) vd.render = surfaceByRel.get(rel);
    }
  }
  return clone;
}

/** 从 srcDir 深拷贝到 destDir——packager 把内层 build 的 assets/ 等子夹汇总进 pkgDir。
 * 同名冲突 = 同内容同哈希的重复文件（多表面共享同一资产），跳过即对（逐字节一致）。 */
function copyTree(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const e of readdirSync(srcDir, { withFileTypes: true })) {
    const s = join(srcDir, e.name);
    const d = join(destDir, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (!existsSync(d)) copyFileSync(s, d);
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

/** E6#15e：langDef.lsp 引用的 node_modules 包随 zip——只带真正 spawn 的二进制（见 closeBundle 调用注）。
 * lsp.args 相对路径**以插件根目录为基准解析**（E6#15l 锚词「插件根目录为基准」，与 schema 描述同源，
 * 门禁 scripts/check-lsp-args-base.mjs 钉本文件）——从 args 解析 `node_modules/<pkg>/…` 的顶层包名 →
 * 整树拷入 pkgDir/node_modules/<pkg>。
 * `.bin/` shim 归属需解析依赖 bin 字段——当前不解析（warn 提示作者改指真实包路径），无插件命中。 */
function includeLspRuntimePackages(
  root: string,
  pkgDir: string,
  manifest: unknown,
  warn: (msg: string) => void,
): void {
  const langDefs = (manifest as { contributes?: { langDefs?: Array<{ lsp?: { args?: unknown } }> } } | undefined)
    ?.contributes?.langDefs;
  if (!Array.isArray(langDefs)) return;
  const wanted = new Set<string>();
  for (const ld of langDefs) {
    const args = ld?.lsp?.args;
    if (!Array.isArray(args)) continue;
    for (const arg of args) {
      if (typeof arg !== "string") continue;
      const norm = arg.replace(/\\/g, "/");
      if (!norm.includes("node_modules/")) continue;
      const seg = norm.split("node_modules/")[1];
      if (!seg) continue;
      const top = seg.split("/")[0];
      if (!top) continue;
      if (top === ".bin") {
        warn(
          `[linkdesk-plugin-packager] lsp.args "${arg}" 经 node_modules/.bin shim——归属包需解析依赖 bin 字段，` +
            "暂不随包；请作者改指真实包路径（node_modules/<pkg>/bin/…）",
        );
        continue;
      }
      if (top.startsWith(".")) continue; // 隐藏目录非包
      wanted.add(top);
    }
  }
  for (const name of wanted) {
    const src = join(root, "node_modules", name);
    if (!existsSync(src)) {
      warn(
        `[linkdesk-plugin-packager] lsp.args 引用依赖 "${name}" 不在插件根 node_modules——未随包（插件根须先 npm install）`,
      );
      continue;
    }
    const dest = join(pkgDir, "node_modules", name);
    mkdirSync(dest, { recursive: true });
    copyTree(src, dest);
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

  const surfaces = collectSurfaces(root, manifest, options);
  if (surfaces.length === 0) {
    throw new Error(
      `无可编译表面——plugin.json 需声明 entry 或 contributes.views[].render（当前两者皆缺）`,
    );
  }
  const relToFinal = new Map<string, string>();
  for (const s of surfaces) {
    if (s.key !== "index") {
      const rel = relative(root, s.abs).replace(/\\/g, "/");
      relToFinal.set(rel, s.finalName);
      relToFinal.set(s.abs, s.finalName);
    }
  }

  const id = derivePluginId(manifest, basename(root));
  const outDir = resolve(root, options.outDir ?? "dist");
  const pkgName = `${id}.linkdesk-plugin`;
  const pkgDir = join(outDir, pkgName);
  const external = [...DEFAULT_EXTERNAL, ...(options.external ?? [])];

  /** 单表面 lib build——独立 outDir 子夹（.s/<key>），产物 surface.bundle.js（+ css/assets/worker） */
  async function buildSurface(surface: Surface): Promise<void> {
    const surfaceOut = join(outDir, ".s", surface.key);
    await viteBuild({
      root,
      configFile: false, // 内层不重载作者 vite.config——避免递归
      // E6#15o（2026-09-06）：base "./"——插件独立构建产物自锚定 import.meta.url。
      //   Vite 默认 base "/" 把 worker/资产引用烤成宿主绝对路径（/assets/x），运行时按宿主 document
      //   基址解析（打包态池页 = file:// app.asar）→ Monaco web worker 全灭（.ts 跳转挂，实机实证）。
      //   base "./" 才走 customRelativeUrlMechanisms.es = new URL(rel, import.meta.url)——锚到插件自身
      //   服务根（prod linkdesk://<id>/、dev dev-server origin），worker/图片/字体引用全对。
      base: "./",
      plugins: [react()],
      define: {
        // E6#15d：生产 define——任何仍被内联的 CJS/dev 模块（react-dom 等）的 process.env.NODE_ENV
        //   guard 都静态替换为 "production"，池运行态零 process 依赖（防御层；external 已挡主路）。
        "process.env.NODE_ENV": JSON.stringify("production"),
      },
      worker: { format: "es" }, // monaco 等真 worker：es 允许动态 import（lib 默认 iife 撞 code-split）
      build: {
        lib: {
          entry: surface.abs,
          formats: ["es"],
          // 全名含 .js——fileName 不带后缀时 Rollup 不自动补
          fileName: () => "surface.bundle.js",
        },
        outDir: surfaceOut,
        emptyOutDir: true,
        cssCodeSplit: false, // 单 css/表面 → 汇总 index.bundle.css
        rollupOptions: { external },
        sourcemap: false,
        minify: "esbuild",
      },
    });
  }

  /** 汇总：逐表面 surface.bundle.js → 终名；css 合并；assets/ 同深拷贝 */
  async function assemblePkgDir(): Promise<void> {
    rmSync(pkgDir, { recursive: true, force: true });
    mkdirSync(pkgDir, { recursive: true });

    let cssBuffer = Buffer.alloc(0);

    for (const s of surfaces) {
      const surfaceOut = join(outDir, ".s", s.key);
      const mainJs = join(surfaceOut, "surface.bundle.js");
      if (!existsSync(mainJs)) continue; // 该表面 build 失败/无产物——跳过（失败隔离）
      const dest = join(pkgDir, s.finalName);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(mainJs, dest);

      // css + 其余（assets/ worker 等）：排除 surface.bundle.js 后整夹同深拷入，css 汇聚暂存
      for (const e of readdirSync(surfaceOut, { withFileTypes: true })) {
        if (e.name === "surface.bundle.js") continue;
        const sPath = join(surfaceOut, e.name);
        if (e.isFile() && e.name.endsWith(".css")) {
          cssBuffer = Buffer.concat([cssBuffer, readFileSync(sPath)]);
          continue;
        }
        if (e.isDirectory()) copyTree(sPath, join(pkgDir, e.name));
        else copyFileSync(sPath, join(pkgDir, e.name));
      }
    }
    if (cssBuffer.length > 0) {
      writeFileSync(join(pkgDir, "index.bundle.css"), cssBuffer);
    }
  }

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
      if (err) {
        failed = true;
        this.warn(`[linkdesk-plugin-packager] 校验/哑 build 失败（${err.message}），跳过打包`);
      }
    },
    async closeBundle() {
      if (failed) return;
      try {
        rmSync(join(outDir, ".s"), { recursive: true, force: true });
        // 逐表面独立 lib build（fail 隔离：某一表面炸不阻断其他表面）
        const results: Array<{ key: string; ok: boolean }> = [];
        for (const s of surfaces) {
          try {
            await buildSurface(s);
            results.push({ key: s.key, ok: true });
          } catch (e) {
            results.push({ key: s.key, ok: false });
            this.warn(
              `[linkdesk-plugin-packager] 表面 "${s.key}" build 失败：${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        const ok = results.filter((r) => r.ok);
        if (ok.length === 0) {
          this.warn("[linkdesk-plugin-packager] 全部表面 build 失败，跳过打包");
          return;
        }

        await assemblePkgDir();

        // E6#15e：插件自带的 LSP 二进制随包——扫本插件 plugin.json 的 langDefs[].lsp.args，
        // 凡路径式 arg 指向 `node_modules/<pkg>/…` 的，把 <pkg> 整树从插件根 node_modules 拷进 zip。
        // pyright 等是 spawn 二进制（不经 bundle import——knip/rollup 图外），只能显式随包。
        // 按 lsp.args 引用驱动而非全量 dependencies：react/@linkdesk/ui 等构建期被 external/内联，
        // 不需要也不该进包（全量拷 = 纯增重）；无 langDef.lsp 的插件（既有 19 zip）零影响。
        includeLspRuntimePackages(root, pkgDir, manifest, (m) => this.warn(m));

        // 静态清单从源码 pluginRoot 拷入（缺省忽略）
        // plugin.json 例外——jsonc 归一为严格 JSON + E6#15 render 改写（dist 视角：render 指编译表面路径）
        const distManifest = rewriteDistManifest(manifest, relToFinal);
        writeFileSync(join(pkgDir, "plugin.json"), `${JSON.stringify(distManifest, null, 2)}\n`, "utf8");
        for (const decl of collectI18nDecls(manifest)) copyFileInto(root, pkgDir, decl.rel);
        copyFileInto(root, pkgDir, "icon.svg");
        copyFileInto(root, pkgDir, "README.md");
        copyFileInto(root, pkgDir, "CHANGELOG.md");
        const iconRel = (manifest as { icon?: unknown })?.icon;
        if (typeof iconRel === "string" && !iconRel.includes("\\")) copyFileInto(root, pkgDir, iconRel);

        // jszip 打包 → 项目根单文件
        const zip = new JSZip();
        zipTree(zip, pkgDir, "");
        const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
        const zipPath = join(root, pkgName);
        writeFileSync(zipPath, buf);
        const kb = (buf.byteLength / 1024).toFixed(1);
        const failedKeys = results.filter((r) => !r.ok).map((r) => r.key);
        const warnSuffix = failedKeys.length > 0 ? `（⚠ 失败表面: ${failedKeys.join(", ")}）` : "";
        console.log(
          `[linkdesk-plugin-sdk] ✔ ${pkgName}（${kb} KB, ${ok.length}/${surfaces.length} 表面）→ ${relative(process.cwd(), zipPath)}${warnSuffix}`,
        );
        rmSync(join(outDir, ".s"), { recursive: true, force: true });
      } catch (e) {
        this.warn(`[linkdesk-plugin-packager] 打包失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };

  /** 哑虚拟入口——外层 build 只为承载 closeBundle（真实构建在 closeBundle 内逐表面执行） */
  const dummyEntry = "__linkdesk_dummy__";
  const virtualDummy: Plugin = {
    name: "linkdesk-plugin-dummy-entry",
    resolveId(source) {
      if (source === dummyEntry) return "\0" + dummyEntry;
    },
    load(id) {
      if (id === "\0" + dummyEntry) return "export {};";
    },
  };

  return {
    root,
    plugins: [react(), virtualDummy, packager],
    build: {
      rollupOptions: {
        input: dummyEntry,
        output: { format: "es" },
      },
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      minify: "esbuild",
    },
  };
}
