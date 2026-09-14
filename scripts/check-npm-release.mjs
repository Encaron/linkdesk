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
 *   - 发布完成后跑 `npm run release:mark` 把当前内容记为基线，灯灭。
 *   - 基线存 scripts/npm-release-state.json（入库）——锚「上次发布/放行时的版本 + 作者面内容哈希」。
 *
 * 🔴 **`release:mark` 契约（2026-09-12 用户拍板「凡更新就发，记住，记不住就机械记住」）**：
 * 本闸本身**永不拦人**（黄灯哲学不撤），但「把灯关掉」这个动作从今天起**要过货架核对**——
 * 因为「不发布、只 mark」曾经是绕过口：灯灭了，货架还是旧的，纪律只活在人的记忆里。
 *   记录前逐包过三关（**任一不过即拒绝该包，且整批不落盘、exit 1**）：
 *     ① 货架问得到（网络不通/包不存在 ⇒ 拒绝。**绝不静默放行**——那就是又一条假门禁）
 *     ② 货架 `latest` === 本地 `package.json` 版本（≠ ⇒ 「先 publish，或把版本号改回去」）
 *     ③ 版本号自上次基线起动过（没动 ⇒ 内容跑在版本号前面了 ⇒ 逼 bump+publish）
 *   无漂移的包（内容与版本都与基线一致）**原样带过**，不联网、不核对——没东西要记。
 *   显式 `npm run release:mark -- --allow-drift` 才放行绕过。**绕过必须是看得见的动作，不是默认路径。**
 * 🔴 **非 mark 模式绝不联网**——`npm run check` 每次提交都跑，它必须离线、必须快。
 * 🔴 **不要让本脚本的 mark 分支「也 exit 0」**——它和上面的黄灯不是一回事：黄灯是提醒，拒绝记基线是保护。
 *
 * 用法：
 *   npm run check:npm-release            # 黄灯核对（挂 `npm run check`，离线，永不 fail）
 *   npm run release:mark                 # 记基线（过货架核对，拒绝时 exit 1）
 *   npm run release:mark -- --allow-drift  # 显式绕过（真的决定这次不发）
 *   npm run check:npm-release:selftest   # 判据自测（10 例，不联网不落盘）
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
const allowDrift = process.argv.includes("--allow-drift");

/**
 * 向 npm 货架问「这个包的 latest 是哪个版本」。
 *
 * 🔴 **走 registry 的 dist-tags 端点，不走 `npm view`**——两个理由：
 *   ① `npm view` 读**当前目录**的 `.npmrc`，而 `create-linkdesk-plugin` **无作用域**（它的
 *      `.npmrc` 直接改默认源），从仓库根问会落到 `registry.npmmirror.com`（镜像有延迟）
 *      ⇒ 同一段代码对四个包问的不是同一个货架。写死官方源才是唯一确定的问法。
 *   ② 免掉 shell 与引号（Windows 上 npm 是 `npm.cmd`，带 `@scope/pkg` 与 `//` 的参数要过 cmd）。
 * 端点极小（只回 dist-tags），比拉整个 packument 便宜。
 */
