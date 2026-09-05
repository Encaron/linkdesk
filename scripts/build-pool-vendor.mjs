#!/usr/bin/env node
/**
 * E6#15d 消费切换相 G2（form②）：打包版 import-map 宿主运行时 vendor 生成器。
 *
 * 干三件事（跑在 `vite build`（壳+插件）与 `vite build --config vite.pool.config.ts`（池）之后）：
 *   1. esbuild 多入口 split 构建 react 系 → dist/pool-vendor/（react/react-dom/react-dom/client/
 *      react/jsx-runtime/react/jsx-dev-runtime/i18next/react-i18next 各一入口 chunk）。
 *      共享依赖（react 本体、react-dom 本体、i18next 本体）被 esbuild 提升为独立 chunk，
 *      各入口 stub 用 **静态 import** 引它 → 同一窗口内 react 单实例由「同 chunk URL = 同模块」结构保证。
 *   2. 给 CJS 派生入口 stub（react 系 —— esbuild 对 CJS opaque 只出 default）生成真-ESM facade：
 *      `import __m from "./<stub>.js"; export const useState = __m.useState; ...`，
 *      键清单 = node `require(spec)` 实际导出（18.3.1 react 36 键 / react-dom 12 / jsx-runtime 3 …）。
 *      浏览器对 import-map 的具名 import 是严格静态链接 —— 命名必须是字面量，这是唯一可靠来源。
 *      i18next / react-i18next 本就发真 ESM（具名全真）→ 直连入口 chunk，零 facade。
 *   3. 把 import-map 注入 **打包产物** dist/pool.html（<script type="importmap"> 须先于首个 module script）。
 *      map 只进池窗（壳想池画铁律：插件代码唯一执行者 = 池）。源码 pool.html 不写 map —— dev 由 vite
 *      解析插件与壳同享同一 react，不需 map；注入只在打包轨道，dev 零回归。
 *
 * 覆盖集 = plugin-sdk DEFAULT_EXTERNAL 全集（宿主运行时契约，漏一个 → 第三方包明天就崩）。
 * 产物全部落 dist/pool-vendor/（electron-builder files 含 dist/** → 随包进 asar，file:// 相对可加载）。
 */
import { build } from "esbuild";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import {
  existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync, readdirSync,
} from "fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const distDir = resolve(repoRoot, "dist");
const stageDir = resolve(distDir, ".pool-vendor-stage");
const vendorDir = resolve(distDir, "pool-vendor");

process.env.NODE_ENV = "production";
const require_ = createRequire(import.meta.url);

/** DEFAULT_EXTERNAL 全集 —— 与 packages/plugin-sdk/src/vite-config.ts 的 DEFAULT_EXTERNAL 同步维护（宿主运行时契约） */
const MAP_KEYS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "i18next",
  "react-i18next",
];

// 纯 CJS 派生（esbuild 只出 default）→ 需 facade。原生 ESM（具名全真）→ 直连。
const NEED_FACADE = new Set(["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"]);

async function buildVendor() {
  if (!existsSync(distDir)) {
    console.log("[pool-vendor] dist/ 不存在，跳过（build 未跑）。");
    return null;
  }
  rmSync(stageDir, { recursive: true, force: true });
  rmSync(vendorDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  // 1) esbuild 多入口 split —— 共享依赖自动提升 chunk，入口 stub 静态 import
  await build({
    entryPoints: MAP_KEYS,
    absWorkingDir: repoRoot,
    bundle: true,
    format: "esm",
    platform: "browser",
    splitting: true,
    outdir: stageDir,
    minify: false,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
    // 各入口均作为独立模块暴露；无 external —— 互相依赖走共享 chunk（同 URL 单实例）
  });

  // 平铺复制到 dist/pool-vendor/ 并修正 stub 间相对引用？——不。esbuild 目录结构（react/jsx-runtime.js、
  // react-dom/client.js + chunk-*）内部相对 import 自洽，直接整树搬。
  copyTree(stageDir, vendorDir);

  const map = {};
  for (const spec of MAP_KEYS) {
    const entryRel = entryFileRel(spec); // vendor 根相对路径，如 "./react-dom/client.js"
    if (NEED_FACADE.has(spec)) {
      const facadeRel = facadeFileRel(spec);
      const implRel = entryRel;
      const keys = Object.keys(require_(spec));
      const stubDefaultImport = `import __m from "${implRel}";`;
      const lines = [stubDefaultImport, `export default __m;`];
      for (const k of keys) {
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)) {
          lines.push(`export const ${k} = __m.${k};`);
        }
      }
      writeFileSync(join(vendorDir, facadeFileBase(spec)), lines.join("\n") + "\n");
      map[spec] = facadeRel;
    } else {
      map[spec] = `./pool-vendor/${entryRel.slice(2)}`;
    }
  }

  console.log(`[pool-vendor] esbuild 产物 + facade 生成完成 → dist/pool-vendor/`);
  console.log(`[pool-vendor] import-map 覆盖 ${MAP_KEYS.length} specifiers`);
  return map;
}

/** esbuild 目录结构的入口文件（相对 pool-vendor/） */
function entryFileRel(spec) {
  switch (spec) {
    case "react": return "./react.js";
    case "react-dom": return "./react-dom.js";
    case "react-dom/client": return "./react-dom/client.js";
    case "react/jsx-runtime": return "./react/jsx-runtime.js";
    case "react/jsx-dev-runtime": return "./react/jsx-dev-runtime.js";
    case "i18next": return "./i18next.js";
    case "react-i18next": return "./react-i18next.js";
    default: throw new Error(`unknown spec ${spec}`);
  }
}
function facadeFileBase(spec) {
  return spec.split("/").join("-").replace(/^react-jsx-/, "jsx-") + ".facade.js";
}
function facadeFileRel(spec) {
  return `./pool-vendor/${facadeFileBase(spec)}`;
}

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (existsSync(s) && require_("fs").lstatSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

/** 注入 import-map 到 dist/pool.html（仅打包产物） */
function injectImportMap(map) {
  const htmlPath = join(distDir, "pool.html");
  if (!existsSync(htmlPath)) {
    console.log(`[pool-vendor] dist/pool.html 不存在，跳过 map 注入。`);
    return;
  }
  const html = readFileSync(htmlPath, "utf-8");
  const tag =
    `<script type="importmap">\n${JSON.stringify({ imports: map }, null, 2)}\n    </script>`;
  // 幂等：先剥掉既有 import-map（npm run build 每次 fresh，此处防手动重跑双注）
  const stripped = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/g, "");
  const titleIdx = stripped.indexOf("</title>");
  if (titleIdx === -1) {
    throw new Error("[pool-vendor] dist/pool.html 缺 </title> 锚点，无法注入 import-map。");
  }
  const injectAt = titleIdx + "</title>".length;
  const out = stripped.slice(0, injectAt) + "\n    " + tag + stripped.slice(injectAt);
  writeFileSync(htmlPath, out);
  console.log(`[pool-vendor] import-map 已注入 dist/pool.html（${MAP_KEYS.length} specifiers → pool-vendor/）`);
}

const map = await buildVendor();
if (map) injectImportMap(map);
