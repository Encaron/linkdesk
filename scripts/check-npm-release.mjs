#!/usr/bin/env node
/**
 * 黄灯闸：@linkdesk/* 作者面内容变了但 npm 版本没跟上 → 提醒 bump+发布（永不 fail）。
 *
 * 为什么：GitHub commit 每轮都有，npm 发布只在「插件作者能用到的东西」变时才该做。仓库已有三道闸只保证
 * 「文件内容最新」（contracts:check / check-plugin-schema-sync / sdk tsc），但没有任何东西保证「货架上
 * npm 版本跟上」——内容改了、版本没动、没发布，插件作者永远拿旧类型/旧工具，且不报错。本脚本堵这个缝。
 *
 * 设计（e6-gate-philosophy 三档：推荐/警告/知情绕行）：
 *   - 🔴 永不 exit≠0——`npm run check` 全绿纪律不破；只打黄灯警告行。
 *   - 发布完成 或 知情绕行（改了但决定不发）后，跑 `npm run release:mark` 把当前内容记为基线，灯灭。
 *   - 基线存 scripts/npm-release-state.json（入库）——锚「上次发布/放行时的版本 + 作者面内容哈希」。
 *
 * 判定（逐包）：
 *   A. 内容哈希漂移 且 package.json 版本 == 基线版本 → 「内容改了但版本没动——货架可能落后」⚠️
 *   B. package.json 版本 != 基线版本 → 「版本号动过但没 release:mark——真发了跑 mark 收尾；没打算发别动版本号」⚠️
 *   基线即当下 → 全静默（exit 0）。
 *
 * 作者面定义（tarball 内容的仓库侧代理）：
 *   @linkdesk/contracts         → contracts/linkdesk.d.ts + README.md（files 白名单成品；d.ts=作者消费的类型本体）
 *   @linkdesk/plugin-sdk        → src/** + schemas/**（plugin.schema + E6#60 收编 theme/icon-theme——schema 演进有 npm 黄灯盯）
 *                                 + dev-host/**（**出货**：files 白名单里；含 generate-contract.mjs 的生成物
 *                                   linkdesk-mock.generated.ts） + README.md（dist 不入库=tsc(src) 派生物，src 为权威面）
 *   create-linkdesk-plugin      → index.js + template/** + README.md（E6#95e 纳入）
 *                                 🔴 index.js 必须进面——它是 CLI 文案/占位符表；模板改了它常一起漂
 *   @linkdesk/ui                → src/** + README.md（E6#95e 纳入）
 *
 * 🔴 **为什么 2026-09-11 补了后两个包**（06 §三·五）：它们同样发在 npm、同样是作者面，但基线里没有 ⇒
 * **模板改了不发版，不会有任何灯会亮**。实证 `@linkdesk/ui@0.1.2` 已落后仓内 6 次改动（含 `assetBase`，
 * 插件 README 的图片靠它才显示）**一个月无声**。**「脚手架」这个漏最要命**——它正是 L3.7 3.7.5 整轮要改的东西：
 * **改完骨架却不发版 = 那一轮的全部劳动第三方作者看不到。**
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname ?? __dirname, ".."); // scripts/ → repo 根
const STATE_FILE = join(REPO_ROOT, "scripts", "npm-release-state.json");
const mark = process.argv.includes("--mark");

// 每包：dir=仓库内目录，versionFile=读版本的 package.json，surface=作者面文件（相对 repo 根的 glob/路径）
const PACKAGES = [
  {
    name: "@linkdesk/contracts",
    dir: "contracts",
    surface: ["contracts/linkdesk.d.ts", "contracts/README.md"],
  },
  {
    name: "@linkdesk/plugin-sdk",
    dir: "packages/plugin-sdk",
    surface: [
      "packages/plugin-sdk/src/**",
      "packages/plugin-sdk/schemas/**",
      // 🔴 dev-host/** 进表面（2026-09-12 补，实测）：它在 package.json 的 files 白名单里**真出货**，
      // 但表面只盯 src/schemas/README ⇒ 其中**生成物** `linkdesk-mock.generated.ts`（generate-contract.mjs
      // 第三产物，随契约演进）改了**不会有任何灯**。实证：本次 `#57.8` 加 update 域后仓内 mock 已更新、
      // 已发布的 0.1.10 里那份仍缺该命名空间——作者跑 `linkdesk-plugin dev` 拿到的 mock 少一个命名空间。
      // 判据：改 channels.ts 加一条通道 → 重生成 mock → **本闸必须亮**（改前不亮）。
      "packages/plugin-sdk/dev-host/**",
      "packages/plugin-sdk/README.md",
    ],
  },
  {
    name: "create-linkdesk-plugin",
    dir: "packages/create-linkdesk-plugin",
    // README.md 与另两包同口径纳入（它是 npm 页面的内容，改了对作者就是变了）
    surface: [
      "packages/create-linkdesk-plugin/index.js",
      "packages/create-linkdesk-plugin/template/**",
      "packages/create-linkdesk-plugin/README.md",
    ],
  },
  {
    name: "@linkdesk/ui",
    dir: "packages/linkdesk-ui",
    surface: ["packages/linkdesk-ui/src/**", "packages/linkdesk-ui/README.md"],
  },
];

/** 展开 glob（支持 ** 递归目录），返回相对 repo 根的已存在文件排序列表 */
function expandSurface(patterns) {
  const out = new Set();
  const walk = (base) => {
    for (const ent of readdirSync(base, { withFileTypes: true })) {
      const abs = join(base, ent.name);
      const rel = relative(REPO_ROOT, abs);
      if (ent.isDirectory()) {
        // src/** 型前缀递归
        const relDir = rel.split(sep).join("/");
        if (patterns.some((p) => p.endsWith("/**") && relDir.startsWith(p.slice(0, -3)))) walk(abs);
      } else {
        out.add(rel.split(sep).join("/"));
      }
    }
  };
  for (const p of patterns) {
    if (p.endsWith("/**")) {
      const dirAbs = join(REPO_ROOT, p.slice(0, -3));
      if (existsSync(dirAbs)) walk(dirAbs);
    } else if (existsSync(join(REPO_ROOT, p))) {
      out.add(p);
    }
  }
  return [...out].sort();
}

