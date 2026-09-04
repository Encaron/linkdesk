/**
 * App 侧栏宿主状态机 hook——useSidebarHost：折叠真相源 + 状态同步 + 启动恢复。
 * E5.8#0d.10-3e：自 App.tsx 拆出——原隐藏挂载 SidePanel 的语义（E5.7#10 迁入 App）——
 * sidebarCollapseState 折叠状态机（icon:selected/sidebar:toggle/view:toggleCollapse/
 * resetPosition/toggleVisibility 五订阅）+ containerChanged/toggled → React state +
 * 启动恢复上次侧栏容器（重放 icon:selected，与点击同路径）。
 * 依赖方向：sidebarHost → core/services/layout + pluginLoader/viewRegistry + shellEvents；
 * App 消费：useSidebarHost({ setSidebarView, setIsSidebarExpanded, ready })。无反向依赖。
 */

import { useEffect, useRef } from "react";
import { layoutEngine } from "../core/services/layout/LayoutEngine";
import { shellEvents } from "../core/react/events/ShellEvents";
import { getViewPlugin, getViewPlugins } from "../pluginLoader/contributions/viewRegistry";
// #9g：容器变活动 = 视图创建触发源——经总线发 onView:<containerId>（延迟插件首用激活）
import { fireActivationEvent } from "../pluginLoader/resolution/activation";
import { setPluginStateValue, getPluginStateValue, APP_PLUGIN_ID } from "../core/services/plugins/PluginStateService";
import { ViewContainerService } from "../core/services/layout/ViewContainerService";

export interface SidebarHostDeps {
  setSidebarView: (v: string | null) => void;
  setIsSidebarExpanded: (v: boolean) => void;
  ready: boolean;
}

