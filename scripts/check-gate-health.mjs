/**
 * 机械门禁：**门禁健康度**（E6#109p-b · 轮次 1.28b · 件 8 的「防复发」那一道）。
 *
 * 用法：node scripts/check-gate-health.mjs
 *       node scripts/check-gate-health.mjs --self-test
 * 退出码 0 = 全部健康（或已登记豁免）；1 = 有门禁既没接线也不在豁免里（或豁免账本过期/腐烂）。
 *
 * ── 为什么必须有它（出处：1.27 体检 ＋ [22 号档](../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/22-收口总方案-跨方样式污染九件套.md) §一 层 3）──
 *   本系列的真根因**不是「写错了一句 `if`」**，是**判据的存活被假设、从来没被验证**。
 *   1.27 全量体检实测：34 道 `check-*.mjs` 里 **17 道没有 `--self-test`**——「它会红」这件事
 *   **全靠人手验过一次**。这道门禁把「新增一道门禁必须带自测并接线」变成**机械可查**，
 *   否则这一件治好的病会在**下一次新增门禁时复发**（＝「把正确寄托在人记得住」的老病）。
 *
 * ── 判定式（每道 `check-*.mjs` 必须满足 A 或 B）──
 *   A. **链里接线 ＋ 真能跑**：
 *      A① `package.json` 的 `check` 链里存在 `<脚本文件名> --self-test` 这一步
 *          （**按 `&&` 分词后逐段精确比较**——⛔ 不许用 `includes()` 子串匹配：
 *           `check-x.mjs` 是 `check-x.mjs.bak` 的子串，子串比较会把不存在的步判成命中）；
 *      A② 该步**真跑一次退出码 0**（本脚本自己跑——全部自测合计约 4 秒，付得起。
 *          🔑 **这一条是本门禁与「grep 源码里有没有 `self-test` 字样」的分界线**：
 *          「提到过」≠「有」，那个 grep 本身就是本项目要治的启发式；而且**只有真跑**才能发现
 *          「有 `--self-test` 分支但恒绿/崩了」这类假门禁）。
 *   B. **在豁免清单里**（`EXEMPT`）：
 *      B① **只允许文件级**（⛔ 不是按判据内容逐条豁免）；
 *      B② **理由必填**，且必须写「**怎么在有环境处跑**」；
 *      B③ **反向核对（防账本腐烂）**：清单里每条必须 (a) 仍对应磁盘上真实存在的文件，
 *          且 (b) **今天确实没有接线**——已经接上自测却还留在豁免里 ⇒ 报「过期豁免」（逼人删条目）。
 *
 * ── ⛔ 域外声明（免得下一个人以为漏了）──
 *   本门禁的域 = **`scripts/check-*.mjs`**（文件名级）。以下**不在域内**，不是漏扫：
 *   · `scripts/audit-*.mjs`（如 `audit-i18n.mjs`）、`scripts/plugin-css-prefix-audit.mjs`、
 *     `scripts/runtime-style-audit.mjs`、`scripts/generate-*.mjs`、`scripts/assert-*.mjs`、
 *     `scripts/write-product-json.mjs`、`scripts/sync-plugin-agents.mjs` 等
 *     —— 它们的性质是**只读工具/生成器/发布件**，不是 check 链成员（各有各的 `--self-test` 或 `--check`）。
 *   · 🔴 其中 **`plugin-css-prefix-audit.mjs` 是「故意不接线」**：它要 SDK `dist/`，而 `dist/` 是
 *     `.gitignore` 的 ⇒ 接进链会让**干净检出当场红**。这是记忆 `gate-selftest-must-be-wired` 的
 *     **判据内例外**（真门禁 = 随包 SDK 单测，已随 vitest 挂在 check 里）。⛔ **别把它算成「无自测门禁」**。
 *
 * ── 自洽 ──
 *   本门禁自己也有 `--self-test` 且被链接线，自测里含「把某道自测步从链里删掉 ⇒ 红」与
 *   「有 `--self-test` 分支但真跑失败 ⇒ 红」两条负控（否则它自己就是它要治的病）。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG = resolve(ROOT, "package.json");
const SCRIPTS = resolve(ROOT, "scripts");

/** 判定域（文件名级）——只有它参与判定 */
const DOMAIN_RE = /^check-.*\.mjs$/;

