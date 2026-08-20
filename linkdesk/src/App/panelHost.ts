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
}

export function usePanelHost({ panelActiveViewId }: PanelHostDeps): { panelVisible: boolean; setPanelVisible: (v: boolean) => void } {
  // 初始 = 持久化值，旧布局（无 visible 字段）缺省可见（?? true）——#31 前老用户面板不消失
  const [panelVisible, setPanelVisible] = useState<boolean>(() => getPanelLayout()?.visible ?? true);

  // 订阅 deps []（注册一次）——闭包会过期，读活值走 ref
  const panelVisibleRef = useRef(panelVisible);
  panelVisibleRef.current = panelVisible;
  const activeViewIdRef = useRef(panelActiveViewId);
  activeViewIdRef.current = panelActiveViewId;

  useEffect(() => {
    return shellEvents.on("panel:toggle", () => {
      // 硬约束 6：setState 函数式更新器内不写副作用——翻转值先经 ref 读活值，副作用放回调体
      const next = !panelVisibleRef.current;
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
  return { panelVisible, setPanelVisible };
}