/** 侧栏宿主状态机——折叠真相源 = LayoutEngine zone 宽；订阅注册一次（setSidebarView/setIsSidebarExpanded 是 useState 稳定 setter） */
export function useSidebarHost({ setSidebarView, setIsSidebarExpanded, ready }: SidebarHostDeps): void {
  // E5.7#10：侧栏宿主状态机——原隐藏挂载 SidePanel 的语义迁入 App（池 SidebarZone 哑渲染，壳持状态）。
  // 三条入口：icon:selected（图标点击切换/折叠）、sidebar:toggle（池 ◀/▶ 按钮 + Ctrl+B 命令转发）、
  // view:toggleCollapse/resetPosition/toggleVisibility（view header 右键菜单，shellMenus emit）。
  // 折叠真相源 = LayoutEngine zone 宽（≤48 = 折叠）——池 ◀ 按钮只改 zone 宽，此机从 zone 宽
  // 派生折叠态（不持 collapsedRef，避免池按钮改宽后状态脱节）。
  const sidebarCollapseState = useRef({
    containerId: null as string | null,   // SidePanel 的 containerId state——当前侧栏容器
    lastSidebar: null as string | null,   // SidePanel 的 lastSidebar——折叠后仍知容器（▶ 展开用）
    preCollapseWidth: 280,                // SidePanel 的 preCollapseWidth——展开恢复目标宽（#13 拖拽后为最后展开宽）
  });
  useEffect(() => {
    const s = sidebarCollapseState.current;
    const zoneCollapsed = () => (layoutEngine.getBounds("sidebar")?.width ?? 0) <= 48;
    // E5#49：折叠/展开——被图标点击 + 池◀/▶按钮 + view 菜单共用
    const doCollapse = (collapse: boolean) => {
      if (collapse) {
        const w = layoutEngine.getBounds("sidebar")?.width;
        if (w && w > 48) s.preCollapseWidth = w;
        layoutEngine.setZoneWidth("sidebar", 28);
      } else {
        layoutEngine.setZoneWidth("sidebar", s.preCollapseWidth);
      }
      // E5.8#148：展开态唯一广播点——全部折叠路径（icon:selected/sidebar:toggle/view:toggleCollapse/
      // resetPosition）都过 doCollapse，单一发射保证 isSidebarExpanded（界面→主侧栏勾选态）恒同步。
      // 此前 sidebar:toggle 等 3 条路径漏发 → 折叠后勾选仍打 ✓（#148 CDP 实证）。
      shellEvents.emit("sidebar:toggled", !collapse);
    };

    // E3.6/E5#4b：图标栏点击——读 contributes.viewsContainers 取 containerId
    const u1 = shellEvents.on("icon:selected", (pluginId) => {
      const plugin = getViewPlugin(pluginId);
      const containers = plugin?.manifest.contributes?.viewsContainers as Record<string, unknown> | undefined;
      if (!containers) return;
      const cid = Object.keys(containers)[0];
      if (!cid) return;

      if (s.containerId === cid) {
        // E5#49：同图标 → toggle 折叠/展开（与 ◀/▶ 按钮行为一致）
        const shouldCollapse = !zoneCollapsed();
        doCollapse(shouldCollapse); // E5.8#148：内部已广播 sidebar:toggled（单一发射点）
        shellEvents.emit("sidebar:containerChanged", shouldCollapse ? null : cid);
        return;
      }

      // 不同图标：切换容器，折叠态则展开
      if (zoneCollapsed()) doCollapse(false);
      s.containerId = cid;
      s.lastSidebar = cid;
      // #9g：容器变活动 = onView 触发源——延迟插件（启动只注册元数据）此刻激活 JS。
      // 放切换支（非同容器 toggle）：切到该插件容器才需激活；启动恢复重放 icon:selected 走同支（同源同路）。
      void fireActivationEvent(`onView:${cid}`);
      // E5.7#13.5：持久化上次侧栏选择——启动恢复（对标 VS Code 记住 Activity Bar；
      // iconOrder 同款机制 PluginStateService，归一化不新发明）
      setPluginStateValue(APP_PLUGIN_ID, "activeSidebarPlugin", pluginId);
      shellEvents.emit("sidebar:containerChanged", cid);
      // 切换容器 ⇒ 侧栏展开态（若此前折叠 doCollapse(false) 内部已发 true——双重同值无副作用）
      shellEvents.emit("sidebar:toggled", true);
    });

    // 池 ◀/▶ 按钮——usePoolSync toggleSidebarCollapse 转发（折展真相在 zone 宽，池零状态）
    const u2 = shellEvents.on("sidebar:toggle", () => {
      doCollapse(!zoneCollapsed());
    });

    const effectiveContainerId = () => s.containerId ?? s.lastSidebar;

    // E5#60：view header 右键菜单——shellMenus 提供的命令 emit 这些事件
    const u3 = shellEvents.on("view:toggleCollapse", ({ containerId: cid }) => {
      if (cid !== effectiveContainerId()) return;
      doCollapse(!zoneCollapsed());
    });
    const u4 = shellEvents.on("view:resetPosition", ({ containerId: cid }) => {
      if (cid !== effectiveContainerId()) return;
      doCollapse(false);
      layoutEngine.setZoneWidth("sidebar", 280);
    });
    const u5 = shellEvents.on("view:toggleVisibility", ({ viewId, containerId: cid }) => {
      if (cid) ViewContainerService.toggleViewVisibility(cid, viewId);
    });
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  // E5.6#9d：订阅宿主状态机发出的侧栏状态变化——用于 pushLayout
  useEffect(() => {
    const u1 = shellEvents.on("sidebar:containerChanged", (cid: string | null) => {
      setSidebarView(cid);
    });
    const u2 = shellEvents.on("sidebar:toggled", (visible: boolean) => {
      setIsSidebarExpanded(visible);
    });
    return () => { u1(); u2(); };
  }, [setSidebarView, setIsSidebarExpanded]);

  // E5.7#13.5：启动恢复上次侧栏容器——对标 VS Code 恢复上次 Activity Bar 选择（用户选 B）。
  // 归一化：恢复 = 重放 icon:selected——与点击图标同一路径（u1 容器校验/折叠展开全走状态机，
  // 零第二套选择逻辑）。守卫：插件须仍在 getViewPlugins()（图标栏同源）——已卸载/禁用
  // 则静默无侧栏（回退旧行为）。一次性 ref 防 StrictMode 双跑重放（u1 同图标会当 toggle 处理）。
  const sidebarRestoreDoneRef = useRef(false);
  useEffect(() => {
    if (!ready || sidebarRestoreDoneRef.current) return;
    sidebarRestoreDoneRef.current = true;
    const persisted = getPluginStateValue<string>(APP_PLUGIN_ID, "activeSidebarPlugin");
    if (!persisted) return;
    if (!getViewPlugins().some((p) => p.pluginId === persisted)) return;
    shellEvents.emit("icon:selected", persisted);
  }, [ready]);
}