/**
 * 豁免清单（**文件级 ＋ 理由必填**）——初始只有 1 条。
 * ⛔ 不许为了凑绿扩大它：把大批 check 塞进来 = 这一件白做。
 */
export const EXEMPT = [
  {
    file: "check-lsp-smoke.mjs",
    why:
      "**环境依赖**——它是集成冒烟不是静态门禁：真要 spawn pyright ＋ 真跑 JSON-RPC 握手（initialize → didOpen → definition），" +
      "依赖 `python` 插件仓（源码自 L7 已外移独立仓）与其中的 `pyright` 同时在本机存在。" +
      "**怎么在有环境处跑**：`npm run lsp:smoke`（或 `npm run lsp:smoke -- --base <python 插件仓路径>`；" +
      "亦支持 `LSP_DEP_BASE=<同上>` 与 `--pyright <绝对路径>`，候选位自动发现顺序见脚本头）。" +
      "**无环境时它会红——且红得有出路**（打印三条可选路径），不是静默假绿。" +
      "⚠️ 它也**不在 `npm run check` 链里**（挂 `lsp:smoke`）——这是**有意**的：check 必须能在" +
      "没有插件容器／没有 pyright 的机器上跑。1.27 本机实测：绿（走容器 `E:\\linkdesk-plugins\\official\\python`）。",
  },
];

/**
 * ── 🔴 已知空转登记（`IDLE`）——**不是豁免**，是「**登记在册的、暂时无输入的正确判据**」──
 *   与 `EXEMPT` 的区别：豁免说的是「**这道门禁不打算有自测**」（环境依赖），
 *   空转登记说的是「**判据本身没错，但它的输入数据源今天不含违规形态**」（1.27 立的判据：**空转 ≠ 零存量**）。
 *   处置只有两条路：**修数据源** 或 **退役**（⛔ 不是「放着不管」）。
 *
 *   每条必填 `what` / `why` / `status`（`已处置` | `未处置`）/ `who`（谁在什么时候补——⛔ 不许写「以后再补」）。
 *   `check` 是**可选的机械核验**（防账本单向腐烂）：
 *     · `mode: "absent"`  —— 该 marker **不该再出现**（用来钉「已退役」：有人加回来 ⇒ 红）
 *     · `mode: "present"` —— 该 marker **必须仍在**（用来钉「已修好的生产端」：有人删掉 ⇒ 红）
 *   ⭐ 全表**每次运行逐条打印**（含全绿时）⇒ 在链里天天可见，不会悄悄烂掉。
 */
