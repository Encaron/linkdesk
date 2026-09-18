#!/usr/bin/env node
/**
 * 只加不删门禁（E6#115）——**面被拿走 = 当场红**。
 *
 * 用法：
 *   node scripts/check-api-surface-additive.mjs              # 门禁（已挂 npm run check）
 *   node scripts/check-api-surface-additive.mjs --json       # 机读输出（人读那套之外多一段 JSON）
 *   node scripts/check-api-surface-additive.mjs --self-test  # 自测（正控 4 ／ 负控 7 ／ 计数 1）
 *   node scripts/check-api-surface-additive.mjs --init       # 建基线：把今天的面写成快照（首次落地专用）
 *
 * ── 判定式（三条硬边界写在脚本头，改之前先读）──
 *   ① **比集合**：面按排序后的集合比（`scripts/lib/api-surface.mjs` 的 `diffSurface`）⇒ 只改顺序、
 *      只改注释**不产生 diff**（否则天天假红）。
 *   ② **只比已发布 tag**：基线 = 上一个 `v*` tag 里那份 `scripts/host-api-surface.json`。
 *      ⛔ **拿不到 tag ⇒ 拒绝判定并红**（离线 / 浅克隆 / 不是 git 仓库）——⛔ 不许静默放行，
 *      ⛔ 不许改成「比工作区」（自己跟自己比 = 永远绿，那正是本门禁要治的病）。
 *      唯一例外 = **本门禁首次落地**：那时 tag 里还没有快照 ⇒ 降级比 HEAD（或工作区）那份，
 *      并**每次打印「基线自本格开始」**（不追认 v0.2.11 及以前的历史）；下一条含快照的 tag 一出，自动改比 tag。
 *   ③ **失败必须给出可执行的下一步**：「改回去」或「走退役登记 E6#116」二选一，⛔ 没有第三条路。
 *
 * ── 只有一条动态逻辑，且只有一条口径（坑单 §二第三步的「二选一」在这里落定）──
 *   🔴 **「有登记即放行」的唯一归属在**本文件**（格 3 `E6#116` 已落地 2026-09-18）**：面被拿走时**查账**——
 *   命中 `scripts/host-reserved.json` 的 `retired[]` 里一条**带用户签名**（`用户 · YYYY-MM-DD`）
 *   且 `kind` 对得上栏目的登记 ⇒ **放行**并逐条打印「已登记的退役」；没命中 ⇒ 照旧判红。
 *   ⛔ **不许两处并存**：格 3 的对账门禁 `check-retired-ledger.mjs` **只管账内部自洽**，它不判「面被拿走」；
 *      判定式与匹配规则在 `scripts/lib/retired-ledger.mjs`（两个文件共用那一份，⛔ 别处不许再写一套）。
 *   ⚠️ 账读不到 ⇒ **按「没有登记」处理**（fail-closed：拿不到放行依据就判红，⛔ 不是静默放行）。
 *   ⚠️ 放行 ≠ 删除：退役名**不腾位**（活口还在原地，见 `retired[].landing`）。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  SNAPSHOT_REL,
  collectApiSurface,
  serializeSurface,
  diffSurface,
  flattenSurface,
  readCommittedSurface,
  COLUMN_LABELS,
} from "./lib/api-surface.mjs";
import { ROOT } from "./lib/host-surface.mjs";
import { exemptionFor, readRegistry } from "./lib/retired-ledger.mjs";

const SELF_TEST = process.argv.includes("--self-test");
const INIT = process.argv.includes("--init");
const JSON_OUT = process.argv.includes("--json");
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

/**
 * 取基线快照——顺序固定，**每一档都说明凭什么**（人读的 `why` 进报告）：
 *   tag → HEAD → 工作区（`--init` 刚写、尚未提交）→ 都没有 ⇒ 拒绝判定并红
 */