/**
 * sha256 over 排序文件列表内容（含路径分隔行——改名即漂移）。
 *
 * 🔴 **必须先归一行尾再入哈希**（2026-09-12 修，实测）：同一份仓库内容，本机工作区是 CRLF、
 * 干净检出是 LF（`.gitattributes` 的 `* text=auto eol=lf` 只约束「之后的检出」，**改写不了已经躺在
 * 盘上的旧字节**）⇒ 读原始字节算哈希 = 同一个内容在两次检出上得到两个哈希 ⇒ 基线**绑死记它的那台机器**。
 * 实证：`HEAD` 内容在本机（CRLF）算出 `8903790d…`、在干净检出（LF）算出 `b027cb7e…`，
 * 一个都对不上基线 ⇒ 换台机器/换次检出就必然误报。同类病本仓一天内已犯过两次
 * （`generate-contract.mjs` 2026-09-11 修、`generate-api-cheatsheet.mjs` 2026-09-12 CI 红），
 * 二者与 `contracts:check` 同款处理：**归一后再比**。
 * ⚠️ 判据不是「归一后灯灭了」（灯灭也可能因为基线本来就旧），而是：
 * **mark 之后，本机工作区与干净检出跑本脚本都必须静默**——不静默即说明还在绑机器。
 */
function contentHash(surfaceFiles) {
  const h = createHash("sha256");
  for (const rel of surfaceFiles) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const bytes = readFileSync(abs, "utf8").split("\r\n").join("\n");
    h.update(`### ${rel}\n`);
    h.update(bytes);
  }
  return h.digest("hex");
}

function readState() {
  if (!existsSync(STATE_FILE)) return [];
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return Array.isArray(state.packages) ? state.packages : [];
  } catch {
    return [];
  }
}

function readVersion(dir) {
  const vf = join(REPO_ROOT, dir, "package.json");
  if (!existsSync(vf)) return null;
  try {
    return JSON.parse(readFileSync(vf, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

const warnings = [];
const updated = [];

for (const pkg of PACKAGES) {
  const surfaceFiles = expandSurface(pkg.surface);
  const currentHash = contentHash(surfaceFiles);
  const currentVersion = readVersion(pkg.dir);
  const state = readState().find((s) => s.name === pkg.name) ?? null;

  if (!currentVersion) {
    warnings.push(`${pkg.name}: 找不到 ${pkg.dir}/package.json —— 无法核对版本，跳过`);
    continue;
  }

  if (mark) {
    // release:mark——记录当前内容+版本为基线（发布完成 或 知情绕行：改了但决定不发）
    updated.push({ name: pkg.name, version: currentVersion, contentHash: currentHash, files: surfaceFiles.length });
    continue;
  }

  const baseline = state?.contentHash;
  if (!state || !baseline) {
    warnings.push(`${pkg.name}: 无 release 基线（先跑一次 \`npm run release:mark\` 建立）`);
    continue;
  }

  const versionBumped = currentVersion !== state.version;

  if (currentHash !== baseline && !versionBumped) {
    // A. 内容变了、版本没动 → 货架可能落后（主提醒）
    warnings.push(
      `${pkg.name}: 作者面内容自 npm v${state.version} 发布后已变（${state.files ?? "?"} 文件基线漂移），` +
        `但 ${pkg.dir}/package.json 版本仍 ${currentVersion}——npm 货架没跟上。\n` +
        `   ├ 改了给作者的东西（新 API / schema / SDK）？→ 升版本 + \`npm publish\`（免验证）→ \`npm run release:mark\`\n` +
        `   └ 改了但决定不发？→ 知情绕行：\`npm run release:mark\`（记当前为基线，下次真变更会再提醒）`,
    );
  } else if (versionBumped) {
    // B. 版本动过但基线没 mark——bump 了 ≠ 发布了
    warnings.push(
      `${pkg.name}: 版本已从 ${state.version} 变为 ${currentVersion}，但 release 基线仍记 ${state.version}。\n` +
        `   ├ 已 \`npm publish\` 完成？→ 跑 \`npm run release:mark\` 收尾（记录新版本为基线）\n` +
        `   └ 没打算发却改了版本号？→ 把 ${pkg.dir}/package.json 版本改回去，别让版本号空转`,
    );
  }
  // else: 内容没变、版本没动 → 静默
}

if (mark) {
  const state = { _comment: "npm 发布基线——发布完成或知情绕行后由 `npm run release:mark` 更新（勿手改）", packages: updated };
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(`release:mark ✔️ 已记录 ${updated.map((u) => `${u.name}@${u.version}（${u.files} 文件）`).join("、")} 为发布基线`);
} else if (warnings.length > 0) {
  // 🟡 黄灯：永不 fail——只打印提醒，exit 0
  console.warn("\n⚠️  [npm-release] 黄灯：作者面内容与 npm 发布基线不一致（不阻塞，只是提醒）\n");
  for (const w of warnings) console.warn("  " + w.replaceAll("\n", "\n  "));
  console.warn("\n  → 发布/放行后跑 `npm run release:mark` 让灯灭。\n");
} else {
  console.log("check-npm-release ✔️ @linkdesk/* 作者面与发布基线一致");
}
process.exit(0);