async function shelfLatest(name) {
  const url = `https://registry.npmjs.org/-/package/${encodeURIComponent(name)}/dist-tags`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const tags = await res.json();
    return tags?.latest
      ? { ok: true, version: tags.latest }
      : { ok: false, reason: "dist-tags 里没有 latest" };
  } catch (err) {
    const why = err?.name === "TimeoutError" ? "请求超时（15s）" : (err?.message ?? String(err));
    return { ok: false, reason: why };
  }
}

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
  {
    // 🔴 E6#105l（L7 7.8 轮）：**第五根作者轴**——作者面文档包。
    // 表面 = 生成物本身（packages/plugin-docs/docs/**）+ 包 README；真源在 docs/03-插件制造/**，
    // 改了真源不重生成 ⇒ docs:check 先红（挂 npm run check）⇒ 本闸再亮"该发版了"。
    // ⚠️ 基线（npm-release-state.json）要等**首次真发**后由 release:mark 落——没发过就没有基线，
    //    黄灯会一直亮着提醒，那是**正确状态**，不是故障。
    name: "@linkdesk/plugin-docs",
    dir: "packages/plugin-docs",
    surface: ["packages/plugin-docs/docs/**", "packages/plugin-docs/README.md"],
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

/**
 * 纯判据：这一次 mark 该做什么。**不碰磁盘、不联网**——货架结果由调用方注入，
 * 故四条路径能被 `--self-test` 机械复跑（同族脚本同一套路）。
 *
 * 返回 `{ action }`：
 *   `"skip"`       内容与版本都与基线一致 ⇒ 没东西要记（**不联网**）
 *   `"need-shelf"` 有漂移 ⇒ 调用方去问货架，带着结果再调一次
 *   `"record"`     放行，记为新基线
 *   `"refuse"`     拒绝（`reason` = 给人看的整段文案，**文案只在这里写一份**）
 */
function markDecision({
  pkg,
  hasBaseline,
  baselineVersion,
  baselineHash,
  currentVersion,
  currentHash,
  allowDrift,
  shelf,
}) {
  // 无基线（新纳入 PACKAGES 的包）⇒ 两个「变过」都算真：必须走核对，不许因为「没得比」就蒙混
  const contentChanged = hasBaseline ? currentHash !== baselineHash : true;
  const versionMoved = hasBaseline ? currentVersion !== baselineVersion : true;

  if (!contentChanged && !versionMoved) return { action: "skip" };
  if (allowDrift) return { action: "record" };
  if (!shelf) return { action: "need-shelf" };

  if (!shelf.ok) {
    return {
      action: "refuse",
      reason:
        `${pkg.name}: 问不到货架（${shelf.reason}）—— 拒绝记基线。\n` +
        `   ├ 网络/代理不通？修好再跑（**离线不代表可以默认放行**）\n` +
        `   └ 确认这次就是不发？→ 显式绕过：\`npm run release:mark -- --allow-drift\``,
    };
  }
  if (shelf.version !== currentVersion) {
    return {
      action: "refuse",
      reason:
        `${pkg.name}: 货架上是 ${shelf.version}，本地是 ${currentVersion} —— 拒绝记基线。\n` +
        `   ├ 本地更新了？→ 先 \`npm publish\`（发布完成后本动作自然通过）\n` +
        `   └ 版本号改错了？→ 把 ${pkg.dir}/package.json 改回去，别让版本号空转`,
    };
  }
  if (!versionMoved) {
    return {
      action: "refuse",
      reason:
        `${pkg.name}: 作者面内容变了，但版本号仍 ${currentVersion}（= 基线版本）—— 拒绝记基线。\n` +
        `   ├ 这正是「凡更新就发」要拦的：内容跑在版本号前面了 ⇒ 升版本 + \`npm publish\`\n` +
        `   └ 确认这次就是不发？→ 显式绕过：\`npm run release:mark -- --allow-drift\``,
    };
  }
  return { action: "record" };
}

/**
 * `--self-test`：把「release:mark 契约」的十种输入跑一遍（**不碰网络、不碰磁盘**）。
 * 覆盖的是 2026-09-12 落地时**在真脚本上实测过的四条路径**（①货架问不到 / ②货架落后 /
 * ③内容跑在版本号前面 / ④`--allow-drift`）+ 正常发布 + 无漂移 + 首次纳入 + 两条负控。
 */
function runSelfTest() {
  const P = { name: "@linkdesk/demo-pkg", dir: "demo-pkg" }; // 虚构值（硬约束 21 口径）
  const ok = (v) => ({ ok: true, version: v });
  const down = { ok: false, reason: "fetch failed" };
  const base = {
    pkg: P,
    hasBaseline: true,
    baselineVersion: "0.1.0",
    baselineHash: "h1",
    currentVersion: "0.1.0",
    currentHash: "h1",
    allowDrift: false,
  };
  const noBaseline = { ...base, hasBaseline: false, baselineVersion: undefined, baselineHash: undefined };
  const cases = [
    ["无漂移 ⇒ skip（且不索要货架 = 不联网）", { ...base }, "skip"],
    ["🔴 负控：--allow-drift 但无漂移 ⇒ 仍 skip（不许因为加了 flag 就乱记）", { ...base, allowDrift: true }, "skip"],
    ["① 货架问不到 ⇒ 拒（绝不静默放行）", { ...base, currentHash: "h2", shelf: down }, "refuse", /问不到货架/],
    ["② 版本动了、货架落后 ⇒ 拒", { ...base, currentVersion: "0.1.1", currentHash: "h2", shelf: ok("0.1.0") }, "refuse", /货架上是 0\.1\.0，本地是 0\.1\.1/],
    ["② 拒的文案要指名到具体文件", { ...base, currentVersion: "0.1.1", currentHash: "h2", shelf: ok("0.1.0") }, "refuse", /demo-pkg\/package\.json/],
    ["③ 内容变了、版本没动 ⇒ 拒（「凡更新就发」要拦的正是这个）", { ...base, currentHash: "h2", shelf: ok("0.1.0") }, "refuse", /内容变了，但版本号仍 0\.1\.0/],
    ["④ --allow-drift 且有漂移 ⇒ 记（绕过真能绕过）", { ...base, currentHash: "h2", allowDrift: true }, "record"],
    ["正常发布后（内容变+版本动+货架跟上）⇒ 记", { ...base, currentVersion: "0.1.1", currentHash: "h2", shelf: ok("0.1.1") }, "record"],
    ["首次纳入（无基线）⇒ 索要货架，不蒙混", { ...noBaseline }, "need-shelf"],
    ["首次纳入 + 货架=本地 ⇒ 记", { ...noBaseline, shelf: ok("0.1.0") }, "record"],
  ];

  let failed = 0;
  for (const [title, input, expectAction, expectRe] of cases) {
    const r = markDecision(input);
    const okAction = r.action === expectAction;
    const okRe = !expectRe || expectRe.test(r.reason ?? "");
    if (okAction && okRe) {
      console.log(`  ✔ ${title}`);
    } else {
      failed++;
      console.error(
        `  ✗ ${title}\n      期望 ${expectAction}${expectRe ? ` 且匹配 ${expectRe}` : ""}，实得 ${r.action}` +
          (r.reason ? `\n      reason: ${r.reason.replaceAll("\n", "\n      ")}` : ""),
      );
    }
  }
  console.log(
    failed === 0
      ? `\ncheck-npm-release self-test ✔️ ${cases.length} 例全过`
      : `\ncheck-npm-release self-test ❌ ${failed}/${cases.length} 例失败`,
  );
  return failed === 0 ? 0 : 1;
}

if (process.argv.includes("--self-test")) process.exit(runSelfTest());

const warnings = [];
const updated = [];
const refusals = [];
const priorState = readState();

for (const pkg of PACKAGES) {
  const surfaceFiles = expandSurface(pkg.surface);
  const currentHash = contentHash(surfaceFiles);
  const currentVersion = readVersion(pkg.dir);
  const state = priorState.find((s) => s.name === pkg.name) ?? null;

  if (!currentVersion) {
    warnings.push(`${pkg.name}: 找不到 ${pkg.dir}/package.json —— 无法核对版本，跳过`);
    continue;
  }

  if (mark) {
    // release:mark——过「release:mark 契约」三关（见文件头）后记录当前内容+版本为基线。
    // 判据全在纯函数 markDecision 里（可被 --self-test 复跑）；这里只管取货架结果与落库。
    const input = {
      pkg,
      hasBaseline: Boolean(state?.contentHash),
      baselineVersion: state?.version,
      baselineHash: state?.contentHash,
      currentVersion,
      currentHash,
      allowDrift,
    };
    let decision = markDecision(input);
    // 只在「确实需要核对」时才出网——无漂移的包整批跳过，mark 日常不碰网络
    if (decision.action === "need-shelf") decision = markDecision({ ...input, shelf: await shelfLatest(pkg.name) });

    if (decision.action === "skip") {
      updated.push(state); // 无漂移：原样带过（不重写、不改哈希口径）
      continue;
    }
    if (decision.action === "refuse") {
      refusals.push(decision.reason);
      continue;
    }
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
        `   └ 决定不发？→ 记基线要过货架核对，会拒：显式绕过用 \`npm run release:mark -- --allow-drift\``,
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
  // 🔴 整批原子：任一包被拒 ⇒ 一个字节都不写（部分落盘会造出一个「有的包记得、有的没记」的中间态，
  //    下次看基线的人分不清那是「还没发」还是「漏记」）
  if (refusals.length > 0) {
    console.error("\n⛔ [npm-release] 拒绝记基线——下列包未过「release:mark 契约」（状态文件未改动）：\n");
    for (const r of refusals) console.error("  " + r.replaceAll("\n", "\n  "));
    console.error("\n  → 逐条处理完再跑；确实要绕过请显式加 `-- --allow-drift`。\n");
    if (warnings.length > 0) for (const w of warnings) console.warn("  " + w);
    process.exitCode = 1; // 🔴 不是 process.exit(1)——理由见文件末尾 process.exitCode = 0 处
  } else {
    const state = {
      _comment:
        "npm 发布基线——由 `npm run release:mark` 更新（勿手改）；记基线须过货架核对，见 scripts/check-npm-release.mjs 文件头",
      packages: updated,
    };
    writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    console.log(
      `release:mark ✔️ 已记录 ${updated.map((u) => `${u.name}@${u.version}（${u.files} 文件）`).join("、")} 为发布基线` +
        (allowDrift ? "　⚠️ --allow-drift：本次绕过货架核对" : ""),
    );
  }
  // ⚠️ 这里的 if/else 是**必须**的：`process.exitCode = 1` 不终止执行——少了 else，被拒的批次会
  //    继续往下把那批「拒了又照样写」的基线落盘，「整批原子」当场失效。
} else if (warnings.length > 0) {
  // 🟡 黄灯：永不 fail——只打印提醒，exit 0
  console.warn("\n⚠️  [npm-release] 黄灯：作者面内容与 npm 发布基线不一致（不阻塞，只是提醒）\n");
  for (const w of warnings) console.warn("  " + w.replaceAll("\n", "\n  "));
  console.warn(
    "\n  → 发布完成后跑 `npm run release:mark` 让灯灭（该动作要过货架核对；确实不发的用 `-- --allow-drift`）。\n",
  );
} else {
  console.log("check-npm-release ✔️ @linkdesk/* 作者面与发布基线一致");
}

// 🔴 **结尾不调 `process.exit()`，只设 `process.exitCode`**（2026-09-12 修，实测）：
//    `shelfLatest()` 用的是全局 `fetch`（undici），连接会以 keep-alive 留在池里。走到这里时那些
//    句柄正处在**关闭途中**，此刻 `process.exit()` 强拆事件循环 ⇒ Windows 上 libuv 断言
//    `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94`
//    ⇒ **退出码变 127**（工作其实做完了：状态文件写了、黄灯也灭了，只有退出码是假的）。
//    实证：联网路径（4 包里有漂移 ⇒ 真发 fetch）连跑 3 次 **3/3 EXIT=127**；不联网路径
//    （基线一致 ⇒ 零 fetch）与 `--self-test` 均 EXIT=0。改法 = 让事件循环自己排空（undici 的
//    空闲连接会在其 keep-alive 超时后自然关闭），退出码由 Node 在自然退出时读走。
//    ⚠️ 判据：**真联网路径**跑 `npm run release:mark` 退出码必须是 0——不是「黄灯灭了」就算过
//    （那盏灯在 127 那次也是灭的）。负控：不许靠 `-- --allow-drift` 把这条路径绕过去（绕过是
//    显式动作，不是修好）。
