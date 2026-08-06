/**
 * SidePanel — 侧栏。E3.6：从"渲染单个 sidebarComponent"归一化为
 * "查 ViewContainerService 桌子 → 分组 → 委托 Slot 组件"。
 *
 * 🆕 E36#ROLE7：ToolbarSlot + SectionStack 替代 title="" hack + inline 分支。
 * SidePanel 不再做分支判断——只读表、分组、委托。
 *
 * 对标 VS Code：SidePanel 不知道 FOLDERS 是什么、不知道"收发设置"是什么。
 * 它只做一件事——查表 + 循环渲染。谁注册了什么就渲染什么。
 */

import { useState, useEffect, forwardRef, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ViewContainerService } from "../core/services/ViewContainerService";
import ToolbarSlot from "./shared/ToolbarSlot";
import SectionStack from "./shared/SectionStack";
// E5#4b：壳内通信——订阅 icon:selected，解析 pluginId → containerId
import { shellEvents } from "../core/react/ShellEvents";
import { layoutEngine } from "../core/services/LayoutEngine"; // E5#9f：collapse/expand 同步 zone 宽度
import { getViewPlugin } from "../pluginLoader/viewRegistry";
// E5#60：view header 右键菜单消费方
import ContextMenu from "./shared/ContextMenu";
import { MenuId } from "../core/registry/MenuRegistry";
import "./SidePanel.css";

interface SidePanelProps {
  width: number;
}

