/**
 * 壳根 `CHANGELOG.md` 的**切段规则——判据只此一处**（E6#57.15e 立，2026-09-13）。
 *
 * 为什么要有这个文件：同一条规则被**两个门禁各用一次**——
 *   - `scripts/check-publish-gate.mjs`（E6#57.15d③）：**发布那一下**验「段在且非空」，另供
 *     `--changelog-body` / `--changelog-date` 两个纯输出模式给 CI 取值；
 *   - `scripts/check-changelog-section.mjs`（E6#57.15e）：**每次 `npm run check`** 验同一件事
 *     （规矩 3.7.3：bump 了版本号就必须同笔写 `## v<新版本>` 段）。
 * 两处各写一份必然漂移（改一处忘一处 ⇒ 一边认一边不认 ⇒ 假红假绿都出现），故抽到这里。
 * 这与 `scripts/lib/text-eol.mjs` 是同一条纪律，也是 `check-scaffold.mjs` 闸 3 写的那个例外：
 * **「解析规则」是别人的实现，从源码现场抽，绝不手抄第二份。**
 *
 * 🔴 **不要和 SDK 的 `CHANGELOG_HEADING` 合并**（`packages/plugin-sdk/src/publish.ts`）——
 * 那是**第三方作者**的 CHANGELOG 解析器，故意宽容（容忍 `[]`、大小写 `v`、预发布后缀，还会跳过
 * 围栏代码块）。本文件解析的是**我们自己的**根 CHANGELOG，格式是**严格契约**
 * （`## v{version}（{date}）`，段头格式由 02 §2.6 定、#57.15d③ 按版本号查段）。
 * 把两者合成一份，只会让一边变松或另一边变紧——**两种消费者，两条规则，两个文件。**
 */

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 取 CHANGELOG 里 `## v{version}` 那一段的正文（到下一个 `## ` 为止），去掉段头后的前导空行。
 * 找不到该段 → null（调用方判红，**不静默当空**）。段在但正文为空 → 返回 ""（同样判红——空段
 * 在用户眼里和缺段一样：发行说明页一片空白）。
 *
 * ⚠️ 结尾那个 `([^0-9.]|$)` 是防前缀误匹配的（v0.1.4 不该匹配到 v0.1.47 那一段）。
 *    版本里的 `.` 这里按**字面**转义（比原先 CI 里的 awk 更严——awk 的 `.` 是通配符）。
 */
export function changelogSection(text, version) {
  const lines = text.split(/\r?\n/);
  const head = new RegExp(`^## v${escapeRe(version)}([^0-9.]|$)`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    body.push(lines[i]);
  }
  // 去前导空行（对标 CI 里那句 sed '/./,$!d'）
  while (body.length > 0 && body[0].trim() === "") body.shift();
  return body.join("\n");
}

/** 取段头 `## v{version}（{date}）` 里的日期。格式不对/没写 → ""（调用方回落构建日，不拦发布）。 */
export function changelogDate(text, version) {
  const head = new RegExp(`^## v${escapeRe(version)}（`);
  const line = text.split(/\r?\n/).find((l) => head.test(l));
  if (!line) return "";
  const m = /（([^）]*)）/.exec(line);
  return m ? m[1] : "";
}