export const IDLE = [
  {
    what: "SDK `reserved-classes.ts` 判据①「裸定义宿主保留类名」",
    why:
      "输入是 `schemas/reserved-class-names.json` 的 `classes` 段，而该段**已随 E6#109l-b（1.21b）整块删除**" +
      "（现只剩 `keyframes`）⇒ `classMap` 恒空 ⇒ 判据想报也报不出来。1.27 实验实证：写 `.badge { }`（当年 `classes` 的头号名字）**只有前缀腿报点**。",
    status: "已处置",
    who:
      "**1.28a（2026-09-16）**：判据① **退役**——代码路径 ＋ `ReservedNames.classes` 字段 ＋ `plugin-prefix.ts` 的类名侧补充措辞一并删除；" +
      "⚠️ **判据②（关键帧撞宿主名）保留**——拿不到 `pluginId` 时前缀腿 fail-closed，它是唯一的独报腿。",
    check: {
      file: "packages/plugin-sdk/src/eslint/checks/reserved-classes.ts",
      mode: "absent",
      marker: "const classMap = new Map",
      note:
        "这里又出现 `const classMap = …` ⇒ 退役被改回去了（登记表与实况不符，红一次逼对账）。" +
        "⚠️ marker 必须挑**只在代码里出现**的形态——第一版用了裸 `classMap`，结果撞上了本文件头部**自己那句退役说明**里的字样（登记表当场假红一次），这就是选 marker 的教训",
    },
  },
  {
    what: "市场「拒装」腿（catalog 条目的 `minAppVersion`）",
    why:
      "市场侧 `parse.ts` 读条目、`useInstallAction.ts` 拒装——**腿是齐的**；但生产端 `buildCatalogEntry()` **从不写该键**" +
      "⇒ 官方 18 仓目录条目 **0/18 有**（准确说法：2/18 manifest 有声明、0/18 条目有）⇒ 那条腿永远不触发。",
    status: "已处置",
    who:
      "**1.28a** 补生产端（`ManifestView` / `collectManifestView` / `buildCatalogEntry`）＋ **1.28b 真发** `@linkdesk/plugin-sdk@0.1.28`（2026-09-16）。" +
      "⚠️ **存量条目不回溯**：已发布的 18 仓要等**各自下次发布**才带上该字段 ⇒ 对**存量版本**该腿仍不生效（对**新发布**生效）——这条边界交 1.20 报告。",
    check: {
      file: "packages/plugin-sdk/src/publish.ts",
      mode: "present",
      marker: "minAppVersion !== undefined",
      note: "找不到生产端那段 ⇒ 有人把它删了（腿又变回空转）",
    },
  },
  {
    what: "壳判据⑧ 的**插件域另一半**（插件侧 `animation:` 引用的关键帧是否存在）",
    why:
      "判据⑧ 的域只做了**宿主域 ＋ 共享组件域**（`allowedKeyframes = sharedKf + shellKf`），而 **SDK 侧没有任何关键帧引用判据**。" +
      "🔴 1.27 复量**推翻**了 1.26 的「缺口为空」：18 仓**有 3 处 `animation:` 引用**" +
      "（`marketplace` ×1 ／ `serial-monitor` ×2，与 3 处同名 `@keyframes` 逐一对上、**今天自解析**）" +
      "⇒ 缺口**有真实质量**（改名忘改引用 = 动画静默消失），只是今天恰好没踩。",
    status: "未处置",
    who: "归**一个新的 SDK 轮**（新判据要**先发 SDK、再铺 18 仓**）；1.27 登记、1.28 未做——⛔ 别在 1.29（件 9 评估轮）顺手开工。",
  },
];

/**
 * 纯判定（自测注入假输入）：空转登记表自身是否自洽 ＋ 机械核验。
 * @param {{entries: any[], readFile: (rel: string) => string}} input
 */
export function judgeIdleRegistry({ entries, readFile }) {
  const violations = [];
  for (const e of entries) {
    const label = e.what ?? "(缺 what)";
    for (const field of ["what", "why", "status", "who"]) {
      if (!e[field] || !String(e[field]).trim()) {
        violations.push({
          kind: "idle-incomplete",
          what: label,
          msg: `空转登记条目「${label}」缺 \`${field}\`——登记表必填 what/why/status/who`,
        });
      }
    }
    if (e.status && !["已处置", "未处置"].includes(e.status)) {
      violations.push({
        kind: "idle-status",
        what: label,
        msg: `空转登记条目「${label}」的 status 只能是「已处置」或「未处置」，实得 ${JSON.stringify(e.status)}`,
      });
    }
    if (e.check) {
      const { file, mode, marker, note } = e.check;
      let text = null;
      try {
        text = readFile(file);
      } catch {
        violations.push({ kind: "idle-check-unreadable", what: label, msg: `空转登记条目「${label}」的机械核验读不到文件 ${file}` });
      }
      if (text !== null) {
        const found = text.includes(marker);
        if (mode === "absent" && found) {
          violations.push({ kind: "idle-check-stale", what: label, msg: `空转登记条目「${label}」说它已退役，但 \`${file}\` 里仍有 \`${marker}\`——${note}` });
        }
        if (mode === "present" && !found) {
          violations.push({ kind: "idle-check-lost", what: label, msg: `空转登记条目「${label}」说生产端已补，但 \`${file}\` 里找不到 \`${marker}\`——${note}` });
        }
      }
    }
  }
  return violations;
}