export function resolveBaseline({ cwd = ROOT, relPath = SNAPSHOT_REL, git = gitIn, readWorktree = readCommittedSurface } = {}) {
  const tag = git(cwd, ["describe", "--tags", "--abbrev=0", "--match", "v*"]);
  if (tag.code !== 0) {
    throw new NoBaselineError(
      `拿不到任何已发布 tag（\`git describe --tags --abbrev=0 --match "v*\` 退出码 ${tag.code}）`,
      "本门禁**只比已发布 tag**（比工作区 = 自己跟自己比 = 永远绿）。离线 / 浅克隆 / 非 git 仓库都会走到这里：" +
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
      why: `基线自本格（E6#115）开始：tag ${tag.out} 里还没有 ${relPath}（快照自本格起才随版本提交）⇒ 本次比 HEAD 里那份；下一条含快照的 tag 一出，自动改比 tag。`,
    };
  }

  let wt = null;
  if (readWorktree) {
    try {
      wt = readWorktree(relPath);
    } catch {
      wt = null;
    }
  }
  if (wt) {
    return {
      kind: "worktree",
      ref: "工作区（尚未提交）",
      tag: tag.out,
      snapshot: wt,
      why: `基线自本格（E6#115）开始：tag ${tag.out} 与 HEAD 里都没有 ${relPath} ⇒ 本次比工作区那份（--init 刚写出、还没提交）。提交后改比 HEAD，发版后改比 tag。`,
    };
  }

  throw new NoBaselineError(
    `tag ${tag.out} 与 HEAD 里都没有 ${relPath}，工作区也没有`,
    "首次落地 / 漏提交快照。建立基线：`node scripts/check-api-surface-additive.mjs --init`" +
      "（把今天的面写成快照，**基线自此刻开始，之前的历史不追认**），然后同笔提交它。",
  );
}

/** 人读的行：`apiNamespaces.commands.executeCommand` → `命名空间成员（LinkDeskAPI）：commands.executeCommand` */
function humanize(path) {
  const col = path.split(".")[0];
  const label = COLUMN_LABELS[col];
  return label ? `${label} —— ${path.slice(col.length + 1)}` : path;
}

function printRows(list) {
  for (const p of list.slice(0, MAX_ROWS)) console.log(`     · ${p}`);
  if (list.length > MAX_ROWS) console.log(`     · …另有 ${list.length - MAX_ROWS} 处（用 --json 取全量）`);
}

/** 门禁的出口只有三个：0 = 绿（可能有黄灯）、1 = 红、2 = 工具自己出错 */
function run() {
  let current;
  try {
    current = collectApiSurface();
  } catch (err) {
    console.log(`🔴 api-surface-additive：面重算失败 ⇒ **拒绝判定**（不静默放行）：${err.message}`);
    return 2;
  }

  let baseline;
  try {
    baseline = resolveBaseline();
  } catch (err) {
    if (err instanceof NoBaselineError) {
      console.log(`🔴 api-surface-additive：${err.message}`);
      console.log(`   怎么修：${err.how}`);
      return 1;
    }
    throw err;
  }

  const { removed, added } = diffSurface(baseline.snapshot, current);

  // ── 「有登记即放行」——本文件唯一的动态逻辑（见文件头）。账读不到 ⇒ fail-closed（当没登记处理）。──
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
    console.log(`✅ 已登记的退役 ${exempted.length} 处——**放行**（retired[] 里有带用户签名的条目，退役 ≠ 删除）：`);
    for (const e of exempted) console.log(`     · ${e.path}
       ⇒ ${e.how}`);
  }

  console.log(`api-surface-additive：基线 = ${baseline.kind === "tag" ? "上一个已发布 tag" : "降级档"} \`${baseline.ref}\``);
  if (baseline.why) console.log(`   ⚠️ ${baseline.why}`);

  if (blocking.length > 0) {
    console.log(`\n🔴 面被拿走 ${blocking.length} 处（基线 \`${baseline.ref}\`）——插件正在用的面不见了：\n`);
    printRows(blocking);
    console.log(`\n   下一步二选一（⛔ 没有第三条路）：`);
    console.log(`     ① 改回去——平台承诺「旧插件在新版本上仍然能跑」（memory plugin-authoring-manual.md:179-180）`);
    console.log(`     ② 若是有意的退役 ⇒ 走退役登记 E6#116：在 scripts/host-reserved.json 的 retired[] 里登记`);
    console.log(`        （形状见 scripts/lib/retired-ledger.mjs 头注；approvedBy 必须**用户本人**签）`);
    console.log(`        ⇒ 本门禁下次放行；⛔ 不许就地加白名单 / 豁免名单（那正是本条要治的病）`);
    if (JSON_OUT) console.log(JSON.stringify({ baseline: baseline.ref, kind: baseline.kind, removed, added, exempted, blocking }, null, 2));
    return 1;
  }

  if (added.length > 0) {
    console.log(`\n🟡 面变多了 ${added.length} 处——**这是被允许的方向**（只加不删），但快照该跟上：\n`);
    printRows(added);
    console.log(`\n   ⇒ 跑 \`npm run api-surface:regen\` 更新 ${SNAPSHOT_REL} 并同笔提交（⛔ 不更新不判红，但下一条 tag 的基线会落后）。`);
  } else {
    console.log(
      removed.length === 0
        ? `✅ 与基线相比：缺项 0 ／ 新增 0 —— 面一条没少（共 ${flattenSurface(current).length} 条面）。`
        : `✅ 面没少：拿走的 ${removed.length} 处全部有退役登记背过书（上面已逐条打印 ⇒ 放行）；新增 ${added.length} 处。`,
    );
  }
  if (JSON_OUT) console.log(JSON.stringify({ baseline: baseline.ref, kind: baseline.kind, removed, added, exempted, blocking }, null, 2));
  return 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   自测——正控（该红真红）／负控（不该红真不红）／计数
   ══════════════════════════════════════════════════════════════════════════ */

