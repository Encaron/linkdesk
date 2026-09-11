/**
 * 分组树的搜索过滤——E6#87d 自 SettingsView.tsx 的 filteredGroups useMemo 逐字搬出（只搬家，零逻辑变更）。
 */

import type { GroupInfo, ConfigProperty } from "./types";

export function filterGroups(
  groups: GroupInfo[],
  search: string,
  allProps: Record<string, ConfigProperty>,
): GroupInfo[] {
  if (!search.trim()) return groups;
  const q = search.toLowerCase();

  return groups
    .map((g) => ({
      ...g,
      keys: g.keys.filter((k) => {
        const prop = allProps[k];
        return (
          k.toLowerCase().includes(q) ||
          (prop?.description ?? "").toLowerCase().includes(q) ||
          g.title.toLowerCase().includes(q)
        );
      }),
    }))
    // 配置分组按匹配键保留；角色分组（可能空配置）按标题匹配保留——空配置组搜索标题仍可达
    .filter((g) => g.keys.length > 0 || (!!g.role && g.title.toLowerCase().includes(q)));
}
