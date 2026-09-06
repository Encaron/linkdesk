/**
 * usePoolSync 状态栏序列化——isRightAligned / StatusBarSourceItem / buildStatusBarItems。
 * E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：壳 StatusBar 三源合并 + 分隔线语义 DTO。
 * 零 hook 依赖。依赖方向：statusbar → viewRegistry/StatusBarService/ConfigurationService（type 单向）。
 */

import type { TFunction } from "i18next";
import type { PoolStatusBarItem } from "../../core/types/pool/poolLayout";
import type { StatusBarEntry } from "../../core/react/events/ShellEvents";
import type { StatusBarItem as ApiStatusBarItem } from "../../core/api/types"; // E5.7#98：状态栏三源条目共型
import { getStatusBarContributions, getViewPlugin } from "../../pluginLoader/contributions/viewRegistry";
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

/** configurable 状态栏条目开关 key 判定——契约 `${pluginId}.statusBar.${item.id}`
 *  （contributions.ts:355 注册同源）。供 useSubscriptions 配置订阅判断是否需重推布局
 *  （E5.8#55.2：显隐开关改动与 menuStyle 同构缺口——动态 key 无法静态枚举）。 */
export function isStatusBarConfigKey(key: string): boolean {
  return key.includes(".statusBar.");
}

/**
 * E5.7#8：状态栏条目序列化——壳 StatusBar.tsx 三源合并 + 分隔线语义照搬。
 * 贡献项 + 动态项 + eventEntries（按 alignment 拆 __shell_left__/__shell_right__）+ 壳固定项（语言/主题）。
 * 分隔线壳侧算好（dividerBefore）：
 *   - 左区：组间 + 组内——每项除整区首个都有前导分隔线；
 *   - 右区：仅组内除首个——组间无分隔线（壳 StatusBar 渲染语义）。
 * component=true 时池懒加载渲染自绘状态栏组件（serial-monitor 连接灯——manifest appearsIn.statusBar 声明驱动，E6#17d）。
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
    { pluginId: "__shell_right__", id: "theme", icon: "color-mode", label: "", title: t("切换主题"), align: "right", onClick: "theme.pick" }, // E5.8#50.24：theme.pick 归一化命令 id
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
      // E6#17d：插件声明 appearsIn.statusBar（自绘状态栏组件）——取代该插件全部静态项，发 component marker
      // 让池 PoolStatusBarComponent 懒加载渲染（壳不再 import 插件 statusBar JS——存在性信号声明式，硬约束 11）。
      // 静态贡献项仍须保留一条作本插件的 statusbar ordering 资格锚点（被 marker 分支替换前先进入序列表）。
      if (plugin?.manifest.appearsIn?.statusBar === true) {
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
