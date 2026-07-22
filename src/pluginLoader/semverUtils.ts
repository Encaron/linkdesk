/**
 * semver 工具——归一化 loader.ts 和 viewRegistry.ts 的版本比较。
 *
 * 🔥 B4 fix：原 loader.ts 有 versionGte、viewRegistry.ts 有 compareVersions——两份相同算法。
 * 改一处漏一处 = V2.6 种子。归一化到此文件，versionGte 内部调 compareVersions。
 *
 * 当前只支持 X.Y.Z 格式（不含 pre-release tag）。pre-release 支持在 Phase 6 追加。
 */

/** 比较两个 semver 版本。返回 >0 如果 a>b，<0 如果 a<b，0 如果相等。 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

/** a >= b ? */
export function versionGte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}
