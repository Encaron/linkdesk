/**
 * semver — 版本比较原语（本地纯实现，不 import src/core——插件独立铁律）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 *
 * 🔴 与壳 `semverUtils` **同语义**（忽略 v 前缀 / 缺位补 0 / 预发布逐位）——双实现分处两进程域，
 * 改这里务必同步壳侧（E6 清单里两条判据必须永远同答案）。
 */

function parseNum(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

function compareNumeric(a: string, b: string): number {
  const A = a.split(".").map(parseNum);
  const B = b.split(".").map(parseNum);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** semver 比较——返回 -1/0/1。主版本号相等才比预发布；有预发布 < 无预发布 */
export function compareVersions(a: string, b: string): number {
  const va = a.trim().replace(/^[vV]/, "");
  const vb = b.trim().replace(/^[vV]/, "");
  const pa = va.includes("-") ? va.split("-") : null;
  const pb = vb.includes("-") ? vb.split("-") : null;
  const core = compareNumeric(pa ? pa[0] : va, pb ? pb[0] : vb);
  if (core !== 0) return core;
  const ha = pa ? pa[1] ?? "" : "";
  const hb = pb ? pb[1] ?? "" : "";
  if (ha === hb) return 0;
  if (!ha) return 1; // a 正式 > b 预发布
  if (!hb) return -1;
  return ha < hb ? -1 : 1;
}

/** 版本比较辅助：a > b？ */
export function isVersionNewer(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

/* ═══ E6#33a 稳定版判定（05 §二·四——发现/自动更新默认只看稳定版，beta 不提示） ═══ */

/** 是否 prerelease（含 "-" 预发布标识；build metadata "+" 截断后判） */
export function isPrereleaseVersion(v: string): boolean {
  return v.trim().replace(/^[vV]/, "").split("+")[0].includes("-");
}
