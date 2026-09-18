#!/usr/bin/env node
/**
 * `@linkdesk/ui` 导出面只加不删门禁（E6#121）——**面被拿走 = 当场红**。
 *
 * 用法：
 *   node scripts/check-ui-surface-additive.mjs              # 门禁（已挂 npm run check）
 *   node scripts/check-ui-surface-additive.mjs --self-test  # 自测（正控 3 ／ 负控 5）
 *   node scripts/check-ui-surface-additive.mjs --init       # 建基线（首次落地专用；写侧 gen 亦可）
 *
 * ── 判定式（三条硬边界，改之前先读）──
 *   ① **比集合**：面按排序后的集合比（`scripts/lib/ui-surface.mjs` 的 `diffUiSurface`）⇒
 *      只改顺序、只改 barrel 注释**不产生 diff**。快照形状烂 ⇒ fail-closed（拒绝判定并红）。
 *   ② **基线降级链 = tag → HEAD → 工作区**（照 `check-api-surface-additive.mjs` 同一形状）：
 *      上一个 `v*` tag 里没有快照就比 HEAD，HEAD 也没有才比工作区，每一档都打印「基线自本格开始」；
 *      三处都没有 ⇒ 拒绝判定并红（⛔ 不静默放行——比空 = 永远绿，那正是本门禁要治的病）。
 *   ③ **失败必须给出可执行的下一步**：「改回去」或「走退役登记 + 钉线窗口」二选一，⛔ 没有第三条路。
 *
 * ── 「有登记即放行」的唯一归属不在本文件 ──
 *   匹配规则 = `scripts/lib/retired-ledger.mjs` 的 `exemptionFor`（格 2/格 3 共用那份，⛔ 不另写一套）；
 *   本面的栏 = `kind: "uiExport"`（E6#121 加档：components/hooks/helpers/types 四栏）。
 *   ⚠️ 退役 `@linkdesk/ui` 导出名与壳面退役多一层纪律：运行时单实例后旧插件还在 `import` 它——
 *   除登记外须有**钉线窗口**承接（import-map 双 URL，设计位见 00-整理档案 §六4，本批不实现）。
 *   账读不到 ⇒ 按「没有登记」处理（fail-closed）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROOT,
  SNAPSHOT_REL,
  collectUiSurface,
  diffUiSurface,
  flattenUiSurface,
  isUiSurfaceShape,
  serializeSurface,
} from "./lib/ui-surface.mjs";
import { exemptionFor, readRegistry } from "./lib/retired-ledger.mjs";

const SELF_TEST = process.argv.includes("--self-test");
const INIT = process.argv.includes("--init");
const MAX_ROWS = 20;

export class NoBaselineError extends Error {
  constructor(message, how) {
    super(message);
    this.how = how;
  }
}

/** 跑一条 git（可注入——自测拿桩仓库替换） */
export function gitIn(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

/** 基线降级链 tag → HEAD → 工作区（每一档说明凭什么；全空 ⇒ 拒绝判定并红） */
export function resolveBaseline({ cwd = ROOT, relPath = SNAPSHOT_REL, git = gitIn, readWorktree } = {}) {
  const tag = git(cwd, ["describe", "--tags", "--abbrev=0", "--match", "v*"]);
  if (tag.code !== 0) {
    throw new NoBaselineError(
      `拿不到任何已发布 tag（\`git describe --tags --abbrev=0 --match "v*"\` 退出码 ${tag.code}）`,
      "本门禁比已发布 tag / HEAD（比工作区当基线 = 快照刚写还没提交时才有意义）。" +
        "恢复办法 = `git fetch --tags`（⛔ 不是「跳过这道门禁」）。",
    );
  }
  const fromTag = git(cwd, ["show", `${tag.out}:${relPath}`]);
  if (fromTag.code === 0) return { kind: "tag", ref: tag.out, snapshot: JSON.parse(fromTag.out) };

  const head = git(cwd, ["show", `HEAD:${relPath}`]);
  if (head.code === 0) {
    return {
      kind: "head",
      ref: "HEAD",
      tag: tag.out,
      snapshot: JSON.parse(head.out),
      why: `基线自本格（E6#121）开始：tag ${tag.out} 里还没有 ${relPath}（快照自本格起才随版本提交）⇒ 本次比 HEAD 里那份；下一条含快照的 tag 一出，自动改比 tag。`,
    };
  }

  if (readWorktree) {
    try {
      const wt = readWorktree(relPath);
      if (wt) {
        return {
          kind: "worktree",
          ref: "工作区（尚未提交）",
          tag: tag.out,
          snapshot: wt,
          why: `基线自本格（E6#121）开始：tag ${tag.out} 与 HEAD 里都没有 ${relPath} ⇒ 本次比工作区那份（--init 刚写出、还没提交）。提交后改比 HEAD，发版后改比 tag。`,
        };
      }
    } catch {
      /* 落到下面的拒绝判定 */
    }
  }

  throw new NoBaselineError(
    `tag ${tag.out} 与 HEAD 里都没有 ${relPath}，工作区也没有`,
    `首次落地 / 漏提交快照。建立基线：\`node scripts/gen-ui-surface.mjs\`（或 --init）把今天的面写成快照，` +
      "**基线自此刻开始，之前的历史不追认**，然后同笔提交它。",
  );
}

function printRows(list) {
  for (const p of list.slice(0, MAX_ROWS)) console.log(`     · ${p}`);
  if (list.length > MAX_ROWS) console.log(`     · …另有 ${list.length - MAX_ROWS} 处（数一下 diff 就有全量）`);
}

/** 门禁的出口只有三个：0 = 绿（可能有黄灯）、1 = 红、2 = 工具自己出错 */
function run() {
  let current;
  try {
    current = collectUiSurface(ROOT);
  } catch (err) {
    console.log(`🔴 ui-surface-additive：面重算失败 ⇒ **拒绝判定**（不静默放行）：${err.message}`);
    return 2;
  }

  let baseline;
  try {
    baseline = resolveBaseline({ readWorktree: (rel) => {
      const p = resolve(ROOT, rel);
      return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
    } });
  } catch (err) {
    if (err instanceof NoBaselineError) {
      console.log(`🔴 ui-surface-additive：${err.message}`);
      console.log(`   怎么修：${err.how}`);
      return 1;
    }
    throw err;
  }
  if (!isUiSurfaceShape(baseline.snapshot)) {
    console.log(`🔴 ui-surface-additive：基线快照（${baseline.ref}）形状烂（缺栏 / 非数组）⇒ **拒绝判定**（不静默放行）。`);
    return 2;
  }

  const { removed, added } = diffUiSurface(baseline.snapshot, current);

  // ── 「有登记即放行」——匹配规则在 lib/retired-ledger.mjs（共用一份）。账读不到 ⇒ fail-closed。──
  let registry = [];
  try {
    registry = readRegistry();
  } catch (err) {
    console.log(`⚠️ 退役登记表读不到（${err.message}）⇒ 本次**按「没有登记」处理**（fail-closed，⛔ 不静默放行）。`);
  }
  const exempted = [];
  const blocking = [];
  for (const p of removed) {
    const hit = exemptionFor(p, registry);
    if (hit) exempted.push({ path: p, how: hit.how });
    else blocking.push(p);
  }
  if (exempted.length > 0) {
    console.log(`✅ 已登记的退役 ${exempted.length} 处——**放行**（retired[] 里有带用户签名的 uiExport 条目，退役 ≠ 删除）：`);
    for (const e of exempted) console.log(`     · ${e.path}\n       ⇒ ${e.how}`);
  }

  console.log(`ui-surface-additive：基线 = ${baseline.kind === "tag" ? "上一个已发布 tag" : "降级档"} \`${baseline.ref}\``);
  if (baseline.why) console.log(`   ⚠️ ${baseline.why}`);

  if (blocking.length > 0) {
    console.log(`\n🔴 @linkdesk/ui 导出面被拿走 ${blocking.length} 处（基线 \`${baseline.ref}\`）——插件正在用的组件 / 类型不见了：\n`);
    printRows(blocking);
    console.log(`\n   下一步二选一（⛔ 没有第三条路）：`);
    console.log(`     ① 改回去——vendor 单实例后插件运行时只有壳那一版，每个导出名是终身承诺（00-整理档案 §六3 行为铁律）`);
    console.log(`     ② 若是有意的退役 ⇒ 走退役登记：scripts/host-reserved.json 的 retired[] 里登记 kind \`uiExport\``);
    console.log(`        （形状见 scripts/lib/retired-ledger.mjs 头注；approvedBy 必须**用户本人**签），`);
    console.log(`        且须安排**钉线窗口**承接旧插件（import-map 双 URL，设计位 = 00-整理档案 §六4）⇒ 本门禁下次放行`);
    console.log(`        ⛔ 不许就地加白名单 / 豁免名单（那正是本条要治的病）`);
    return 1;
  }

  if (added.length > 0) {
    console.log(`\n🟡 导出面变多了 ${added.length} 处——**这是被允许的方向**（只加不删），但快照该跟上：\n`);
    printRows(added);
    console.log(`\n   ⇒ 跑 \`npm run ui-surface:regen\` 更新 ${SNAPSHOT_REL}（含 barrel 头注释计数对账）并同笔提交（⛔ 不更新不判红，但下一条 tag 的基线会落后）。`);
  } else {
    console.log(`✅ 与基线相比：缺项 0 ／ 新增 0 —— 导出面一条没少（共 ${flattenUiSurface(current).length} 条面）。`);
  }
  return 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   自测——正控（该红真红）／负控（不该红真不红）。判定纯函数（diffUiSurface）＋
   基线降级（resolveBaseline 桩 git）都真跑——门禁不是在恒绿。
   ══════════════════════════════════════════════════════════════════════════ */

function stub(over = {}) {
  return {
    components: ["Button", "SelectBox", "HintCard"],
    hooks: ["useClickPreview"],
    helpers: ["inferSliderStep"],
    types: ["ContextMenuProps"],
    ...over,
  };
}

function selfTest() {
  const cases = [];
  const push = (name, ok, detail) => cases.push({ name, ok, detail });
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ── 正控 ──
  {
    const base = stub();
    const cur = clone(base);
    cur.components = ["Button", "HintCard"]; // 拿走 SelectBox
    const d = diffUiSurface(base, cur);
    push("正控1：拿走一个组件 ⇒ removed 非空（门禁判红的输入）", d.removed.length === 1 && d.removed[0] === "components.SelectBox" && d.added.length === 0, JSON.stringify(d));
  }
  {
    const base = stub();
    const cur = clone(base);
    cur.components = ["Button", "HintCard", "Picker"]; // 改名 = 一删一加
    const d = diffUiSurface(base, cur);
    push("正控2：改名（一删一加）⇒ 红（removed 非空就是红，⛔ 不是「净变化 0」）", d.removed.length === 1 && d.added.length === 1 && d.removed[0] === "components.SelectBox", JSON.stringify(d));
  }
  {
    const base = stub();
    const cur = clone(base);
    cur.types = []; // 类型面也只加不删
    const d = diffUiSurface(base, cur);
    push("正控3：类型面拿走一条 ⇒ 红", d.removed.length === 1 && d.removed[0] === "types.ContextMenuProps", JSON.stringify(d));
  }

  // ── 负控 ──
  {
    const base = stub();
    const cur = clone(base);
    cur.components = [...cur.components, "BrandNew"];
    const d = diffUiSurface(base, cur);
    push("负控1：新增一个组件 ⇒ 不红（removed 空，added 1）", d.removed.length === 0 && d.added.length === 1, JSON.stringify(d));
  }
  {
    const base = stub();
    const cur = clone(base);
    cur.components.reverse(); // 只改顺序
    const d = diffUiSurface(base, cur);
    push("负控2：只改顺序 ⇒ 两边都空（集合语义）", d.removed.length === 0 && d.added.length === 0, JSON.stringify(d));
  }
  {
    push("负控3：烂快照（缺栏）⇒ isUiSurfaceShape 拒收（fail-closed）", isUiSurfaceShape({ components: [] }) === false && isUiSurfaceShape(null) === false);
  }
  {
    const git = () => ({ code: 128, out: "", err: "fatal: No names found" });
    let threw = null;
    try {
      resolveBaseline({ git });
    } catch (e) {
      threw = e;
    }
    push("负控4（离线）：拿不到 tag ⇒ 抛「拒绝判定」（不是放行）", threw instanceof NoBaselineError && /fetch --tags/.test(threw.how), threw ? threw.message : "没有抛");
  }
  {
    // tag 与 HEAD 都没有快照 ⇒ 禁用工作区档时拒绝判定（首落档须显式给 readWorktree）
    const git = (_cwd, args) => {
      if (args[0] === "describe") return { code: 0, out: "v0.2.12", err: "" };
      return { code: 128, out: "", err: "fatal: path does not exist" };
    };
    let threw = null;
    try {
      resolveBaseline({ git });
    } catch (e) {
      threw = e;
    }
    push("负控5（首落前）：tag/HEAD 无快照且不给工作区 ⇒ 拒绝判定并指路 gen", threw instanceof NoBaselineError && /gen-ui-surface/.test(threw.how), threw ? threw.message : "没有抛");
    const b = resolveBaseline({ git, readWorktree: () => stub() });
    push("负控6（首落档）：给工作区 ⇒ 降级工作区档且 why 写明「基线自本格开始」", b.kind === "worktree" && /基线自本格（E6#121）开始/.test(b.why), `${b.kind} / ${b.why}`);
  }
  {
    const git = (_cwd, args) => {
      if (args[0] === "describe") return { code: 0, out: "v0.9.9", err: "" };
      return { code: 0, out: JSON.stringify(stub()), err: "" };
    };
    const b = resolveBaseline({ git });
    push("负控7（主路径）：tag 里有快照 ⇒ kind=tag（不作任何降级）", b.kind === "tag" && b.ref === "v0.9.9" && !b.why, `${b.kind} / ${b.ref}`);
  }

  const bad = cases.filter((c) => !c.ok);
  for (const c of cases) console.log(`${c.ok ? "✅" : "🔴"} ${c.name}${c.ok ? "" : `\n     ↳ ${c.detail}`}`);
  console.log(
    bad.length === 0
      ? `\n✅ check-ui-surface-additive self-test 全过（${cases.length} 例：正控 3 ／ 负控 8）——门禁不是在恒绿。`
      : `\n🔴 check-ui-surface-additive self-test ${bad.length} 例不符（共 ${cases.length} 例）。`,
  );
  return bad.length === 0 ? 0 : 1;
}

/* ══════════════════════════════════════════════════════════════════════════
   --init：建基线（首次落地专用）
   ══════════════════════════════════════════════════════════════════════════ */

function init() {
  let current;
  try {
    current = collectUiSurface(ROOT);
  } catch (err) {
    console.log(`🔴 面重算失败，基线没建成：${err.message}`);
    return 2;
  }
  const out = resolve(ROOT, SNAPSHOT_REL);
  const existed = existsSync(out);
  writeFileSync(out, serializeSurface(current));
  console.log(`✅ 已建立基线 ${SNAPSHOT_REL}（${flattenUiSurface(current).length} 条面）${existed ? "（覆盖了原文件）" : "（新建）"}`);
  console.log(`   🔴 **基线自 E6#121 开始，之前的历史不追认**。`);
  console.log(`   ⇒ 同笔提交它（\`git add ${SNAPSHOT_REL}\`），之后 tag 里带上它，门禁就从下一条 tag 起比 tag。`);
  return 0;
}

if (SELF_TEST) process.exit(selfTest());
if (INIT) process.exit(init());
process.exit(run());