function stub(over = {}) {
  return {
    version: 1,
    generatedFrom: { apiNamespaces: "散文不许算进面（改了它不该判红）" },
    apiNamespaces: { commands: ["executeCommand", "registerCommand"] },
    apiRootMembers: ["getFilePath"],
    poolExposed: { commands: ["executeCommand"] },
    poolRootMembers: ["getFilePath"],
    manifestFields: { "properties.pluginId": [], "properties.type": ["plugin", "theme"] },
    hostClassNames: ["ldk-a", "ldk-b"],
    reservedKeyframes: ["ldk-kf"],
    ledger: { configKeys: ["app.theme"], appearanceIdGrants: { light: ["theme-defaults"] } },
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
    cur.apiNamespaces.commands = ["executeCommand"]; // 拿走 registerCommand
    const d = diffSurface(base, cur);
    push(
      "正控1：拿走一个 API 成员 ⇒ 红，且报点带名字",
      d.removed.length === 1 && d.removed[0] === "apiNamespaces.commands.registerCommand" && d.added.length === 0,
      JSON.stringify(d),
    );
  }
  {
    const base = stub();
    const cur = clone(base);
    cur.hostClassNames = ["ldk-a", "ldk-renamed"]; // 改名 = 一删一加
    const d = diffSurface(base, cur);
    push(
      "正控2：改名（一删一加）⇒ 红（removed 非空就是红）",
      d.removed.length === 1 && d.removed[0] === "hostClassNames.ldk-b" && d.added.length === 1,
      JSON.stringify(d),
    );
  }
  {
    const base = stub();
    const cur = clone(base);
    cur.ledger.appearanceIdGrants.light = []; // 账里拿掉授权条目（嵌套栏也要能报）
    const d = diffSurface(base, cur);
    push(
      "正控3：嵌套账栏拿走一条 ⇒ 红",
      d.removed.length === 1 && d.removed[0] === "ledger.appearanceIdGrants.light.theme-defaults",
      JSON.stringify(d),
    );
  }

  // ── 负控 ──
  {
    const base = stub();
    const cur = clone(base);
    cur.apiNamespaces.commands = [...cur.apiNamespaces.commands, "brandNew"]; // 只加
    const d = diffSurface(base, cur);
    push("负控1：新增一个成员 ⇒不红（removed 空，added 1）", d.removed.length === 0 && d.added.length === 1, JSON.stringify(d));
  }
  {
    const base = stub();
    const cur = clone(base);
    cur.apiNamespaces.commands.reverse(); // 只改顺序
    cur.generatedFrom.apiNamespaces = "改过的散文";
    cur.version = 7; // 账形状修订号抬版
    const d = diffSurface(base, cur);
    push("负控2：只改顺序 / 散文 / version ⇒ 两边都空（集合语义）", d.removed.length === 0 && d.added.length === 0, JSON.stringify(d));
  }
  {
    // 拿不到 tag ⇒ 拒绝判定并红（桩一个没有任何 tag 的仓库）
    const git = () => ({ code: 128, out: "", err: "fatal: No names found" });
    let threw = null;
    try {
      resolveBaseline({ git, readWorktree: () => stub() });
    } catch (e) {
      threw = e;
    }
    push(
      "负控3（离线）：拿不到 tag ⇒ 抛「拒绝判定」（不是放行、也不是比工作区）",
      threw instanceof NoBaselineError && /fetch --tags/.test(threw.how),
      threw ? threw.message : "没有抛",
    );
  }
  {
    // 首次落地档：tag 里没有快照，但工作区有 ⇒ 不红，且必须带「基线自本格开始」
    const git = (_cwd, args) => {
      if (args[0] === "describe") return { code: 0, out: "v0.2.11", err: "" };
      return { code: 128, out: "", err: "fatal: path does not exist" };
    };
    const b = resolveBaseline({ git, readWorktree: () => stub() });
    push(
      "负控4（首次落地）：tag 无快照 ⇒ 降级到工作区档且不判红，why 里写明「基线自本格开始」",
      b.kind === "worktree" && /基线自本格（E6#115）开始/.test(b.why),
      `${b.kind} / ${b.why}`,
    );
  }
  {
    // tag 里有快照 ⇒ 主路径：直接比 tag
    const git = (_cwd, args) => {
      if (args[0] === "describe") return { code: 0, out: "v0.9.9", err: "" };
      return { code: 0, out: JSON.stringify(stub()), err: "" };
    };
    const b = resolveBaseline({ git });
    push("负控5（主路径）：tag 里有快照 ⇒ kind=tag（不作任何降级）", b.kind === "tag" && b.ref === "v0.9.9" && !b.why, `${b.kind} / ${b.ref}`);
  }

  // ── 放行（E6#116「有登记即放行」——本文件唯一的动态逻辑，见文件头）──
  {
    const reg = [{ name: "registerCommand", kind: "apiMember", approvedBy: "用户 · 2026-09-18" }];
    const hit = exemptionFor("apiNamespaces.commands.registerCommand", reg);
    push(
      "正控4（有登记即放行）：kind 对栏 ＋ 名字命中 ＋ 用户签名 ⇒ 放行",
      Boolean(hit && /registerCommand/.test(hit.how)),
      JSON.stringify(hit),
    );
  }
  {
    const reg = [{ name: "registerCommand", kind: "apiMember", approvedBy: "AI · 2026-09-18" }];
    push(
      "负控6：签名不是用户本人（AI 自己签）⇒ **不放行**",
      exemptionFor("apiNamespaces.commands.registerCommand", reg) === null,
    );
  }
  {
    const reg = [{ name: "registerCommand", kind: "configKey", approvedBy: "用户 · 2026-09-18" }];
    push(
      "负控7：kind 栏目对不上（拿配置键登记去放行 API 成员）⇒ 不放行",
      exemptionFor("apiNamespaces.commands.registerCommand", reg) === null,
    );
  }

  // ── 计数 ──
  {
    const paths = flattenSurface(stub());
    push(
      "计数：桩快照拍平成 13 条面（version / generatedFrom 不算面；空枚举的字段本身算 1 条）",
      paths.length === 13 && !paths.some((p) => p.startsWith("generatedFrom") || p.startsWith("version")),
      `${paths.length}：${paths.join(" | ")}`,
    );
  }

  const bad = cases.filter((c) => !c.ok);
  for (const c of cases) console.log(`${c.ok ? "✅" : "🔴"} ${c.name}${c.ok ? "" : `\n     ↳ ${c.detail}`}`);
  console.log(
    bad.length === 0
      ? `\n✅ check-api-surface-additive self-test 全过（${cases.length} 例：正控 4 ／ 负控 7 ／ 计数 1）——门禁不是在恒绿。`
      : `\n🔴 check-api-surface-additive self-test ${bad.length} 例不符（共 ${cases.length} 例）。`,
  );
  return bad.length === 0 ? 0 : 1;
}

