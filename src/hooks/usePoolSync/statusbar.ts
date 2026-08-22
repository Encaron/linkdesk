/**
 * usePoolSync 状态栏序列化——isRightAligned / StatusBarSourceItem / buildStatusBarItems。
 * E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：壳 StatusBar 三源合并 + 分隔线语义 DTO。
 * 零 hook 依赖。依赖方向：statusbar → viewRegistry/StatusBarService/ConfigurationService（type 单向）。
 */

import type { TFunction } from "i18next";
import type { PoolStatusBarItem } from "../../core/types/pool/poolLayout";
import type { StatusBarEntry } from "../../core/react/events/ShellEvents";
import type { StatusBarItem as ApiStatusBarItem } from "../../core/api/types"; // E5.7#98：状态栏三源条目共型
import { getStatusBarContributions, getViewPlugin } from "../../pluginLoader/viewRegistry";
import { getDynamicStatusBarItems } from "../../core/services/ui/StatusBarService"; // E5.7#8：状态栏三源合并——动态项 + 变化订阅
import { getConfigurationValue } from "../../core/services/configuration/ConfigurationService";

/** align/alignment 判别——StatusBarEntry 用 alignment，状态栏条目用 align；
 *  eslint E5.5#10 规则拦 `=== "right"` 字面量比较，switch 判别不误报 */
function isRightAligned(item: { align?: string; alignment?: string }): boolean {
  switch (item.align ?? item.alignment) {
    case "right": return true;
    default: return false;
  }
}

/**
 * E5.7#8：状态栏条目序列化——壳 StatusBar.tsx 三源合并 + 分隔线语义照搬。
 * 贡献项 + 动态项 + eventEntries（按 alignment 拆 __shell_left__/__shell_right__）+ 壳固定项（语言/主题）。
 * 分隔线壳侧算好（dividerBefore）：
 *   - 左区：组间 + 组内——每项除整区首个都有前导分隔线；
 *   - 右区：仅组内除首个——组间无分隔线（壳 StatusBar 渲染语义）。
 * component=true 时池懒加载插件 statusBarComponent（serial-monitor TX/RX 实时计数）。
 * 壳 StatusBar 固定项 title 硬编码中文——迁移时改 t()（硬约束 #2 顺带修正）。
 */
// E5.7#98：三源条目共型——api StatusBarItem + pluginId + title（贡献项/动态项/event 条目/壳固定项均满足）
type StatusBarSourceItem = ApiStatusBarItem & { pluginId: string; title?: string };

export function buildStatusBarItems(t: TFunction, eventEntries: StatusBarEntry[]): PoolStatusBarItem[] {
  const allItems: StatusBarSourceItem[] = [
    ...getStatusBarContributions(),
    ...getDynamicStatusBarItems(),
    ...eventEntries.filter((e) => !isRightAligned(e)).map((e): StatusBarSourceItem => ({
      pluginId: "__shell_left__", id: e.id, label: e.text, align: "left",
    })),
    ...eventEntries.filter((e) => isRightAligned(e)).map((e): StatusBarSourceItem => ({
      pluginId: "__shell_right__", id: e.id, label: e.text, align: "right",
    })),
    { pluginId: "__shell_right__", id: "lang", icon: "globe", label: "", title: t("选择语言"), align: "right", onClick: "workbench.action.selectLanguage" },
    { pluginId: "__shell_right__", id: "theme", icon: "color-mode", label: "", title: t("切换主题"), align: "right", onClick: "workbench.action.selectTheme" },
  ];

  // 去重插件 ID（保持顺序）——壳 orderedPluginIds 同款
  const orderedPluginIds = (() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of allItems) {
      if (!seen.has(item.pluginId)) {
        seen.add(item.pluginId);
        ids.push(item.pluginId);
      }
    }
    return ids;
  })();

  const leftPluginIds = orderedPluginIds.filter((pid) =>
    allItems.some((i) => i.pluginId === pid && !isRightAligned(i))
  );
  const rightPluginIds = orderedPluginIds.filter((pid) =>
    allItems.some((i) => i.pluginId === pid && isRightAligned(i))
  );

  const result: PoolStatusBarItem[] = [];
  // isLeft 布尔入参——eslint E5.5#10 规则拦 `side === "left"` 字面量比较
  const pushSide = (ids: string[], isLeft: boolean) => {
    const align: "left" | "right" = isLeft ? "left" : "right";
    let firstInSide = true;
    for (const pid of ids) {
      const plugin = pid.startsWith("__shell_") ? undefined : getViewPlugin(pid);
      // 插件有 statusBarComponent——取代该插件全部静态项（壳 renderPluginStatusBar 同款）
      if (plugin?.statusBarComponent) {
        result.push({
          id: `${pid}:component`, pluginId: pid, label: "", align,
          component: true,
          // 左区：组间有分隔线；右区：组间无（壳渲染语义）
          dividerBefore: isLeft ? !firstInSide : false,
        });
        firstInSide = false;
        continue;
      }
      const items = allItems.filter((i) => i.pluginId === pid);
      // E2c #19g：configurable 条目按配置值过滤显隐
      const visibleItems = items.filter((item) => {
        if (!item.configurable) return true;
        const configKey = `${pid}.statusBar.${item.id}`;
        return getConfigurationValue<boolean>(configKey) ?? true;
      });
      if (visibleItems.length === 0) continue;
      let firstInGroup = true;
      for (const item of visibleItems) {
        result.push({
          id: item.id,
          pluginId: pid,
          ...(item.icon ? { icon: item.icon } : {}),
          // 壳渲染 {item.label || item.id}——空 label 回退 id（lang/theme 显示 id 文本，同壳行为）
          label: item.label || item.id,
          ...(item.title ? { title: item.title } : {}),
          align,
          ...(item.onClick ? { onClick: item.onClick } : {}),
          dividerBefore: isLeft ? !firstInSide : !firstInGroup,
        });
        firstInSide = false;
        firstInGroup = false;
      }
    }
  };
  pushSide(leftPluginIds, true);
  pushSide(rightPluginIds, false);
  return result;
}
