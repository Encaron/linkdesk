/**
 * @linkdesk/ui 构建脚本（E6#54b）——`npm run build`
 *
 * 四步，顺序固定：
 *   1. vite lib build → dist/index.js（ESM，react 系 external）+ dist/*.css（聚合）
 *   2. 聚合 css 统一改名 index.css + 注入 `import "./index.css";`
 *      （vite lib 产出的 JS 不自带 css import——消费方是 vite build，JS 图可达即随包）
 *   3. tsc 声明发射：组件源码（壳 src/components/shared）mirror 成 dist/<folder>/<X>.d.ts
 *      （rootDir=shared → 镜像拓扑，d.ts 内部相对引用保持一致）
 *   4. 从 barrel src/index.ts 生成公共 dist/index.d.ts（@shared/<folder>/<File> → ./<folder>/<File>）
 *
 * 单一源码防漂移（07 §四）：组件源码只存壳一处；dist/index.d.ts 由 barrel 生成——
 * 改公共导出面只改 src/index.ts 一处。
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // packages/linkdesk-ui/scripts
const PKG = resolve(HERE, ".."); // packages/linkdesk-ui
const ROOT = resolve(PKG, "../.."); // 仓库根
const DIST = resolve(PKG, "dist");

function run(cmd, cwd = PKG) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

// ── 1. vite lib build ───────────────────────────────────────────────────────
run(`node ${JSON.stringify(resolve(ROOT, "node_modules/vite/bin/vite.js"))} build`, PKG);

// ── 2. 聚合 css → index.css（vite 命名跟包名走，如 ui.css）─── 注入 JS import（幂等）─
const topCss = readdirSync(DIST).filter((f) => f.endsWith(".css") && !f.startsWith("assets"));
if (topCss.length !== 1) throw new Error(`dist 顶层 css 应为 1 个，实际 ${topCss.length}: ${topCss.join(",")}`);
const [cssFile] = topCss;
if (cssFile !== "index.css") {
  writeFileSync(resolve(DIST, "index.css"), readFileSync(resolve(DIST, cssFile)));
  rmSync(resolve(DIST, cssFile));
}
const jsPath = resolve(DIST, "index.js");
const js = readFileSync(jsPath, "utf8");
if (!/import "\.\/index\.css";/.test(js)) {
  writeFileSync(jsPath, `import "./index.css";\n${js}`);
}

// ── 3. tsc 声明发射（组件源码 mirror → dist/<folder>/<X>.d.ts）──────────────
run(`node ${JSON.stringify(resolve(ROOT, "node_modules/typescript/bin/tsc"))} -p tsconfig.decl.json`, PKG);

// ── 3b. 剥离 d.ts 里泄漏的 css side-effect import（聚合 css 在 index.css，无 per-folder css；TS 因 css 物理存在而保留）──
for (const f of readdirSync(DIST, { recursive: true }).filter((x) => typeof x === "string" && x.endsWith(".d.ts"))) {
  const p = resolve(DIST, f);
  const t = readFileSync(p, "utf8");
  const t2 = t.replace(/^import "[^"]*\.css";\s*\n/gm, "");
  if (t2 !== t) writeFileSync(p, t2);
}

// ── 4. 从 barrel 生成公共 dist/index.d.ts ──────────────────────────────────
const barrel = readFileSync(resolve(PKG, "src/index.ts"), "utf8");
const valueLines = [];
const typeLines = [];
for (const line of barrel.split("\n")) {
  const from = line.match(/from\s+"@shared\/(.+)";\s*$/);
  if (!from) continue;
  const names = line.trim();
  if (/^export\s+type\s*\{/.test(names)) {
    const inner = names.replace(/^export\s+type\s*\{/, "").replace(/\}\s*from.*$/, "").trim();
    typeLines.push(`export type { ${inner} } from "./${from[1]}";`);
  } else if (/^export\s*\{/.test(names)) {
    const inner = names.replace(/^export\s*\{/, "").replace(/\}\s*from.*$/, "").trim();
    valueLines.push(`export { ${inner} } from "./${from[1]}";`);
  } else {
    throw new Error(`barrel 未知导出行：${line}`);
  }
}
mkdirSync(DIST, { recursive: true });
writeFileSync(
  resolve(DIST, "index.d.ts"),
  `/** @linkdesk/ui 公共类型入口（E6#54b 构建生成——勿手改；改导出面改 packages/linkdesk-ui/src/index.ts 后重跑 build） */\n${[...valueLines, ...typeLines].join("\n")}\n`,
);
console.log(`✓ dist 就绪：index.js(+css import) / index.css / <folder>/*.d.ts / index.d.ts（${valueLines.length} 值 + ${typeLines.length} 类型导出）`);
