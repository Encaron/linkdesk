/**
 * deepEqual——JSON 可序列化值的深比较。
 *
 * E5.8 bug 修复：ConfigurationService.diffUserSettings 曾用浅比较 `===` 判 settings.json 变更。
 * 对象/数组值每次 JSON 重新解析引用不同 → 同内容恒判"变更" → apply + 回写无限循环（800MB 冻结）。
 * 修复：改走本工具深比较——同内容零变更，循环终结。
 *
 * 语义：
 *   - 对象键序无关（{a:1,b:2} === {b:2,a:1}）——比 JSON.stringify 捷径正确（键序不该影响相等）
 *   - 数组顺序敏感（逐位比较）
 *   - NaN === NaN（Object.is）
 *   - 纯函数、无状态——放 core/utils/（壳目录规范：纯函数工具归 utils/）
 */

/** 深比较两个 JSON 可序列化值——settings/profile 配置值比较统一走此函数 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;

  if (aIsArray) {
    const arrA = a as unknown[];
    const arrB = b as unknown[];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      if (!deepEqual(arrA[i], arrB[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  for (const key of keysA) {
    if (!(key in objB)) return false;
    if (!deepEqual(objA[key], objB[key])) return false;
  }
  return true;
}
