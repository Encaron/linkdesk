/**
 * usePanelHost——底部面板显隐宿主（E5.8#31 Ctrl+J）。
 * E5.8#0d.10-3 系列：App 副作用逻辑拆 src/App/ 子模块（聚合器门面模式）。本模块 = 面板显隐状态机。
 *
 * 真相源 = App state（panelVisible）+ LayoutService 持久化（layout.json panel.visible）。
 * 区别侧栏（zone 宽真相源）——面板显隐走壳 state：面板贡献可有可无，
 * 无贡献插件时命令无可见效果（usePoolSync 无 panelViews → 不推 panel 字段，池维持无面板空态）。
 *
 * 显隐语义 = 不推 panel 字段（usePoolSync 条件 `panelViews.length > 0 && panelVisible`）——
 * 池 `layout.panel?.visible` undefined → PanelZone 不渲染。复用无 panel 贡献现网路径，零 PoolLayout 契约改动。
 *
 * 订阅 panel:toggle（生产方 = workbench.action.togglePanel 命令 Ctrl+J）→ 翻转 + 立即落盘 layout.json。
 */

import { useEffect, useRef, useState } from "react";
import { getPanelLayout, savePanelLayout } from "../core/services/layout/LayoutService";
import { layoutEngine } from "../core/services/layout/LayoutEngine";
import { shellEvents } from "../core/react/events/ShellEvents";

export interface PanelHostDeps {
  /** 底部面板激活视图 ID——null = 尚未选择。toggle 落盘时合并保留 */
  panelActiveViewId: string | null;
  /** App 的 post-init 信号——initAll 完成（initLayoutService 已装载布局缓存）后才能读初值 */
  ready: boolean;
}

export function usePanelHost({ panelActiveViewId, ready }: PanelHostDeps): { panelVisible: boolean; setPanelVisible: (v: boolean) => void } {
  // 🔴 初值**不在 mount 快照**（04「底部面板显隐重启复现」根因，2026-09-27 CDP 实证）：
  // mount 时刻布局缓存尚未装载（initLayoutService 异步），`getPanelLayout()?.visible ?? true`
  // 恒命中 `?? true` 把「还没装载」误当「旧布局缺字段」⇒ 每次启动面板都被顶回可见。
  // 与 useUpdateScheduler 的 A7 同类病、同款修法：null = 待装载；ready 翻真后现场重读（此刻缓存必齐）。
  const [panelVisible, setPanelVisible] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ready) return;
    setPanelVisible((cur) => (cur === null ? (getPanelLayout()?.visible ?? true) : cur));
  }, [ready]);

  // 订阅 deps []（注册一次）——闭包会过期，读活值走 ref（null = 未初始化，忽略 toggle）
  const panelVisibleRef = useRef<boolean | null>(panelVisible);
  panelVisibleRef.current = panelVisible;
  const activeViewIdRef = useRef(panelActiveViewId);
  activeViewIdRef.current = panelActiveViewId;

  useEffect(() => {
    return shellEvents.on("panel:toggle", () => {
      const cur = panelVisibleRef.current;
      if (cur === null) return; // 未初始化（ready 前）——命令本也不可达，防御
      // 硬约束 6：setState 函数式更新器内不写副作用——翻转值先经 ref 读活值，副作用放回调体
      const next = !cur;
      setPanelVisible(next);
      // 立即落盘——显隐切换即时持久化（与 persistence.ts 100ms 防抖保存同源同字段，最终一致）
      const height = layoutEngine.getBounds("panel")?.height ?? 220;
      const activeId = activeViewIdRef.current;
      void savePanelLayout({
        height,
        ...(activeId ? { activeViewId: activeId } : {}),
        visible: next,
      }).catch((e) => { console.error("[App] 保存面板显隐失败:", e); });
    });
  }, []);

  // E5.8#34.5：暴露 setPanelVisible 供 usePanelReveal 消费（面板展开）——useState setter 稳定
  return { panelVisible: panelVisible ?? false, setPanelVisible };
}
