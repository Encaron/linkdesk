/**
 * SettingsView 分节分组层——E5.8#78 组内二级标题。
 * 纯函数零依赖：把 key 列表按 prop.group 归到分节桶（保持首次出现顺序）。
 * 无 group 的 key 归 "" 桶 = 平铺原样（第三方配置零侵入）。
 * 依赖方向：无（被 SettingsView 渲染消费 / grouping.test 单测）。
 */

/** 分组结果——group 标题（"" = 无 group，平铺）+ 该组 key 列表 */
export interface SettingsGroupBucket {
  group: string;
  keys: string[];
}

/**
 * 按 group 归桶——保持 key 首次出现顺序，同 group 的非连续 key 合并进同一桶。
 * getGroup(key) 返回该 key 的分节标题（无 group 返回 ""）。
 * 空输入 → 空数组；任何 key 都有归属桶（不会丢 key）。
 */
export function groupSettingsKeys(
  keys: string[],
  getGroup: (key: string) => string
): SettingsGroupBucket[] {
  const buckets: SettingsGroupBucket[] = [];
  const bucketByGroup = new Map<string, SettingsGroupBucket>();
  for (const key of keys) {
    const group = getGroup(key) ?? "";
    let bucket = bucketByGroup.get(group);
    if (!bucket) {
      bucket = { group, keys: [] };
      bucketByGroup.set(group, bucket);
      buckets.push(bucket);
    }
    bucket.keys.push(key);
  }
  return buckets;
}