const SidePanel = forwardRef<HTMLElement, SidePanelProps>(
  function SidePanel({ width }, ref) {
  const [collapsed, setCollapsed] = useState(false);
  const [animating, setAnimating] = useState(false);
  const { t } = useTranslation();
  const asideRef = useRef<HTMLElement | null>(null);
  // E5#4a+4b：替代 props.sidebarView——订阅 icon:selected 事件解析 pluginId → containerId
  const [containerId, setContainerId] = useState<string | null>(null);

  // 🔥 E5#49：ref 桥接——effect 有 [] 依赖，需 ref 读最新值避免闭包过期
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const containerIdRef = useRef(containerId);
  containerIdRef.current = containerId;

  // 🔥 UX03：onTransitionEnd 替代 setTimeout(220)
  const handleTransitionEnd = useCallback(() => {
    setAnimating(false);
  }, []);

  const preCollapseWidth = useRef(280);

  // E5#49：折叠/展开——被图标点击 + ◀/▶ 按钮共用
  const doCollapse = useCallback((collapse: boolean) => {
    setAnimating(true);
    setCollapsed(collapse);
    // E5#9f：同步 LayoutEngine——collapse 时 zone 缩到 28px，main 自动拓展
    if (collapse) {
      preCollapseWidth.current = layoutEngine.getBounds("sidebar")?.width ?? 280;
      layoutEngine.setZoneWidth("sidebar", 28);
    } else {
      layoutEngine.setZoneWidth("sidebar", preCollapseWidth.current);
    }
  }, []);

  // E5#4b：订阅 IconBar 发出的 icon:selected——解析 pluginId → containerId
  // E5#49：同图标再点击 → toggle 折叠/展开（和 ◀/▶ 按钮行为一致）
  useEffect(() => {
    const unsub = shellEvents.on("icon:selected", (pluginId) => {
      const plugin = getViewPlugin(pluginId);
      const containers = plugin?.manifest.contributes?.viewsContainers as Record<string, unknown> | undefined;
      if (!containers) return;
      const cid = Object.keys(containers)[0];
      if (!cid) return;

      const currentCid = containerIdRef.current;

      if (currentCid === cid) {
        // E5#49：同图标 → toggle 折叠/展开
        const shouldCollapse = !collapsedRef.current;
        doCollapse(shouldCollapse);
        shellEvents.emit("sidebar:containerChanged", shouldCollapse ? null : cid);
        shellEvents.emit("sidebar:toggled", !shouldCollapse);
        return;
      }

      // 不同图标：切换容器，折叠态则展开
      if (collapsedRef.current) {
        doCollapse(false);
      }
      setContainerId(cid);
      shellEvents.emit("sidebar:containerChanged", cid);
      shellEvents.emit("sidebar:toggled", true);
    });
    return unsub;
  }, [doCollapse]);

  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    el.addEventListener("transitionend", handleTransitionEnd);
    return () => el.removeEventListener("transitionend", handleTransitionEnd);
  }, [handleTransitionEnd]);

  const cls = ["side-panel"];
  if (collapsed) cls.push("collapsed");
  if (animating) cls.push("animating");

  // lastSidebar 记住上次有效 containerId——切换标签页不关闭侧栏
  const [lastSidebar, setLastSidebar] = useState<string | null>(null);
  const effectiveContainerId = containerId ?? lastSidebar;

  useEffect(() => {
    if (effectiveContainerId) setLastSidebar(effectiveContainerId);
  }, [effectiveContainerId]);

  // E5#60：订阅 view header 菜单事件——shellMenus 提供的命令 emit 这些事件
  useEffect(() => {
    const u1 = shellEvents.on("view:toggleCollapse", ({ containerId: cid }) => {
      if (cid !== effectiveContainerId) return;
      doCollapse(!collapsedRef.current);
    });
    const u2 = shellEvents.on("view:resetPosition", ({ containerId: cid }) => {
      if (cid !== effectiveContainerId) return;
      doCollapse(false);
      layoutEngine.setZoneWidth("sidebar", 280);
    });
    const u3 = shellEvents.on("view:toggleVisibility", ({ viewId, containerId: cid }) => {
      if (cid) ViewContainerService.toggleViewVisibility(cid, viewId);
    });
    return () => { u1(); u2(); u3(); };
  }, [effectiveContainerId, doCollapse]);

  // 🔥 Bug 3/4 防线——StrictMode remount 旧订阅清理 + 不活跃时不处理事件
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!effectiveContainerId) return;
    const sub = ViewContainerService.onDidChangeActiveViews.event(({ containerId }) => {
      if (containerId !== effectiveContainerId) return;
      setVersion((v) => v + 1);
    });
    return () => sub();
  }, [effectiveContainerId]);

  // 容器描述符 + 活跃 views
  const container = effectiveContainerId
    ? ViewContainerService.getViewContainer(effectiveContainerId)
    : undefined;
  const activeViews = effectiveContainerId
    ? ViewContainerService.getActiveViews(effectiveContainerId)
    : [];

  // 🆕 E36#ROLE：按 role 分组——替代 title="" hack。
  // toolbar 角色粘顶，section 角色（默认）有折叠头同级替换。
  const toolbarViews = activeViews.filter((v) => v.role === "toolbar");
  const sectionViews = activeViews.filter((v) => v.role !== "toolbar");

  // toolbarHeight 从 ToolbarSlot 回调接收——状态归 ToolbarSlot 管，SidePanel 只是转交
  const [toolbarHeight, setToolbarHeight] = useState(0);

  // E5#60：view header 右键菜单
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);

  // mergeHeaderWhenSingle——容器 header 标题逻辑
  const singleView = activeViews.length === 1;
  const mergeHeader = singleView && container?.mergeHeaderWhenSingle === true;

  let title = container?.title ?? "";
  if (mergeHeader && activeViews[0]) {
    title = activeViews[0].singleViewPaneContainerTitle ?? activeViews[0].title ?? title;
  }

  const renderSidebarContent = () => {
    if (!effectiveContainerId) return null;

    if (activeViews.length === 0) {
      return (
        <div className="side-panel-placeholder">
          <p>{t("此容器没有已注册的视图")}</p>
          <p className="side-panel-placeholder-hint">{t("安装插件以添加视图")}</p>
        </div>
      );
    }

    return (
      <>
        <ToolbarSlot
          views={toolbarViews}
          pluginId={effectiveContainerId}
          onHeightChange={setToolbarHeight}
        />
        <SectionStack
          views={sectionViews}
          pluginId={effectiveContainerId}
          toolbarHeight={toolbarHeight}
          mergeHeaderWhenSingle={container?.mergeHeaderWhenSingle}
        />
      </>
    );
  };

  return (
    <aside
      ref={(node) => {
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
        asideRef.current = node;
      }}
      className={cls.join(" ")}
      style={{ width: collapsed ? 28 : width, height: "100%" }}
    >
      {collapsed ? (
        <button
          className="side-panel-expand"
          onClick={() => doCollapse(false)}
          title={t("展开侧栏")}
        >
          ▶
        </button>
      ) : (
        <>
          <div
            className="side-panel-header"
            onContextMenu={(e) => {
              e.preventDefault();
              setHeaderMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            <span className="side-panel-title" title={t(title)}>{t(title)}</span>
            <button
              className="side-panel-collapse"
              onClick={() => doCollapse(true)}
              title={t("折叠侧栏")}
            >
              ◀
            </button>
          </div>
          <div className="side-panel-content">
            {renderSidebarContent()}
          </div>
        </>
      )}
      {headerMenu && (
        <ContextMenu
          menuId={MenuId.ViewTitleContext}
          anchor={headerMenu}
          context={{ containerId: effectiveContainerId ?? undefined }}
          onClose={() => setHeaderMenu(null)}
          resolveChildren={(_parentId, ctx) => {
            const cid = ctx.containerId as string | undefined;
            if (!cid) return undefined;
            const allViews = ViewContainerService.getViews(cid);
            return allViews.map((v: any) => ({
              id: "workbench.action.toggleViewVisibility",
              label: v.title ?? v.id,
            }));
          }}
        />
      )}
    </aside>
  );
});

export default SidePanel;
