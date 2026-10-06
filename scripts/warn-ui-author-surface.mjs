#!/usr/bin/env node
/**
 * 「这一笔动了 @linkdesk/ui 的作者面」——**出声不拦**（pre-commit 钩子；退出码恒 0）。
 *
 * 为什么要有它（2026-10-07 实例）：把案子从 `待抉择池/` 搬到 `已落地/` 时，顺手改了共享件
 *   `src/components/shared/segment-preview/SegmentPreview.css` 里**一条注释里的路径**（那笔改动完全正当）
 *   ⇒ 壳树里的 ui 作者面与 npm 发布基线对不上 ⇒ 推 tag 时发布判据⑤红（E6#166：ui 漂移就该随本版发，
 *   ⛔ 不许 `--allow-drift` 盖账）⇒ 用户体感就是「发个版怎么又炸了，还是因为一个文档」。
 *   坏的不是那次改动，是**没人知道自己在动发布面**——发现时机被拖到发版那一刻、代价是一整轮 CI。
 *   本脚本把发现时机拉回**提交那一刻**：只出声、不拦（改了共享件而这次不发 npm 是常态）。
 *   ⇒ 真正**拦住**的地方是推之前的发版预演：`scripts/pre-push-release-rehearsal.mjs`。
 *
 * 判据只有一条：暂存集与 `scripts/lib/npm-author-surface.mjs` 的 `UI_SURFACE` 有没有交集。
 *   ⛔ 不在这里另写一份名单——那是第二份真值：新增共享组件时只改一边 = 静默漏报。
 *
 * 用法：
 *   node scripts/warn-ui-author-surface.mjs              # 钩子里：自己问 git 要暂存集
 *   node scripts/warn-ui-author-surface.mjs a.ts b.css   # 手动：直接给文件列表（相对 repo 根）
 * 退出码恒 0（这是黄灯，不是闸）。
 */
import { execFileSync } from "node:child_process";
import { expandSurface, UI_SURFACE } from "./lib/npm-author-surface.mjs";

const normalize = (p) => p.split("\\").join("/").replace(/^\.\//, "");

function stagedFiles() {
  try {
    return execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean)
      .map(normalize);
  } catch {
    return []; // 不在 git 里 / git 不可用 ⇒ 静默放行（黄灯不值得阻断任何事）
  }
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const candidates = args.length > 0 ? args.map(normalize) : stagedFiles();
const surface = new Set(expandSurface(UI_SURFACE));
const hits = candidates.filter((f) => surface.has(f));

if (hits.length > 0) {
  const list = hits.slice(0, 8);
  process.stdout.write(
    `\n🔔 这一笔动了 @linkdesk/ui 的作者面（${hits.length} 个文件）：\n` +
      list.map((f) => `     ${f}\n`).join("") +
      (hits.length > list.length ? `     …… 共 ${hits.length} 个\n` : "") +
      `   ⇒ 壳树里的 ui 内容与 npm 货架就不一致了。**不发 npm 就继续走没关系**（本提示不拦），\n` +
      `      但发壳版时会撞发布判据⑤（E6#166 对货不对号：漂移必须随本版 bump+publish+mark，⛔ 不许 --allow-drift）。\n` +
      `      届时收尾：改 packages/linkdesk-ui/package.json 版本 → 发布 → \`npm run release:mark\`。\n`
  );
}
process.exit(0);