/**
 * 纯判定（自测注入假输入）：给定域名册、链、豁免清单 ⇒ 违规列表。
 * 不读盘、不执行——「真跑」那一层在 `main()` 里（见 A②）。
 * @param {{files: string[], chain: string, exempt: {file: string, why: string}[], exists?: (f: string) => boolean}} input
 */
export function judgeGateHealth({ files, chain, exempt, exists = () => true }) {
  const violations = [];
  const steps = chain
    .split("&&")
    .map((s) => s.trim())
    .filter(Boolean);
  const exemptFiles = new Set(exempt.map((e) => e.file));

  // 域外文件名一律忽略（域 = check-*.mjs）
  const domain = files.filter((f) => DOMAIN_RE.test(f));

  const wired = [];
  for (const f of domain) {
    const step = `node scripts/${f} --self-test`;
    const isWired = steps.includes(step); // A① 精确整段比较（非子串）
    if (isWired) {
      if (exemptFiles.has(f)) {
        violations.push({
          kind: "stale-exempt",
          file: f,
          msg: `${f} 已经接线了却还留在豁免清单里——**过期豁免**（账本要跟着实况走：把该条从 EXEMPT 里删掉）`,
        });
      }
      wired.push(f);
      continue;
    }
    if (!exemptFiles.has(f)) {
      violations.push({
        kind: "not-wired",
        file: f,
        msg:
          `${f} **既没有接线也不在豁免里**——补 \`--self-test\` 并把 \`node scripts/${f} --self-test\` ` +
          `**贴着它自己那一步**放进 \`package.json\` 的 check 链（照既有写法：\`x.mjs --self-test && x.mjs\`），` +
          `或按「文件级 ＋ 带理由」把它登记进本脚本的 EXEMPT`,
      });
    }
  }

  // B③ 反向核对：豁免条目必须指向真实存在、且今天确实没接线的文件
  for (const e of exempt) {
    if (!e.why || !e.why.trim()) {
      violations.push({ kind: "exempt-no-reason", file: e.file, msg: `豁免条目「${e.file}」缺理由——豁免必须挂账（文件级 ＋ 理由必填 ＋ 写清怎么在有环境处跑）` });
    }
    if (!exists(e.file)) {
      violations.push({ kind: "rotten-exempt", file: e.file, msg: `豁免条目「${e.file}」指向的文件**不存在**——账本腐烂了，删掉该条` });
    }
  }

  return { violations, wired, exempt: exempt.filter((e) => exists(e.file)).map((e) => e.file), domain };
}

// ────────────────────────────────── 自测 ──────────────────────────────────

