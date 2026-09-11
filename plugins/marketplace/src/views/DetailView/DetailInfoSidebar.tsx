/**
 * DetailInfoSidebar——详情页元数据侧栏的**展示件**（#63c B3 分组定稿，mockup 04）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 的 infoGroups IIFE + `<aside>` 段
 * 原样搬出；同期分组装配移 `useInfoGroups.ts`（判据/字段源全在那里），本件只剩「把组壳铺出来」。
 *
 * 组壳统一由 `info-bits.InfoGroup` 出——「空组不渲染」的判据因此只有一处。
 */

import { InfoGroup } from "./info-bits";
import { useInfoGroups, type InfoGroupsInput } from "./useInfoGroups";

export default function DetailInfoSidebar(props: InfoGroupsInput) {
  const groups = useInfoGroups(props);
  return (
    <aside className="mpd-info-sidebar">
      {groups.map((g) => (
        <InfoGroup key={g.title ?? "__top"} title={g.title} items={g.items} />
      ))}
    </aside>
  );
}