/* ══════════════════════════════════════════════════════════════════════════
   --init：建基线（首次落地专用）
   ══════════════════════════════════════════════════════════════════════════ */

function init() {
  const out = resolve(ROOT, SNAPSHOT_REL);
  let current;
  try {
    current = collectApiSurface();
  } catch (err) {
    console.log(`🔴 面重算失败，基线没建成：${err.message}`);
    return 2;
  }
  const existed = existsSync(out);
  const before = existed ? readFileSync(out, "utf8") : "";
  writeFileSync(out, serializeSurface(current));
  console.log(`✅ 已建立基线 ${SNAPSHOT_REL}（${flattenSurface(current).length} 条面）${existed ? "（覆盖了原文件）" : "（新建）"}`);
  console.log(`   🔴 **基线自 E6#115 开始，之前的历史不追认**——v0.2.11 及以前的版本没有快照，`);
  console.log(`      所以本门禁对「历史上被拿走过什么」一个字都不说（那是本层残余边界，档里写明）。`);
  console.log(`   ⇒ 同笔提交它（\`git add ${SNAPSHOT_REL}\`），之后 tag 里带上它，门禁就从下一个 tag 起比 tag。`);
  if (before && before !== serializeSurface(current)) console.log("   ⚠️ 覆盖前的旧内容与今天不同——升级快照前请 `git diff` 一眼。");
  return 0;
}

if (SELF_TEST) process.exit(selfTest());
if (INIT) process.exit(init());
process.exit(run());
