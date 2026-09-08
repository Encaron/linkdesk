/**
 * semver 工具——归一化 loader.ts 和 viewRegistry.ts 的版本比较。
 *
 * 🔥 B4 fix：原 loader.ts 有 versionGte、viewRegistry.ts 有 compareVersions——两份相同算法。
 * 改一处漏一处 = V2.6 种子。归一化到此文件，versionGte 内部调 compareVersions。
 *
 * E6#57.1c：壳共享版本比较唯一权威（02 §2.5 零依赖算法）——补 semver 2.0 全规则：
 *   - 忽略 v/V 前缀（v1.2.3 == 1.2.3；两位数主版本不再被 parseInt NaN 吞掉成 0）
 *   - 缺位补 0（0.2 == 0.2.0）
 *   - 预发布按 semver 预发布规则（release > prerelease；数字标识符 < 字母标识符；
 *     数字按数值比；字母按 ASCII 字典序；前缀相同字段少者小）
 * 按 E6#54 共享分发机制暴露给 electron 主进程（单一实现防双份，与 contracts 纯类型包区分）——
 * 更新比对（E6#57.5）+ 市场 minAppVersion（E6#30.8c）双消费方共用。
 */

interface ParsedSemver {
  /** 数字核心段（3+ 段宽容输入，缺位由比较侧补 0） */
  core: number[];
  /** 预发布标识符数组；无预发布 = null */
  prerelease: string[] | null;
}

function parseSemver(v: string): ParsedSemver {
  let s = v.trim().replace(/^[vV]/, ''); // 忽略 v/V 前缀
  const dash = s.indexOf('-');
  const corePart = dash === -1 ? s : s.slice(0, dash);
  const prePart = dash === -1 ? null : s.slice(dash + 1);
  const core = corePart.split('.').map((seg) => {
    const n = Number(seg);
    // 非数字核心段兜底为 0（宽容输入）——避免 NaN 永不相等的怪相（旧实现 parseInt NaN 即此坑）
    return Number.isFinite(n) ? n : 0;
  });
  const prerelease = prePart === null || prePart === '' ? null : prePart.split('.');
  return { core, prerelease };
}

/** 预发布标识符逐位比较（仅在核心段全等时调用） */
function comparePrerelease(a: string[], b: string[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (i >= a.length) return -1; // 前缀相同、字段少者小：1.0.0-alpha < 1.0.0-alpha.1
    if (i >= b.length) return 1;
    const ia = a[i];
    const ib = b[i];
    const na = /^\d+$/.test(ia);
    const nb = /^\d+$/.test(ib);
    if (na && nb) {
      const va = Number(ia);
      const vb = Number(ib);
      if (va !== vb) return va > vb ? 1 : -1;
    } else if (na !== nb) {
      return na ? -1 : 1; // 数字标识符 < 字母标识符（semver 11.4.2）
    } else if (ia !== ib) {
      return ia > ib ? 1 : -1; // 字母标识符按 ASCII 字典序（semver 11.4.3）
    }
  }
  return 0;
}

/** 比较两个 semver 版本。返回 >0 如果 a>b，<0 如果 a<b，0 如果相等。 */
export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  // 数字核心段比较（缺位补 0）——含超出 3 段的宽容输入（尾段照比，v0.1.2.3 > v0.1.2）
  const len = Math.max(pa.core.length, pb.core.length);
  for (let i = 0; i < len; i++) {
    const na = pa.core[i] ?? 0;
    const nb = pb.core[i] ?? 0;
    if (na !== nb) return na > nb ? 1 : -1;
  }
  // 核心段全等 → 预发布决定（semver 11.3/11.4.1：release > 带 prerelease 版本）
  if (pa.prerelease === null && pb.prerelease === null) return 0;
  if (pa.prerelease === null) return 1;
  if (pb.prerelease === null) return -1;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** a >= b ? */
export function versionGte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}

/**
 * 更新目标版本方向判定（E6#33c 降级放行 锚① 语义单复本）——候选包内版本 vs 当前已装。
 * 返回 "upgrade"（目标更高 → 更新语义默认放行）/ "downgrade"（目标更低 → 默认拒，仅 allowOlder 显式放行）/
 * "same"（恒拒——无版本变化的重装非更新流职责）。调用方（stage-update handler）据此决定拒/放 + 报错文案。
 */
export function updateTargetDirection(packVersion: string, cur: string): "upgrade" | "downgrade" | "same" {
  const cmp = compareVersions(packVersion, cur);
  return cmp > 0 ? "upgrade" : cmp < 0 ? "downgrade" : "same";
}