export function runSelfTest() {
  const chainOf = (names) => names.map((n) => `node scripts/${n}.mjs --self-test && node scripts/${n}.mjs`).join(" && ");
  const E = (file, why = "夹具理由：怎么在有环境处跑 = npm run demo") => ({ file, why });

  const cases = [
    // ── 正控：该过的过 ──
    [
      "正控①：全部接线 ⇒ 零违规",
      judgeGateHealth({ files: ["check-a.mjs", "check-b.mjs"], chain: chainOf(["check-a", "check-b"]), exempt: [] }).violations.length,
      0,
    ],
    [
      "正控②：没接线但在豁免里（文件级＋有理由）⇒ 零违规",
      judgeGateHealth({ files: ["check-a.mjs"], chain: "node scripts/other.mjs", exempt: [E("check-a.mjs")] }).violations.length,
      0,
    ],
    [
      "正控③：**域外**文件（audit-*／非 check-*）一律忽略 ⇒ 零违规（域 = check-*.mjs）",
      judgeGateHealth({
        files: ["audit-i18n.mjs", "plugin-css-prefix-audit.mjs", "runtime-style-audit.mjs", "generate-plugin-docs.mjs"],
        chain: "node scripts/audit-i18n.mjs --strict",
        exempt: [],
      }).violations.length,
      0,
    ],
    [
      "正控④：`--self-test` 字样出现在别的步里**不算**接线（必须整段精确相等）",
      judgeGateHealth({
        files: ["check-a.mjs"],
        chain: "node scripts/check-a.mjs --self-test-extra && node scripts/check-a.mjs",
        exempt: [E("check-a.mjs")],
      }).violations.length,
      0,
    ],
    // ── 负控：该红的红 ──
    [
      "🔴 负控①：既没接线也不在豁免里 ⇒ 报 not-wired",
      judgeGateHealth({ files: ["check-a.mjs"], chain: "node scripts/check-a.mjs", exempt: [] }).violations[0].kind,
      "not-wired",
    ],
    [
      "🔴 负控②：**把自测那一步从链里删掉** ⇒ 当场红（本门禁存在的全部意义）",
      judgeGateHealth({
        files: ["check-a.mjs"],
        chain: "node scripts/check-a.mjs", // 原本应是 `--self-test && 真跑`
        exempt: [],
      }).violations.some((v) => v.kind === "not-wired"),
      true,
    ],
    [
      "🔴 负控③：子串陷阱——`check-a.mjs.bak` 的存在不得让 `check-a.mjs` 判成已接线",
      judgeGateHealth({
        files: ["check-a.mjs"],
        chain: "node scripts/check-a.mjs.bak --self-test",
        exempt: [E("check-a.mjs")],
      }).violations.length,
      0, // 已在豁免 ⇒ 无违规；关键是它**没被判成 wired**（下一条断言这点）
    ],
    [
      "🔴 负控③b：上一条的 `wired` 名单必须为空（证明没被 `.bak` 误判成接线）",
      judgeGateHealth({
        files: ["check-a.mjs"],
        chain: "node scripts/check-a.mjs.bak --self-test",
        exempt: [E("check-a.mjs")],
      }).wired.length,
      0,
    ],
    [
      "🔴 负控④：已接线却还在豁免里 ⇒ 报 stale-exempt（过期豁免）",
      judgeGateHealth({ files: ["check-a.mjs"], chain: chainOf(["check-a"]), exempt: [E("check-a.mjs")] }).violations[0].kind,
      "stale-exempt",
    ],
    [
      "🔴 负控⑤：豁免条目指向不存在的文件 ⇒ 报 rotten-exempt（账本腐烂）",
      judgeGateHealth({
        files: ["check-a.mjs"],
        chain: chainOf(["check-a"]),
        exempt: [E("check-gone.mjs")],
        exists: (f) => f !== "check-gone.mjs",
      }).violations.some((v) => v.kind === "rotten-exempt"),
      true,
    ],
    [
      "🔴 负控⑥：豁免条目缺理由 ⇒ 报 exempt-no-reason",
      judgeGateHealth({
        files: ["check-a.mjs"],
        chain: "node scripts/check-a.mjs",
        exempt: [{ file: "check-a.mjs", why: "  " }],
      }).violations.some((v) => v.kind === "exempt-no-reason"),
      true,
    ],
    // ── 空转登记表（IDLE）自身：自洽 ＋ 机械核验 ──
    [
      "正控⑤：条目齐备（what/why/status/who）＋ 机械核验通过 ⇒ 零违规",
      judgeIdleRegistry({
        entries: [
          { what: "x", why: "y", status: "已处置", who: "1.28a 已退役", check: { file: "a.ts", mode: "absent", marker: "gone", note: "n" } },
        ],
        readFile: () => "// 这里没有那个 marker",
      }).length,
      0,
    ],
    [
      "正控⑥：**未处置**条目只要点了名「谁在什么时候补」就合规（登记 ≠ 必须马上做）",
      judgeIdleRegistry({ entries: [{ what: "x", why: "y", status: "未处置", who: "归一个新的 SDK 轮" }], readFile: () => "" }).length,
      0,
    ],
    [
      "正控⑦：**真实** IDLE 登记表今天自洽（真读盘核验两条 marker）⇒ 零违规",
      judgeIdleRegistry({ entries: IDLE, readFile: (rel) => readFileSync(resolve(ROOT, rel), "utf8") }).length,
      0,
    ],
    [
      "正控⑧：`mode: present` 且 marker 确实在 ⇒ 零违规（对照组）",
      judgeIdleRegistry({
        entries: [{ what: "x", why: "y", status: "已处置", who: "z", check: { file: "a.ts", mode: "present", marker: "minAppVersion !== undefined", note: "n" } }],
        readFile: () => "  ...(v.minAppVersion !== undefined ? { minAppVersion: v.minAppVersion } : {}),",
      }).length,
      0,
    ],
    [
      "正控⑨：**今天真实仓库**的域 ＋ 链 ＋ 豁免 ⇒ 零 not-wired（门禁自证的基线）",
      judgeGateHealth({
        files: readdirSync(SCRIPTS).filter((f) => f.endsWith(".mjs")),
        chain: JSON.parse(readFileSync(PKG, "utf8")).scripts.check,
        exempt: EXEMPT,
        exists: (f) => existsSync(resolve(SCRIPTS, f)),
      }).violations.length,
      0,
    ],
    [
      "正控⑩：空登记表 ⇒ 零违规（边界：不因「没登记」而红）",
      judgeIdleRegistry({ entries: [], readFile: () => "" }).length,
      0,
    ],
    [
      "正控⑪：空域名册 ⇒ 零违规（边界：没有 check 脚本时不该红）",
      judgeGateHealth({ files: ["README.md"], chain: "", exempt: [] }).violations.length,
      0,
    ],
    [
      "正控⑫：豁免**理由完整**的条目不会因「有理由」而红（对照组）",
      judgeGateHealth({ files: ["check-a.mjs"], chain: "node scripts/check-a.mjs", exempt: [E("check-a.mjs", "环境依赖：怎么在有环境处跑 = npm run demo")] }).violations.length,
      0,
    ],
    // ── 负控（空转登记表）──
    [
      "🔴 负控⑦：条目缺 `who` ⇒ 报 idle-incomplete（⛔ 不许写「以后再补」）",
      judgeIdleRegistry({ entries: [{ what: "x", why: "y", status: "未处置", who: "  " }], readFile: () => "" }).some((v) => v.kind === "idle-incomplete"),
      true,
    ],
    [
      "🔴 负控⑧：status 写了第三种值 ⇒ 报 idle-status",
      judgeIdleRegistry({ entries: [{ what: "x", why: "y", status: "待定", who: "z" }], readFile: () => "" })[0].kind,
      "idle-status",
    ],
    [
      "🔴 负控⑨：说「已退役」但 marker 又出现了（被人加回来）⇒ 报 idle-check-stale",
      judgeIdleRegistry({
        entries: [{ what: "x", why: "y", status: "已处置", who: "z", check: { file: "a.ts", mode: "absent", marker: "classMap", note: "n" } }],
        readFile: () => "const classMap = new Map()",
      })[0].kind,
      "idle-check-stale",
    ],
    [
      "🔴 负控⑩：说「生产端已补」但 marker 没了（被人删掉）⇒ 报 idle-check-lost",
      judgeIdleRegistry({
        entries: [{ what: "x", why: "y", status: "已处置", who: "z", check: { file: "a.ts", mode: "present", marker: "minAppVersion !== undefined", note: "n" } }],
        readFile: () => "// 生产端那段不见了",
      })[0].kind,
      "idle-check-lost",
    ],
    [
      "🔴 负控⑪：机械核验读不到文件 ⇒ 报 idle-check-unreadable（fail-closed，不静默跳过）",
      judgeIdleRegistry({
        entries: [{ what: "x", why: "y", status: "已处置", who: "z", check: { file: "nope.ts", mode: "absent", marker: "m", note: "n" } }],
        readFile: () => {
          throw new Error("ENOENT");
        },
      })[0].kind,
      "idle-check-unreadable",
    ],
  ];

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const pass = got === want;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${JSON.stringify(got)}（期望 ${JSON.stringify(want)}）\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-gate-health self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-gate-health self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

/** A② 真跑一道自测——返回 true = 退出码 0 */
function runSelfTestFor(file) {
  try {
    execFileSync(process.execPath, [resolve(SCRIPTS, file), "--self-test"], {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 120000,
    });
    return { ok: true };
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim().split("\n").slice(-4).join(" / ");
    return { ok: false, detail: out || `退出码 ${err.status ?? "?"}` };
  }
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const files = readdirSync(SCRIPTS).filter((f) => f.endsWith(".mjs"));
  const chain = JSON.parse(readFileSync(PKG, "utf8")).scripts.check;

  const { violations, wired, exempt, domain } = judgeGateHealth({
    files,
    chain,
    exempt: EXEMPT,
    exists: (f) => existsSync(resolve(SCRIPTS, f)),
  });

  // A②：真跑每一道已接线的自测（全部合计约 4 秒）
  const failed = [];
  for (const f of wired) {
    const r = runSelfTestFor(f);
    if (!r.ok) failed.push({ f, detail: r.detail });
  }

  // 空转登记表：自洽检查 ＋ 机械核验（它与「豁免」是两件事——见 IDLE 上方注释）
  const idleViolations = judgeIdleRegistry({
    entries: IDLE,
    readFile: (rel) => readFileSync(resolve(ROOT, rel), "utf8"),
  });
  const problems = [...violations, ...idleViolations];

  if (problems.length === 0 && failed.length === 0) {
    console.log(
      `✅ 门禁健康度：${domain.length} 道 check-*.mjs —— **有自测＋已接线 ${wired.length} 道 ／ 豁免 ${exempt.length} 道**` +
        `（已接线者本脚本逐道真跑过，退出码全 0）；**已知空转登记 ${IDLE.length} 条**（逐条如下，⛔ 不是豁免）。`,
    );
    for (const e of EXEMPT) {
      console.log(`   ⚠️ 豁免（文件级）：${e.file} —— 理由与「怎么在有环境处跑」见本脚本 EXEMPT`);
    }
    for (const e of IDLE) {
      const mark = e.status === "已处置" ? "✅" : "⬜";
      console.log(`   ${mark} [${e.status}] ${e.what}`);
      console.log(`        输入为何为空：${e.why}`);
      console.log(`        谁在什么时候补：${e.who}`);
    }
    return;
  }

  console.error(`❌ 门禁健康度不达标——${problems.length + failed.length} 处问题：\n`);
  for (const v of problems) console.error(`   [${v.kind}] ${v.msg}\n`);
  for (const f of failed) console.error(`   [self-test-failed] ${f.f} 的 --self-test **真跑失败**：${f.detail}\n`);
  console.error(`   域 = scripts/check-*.mjs（${domain.length} 道）—— ⛔ audit-*.mjs / 生成器 / plugin-css-prefix-audit`);
  console.error(`   等**不在域内**（后者是记忆 gate-selftest-must-be-wired 的**判据内例外**：它要 SDK dist，而 dist 是 gitignore 的）。`);
  process.exit(1);
}

main();
