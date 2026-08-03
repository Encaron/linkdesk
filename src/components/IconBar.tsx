/**
 * IconBar — 图标栏（最左 48px 垂直条）。
 * 对标 VS Code Activity Bar。拖拽换位 + 半透明拖影跟随鼠标。
 * 复用 TabBar 拖拽的 window 级 mousemove/mouseup 模式。
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getViewPlugins, getViewPlugin, getIconLocation, onDidRegister, onDidUnregister } from "../pluginLoader/viewRegistry";
import { resolvePluginIcon, type ResolvedIcon } from "../pluginLoader/iconUtils";
import { PluginIcon } from "./shared/PluginIcon";
// Phase 5：图标排序迁移到 PluginStateService
import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../core/PluginStateService";
// Phase 5c：齿轮菜单
import ContextMenu from "./shared/ContextMenu";
import { MenuId } from "../core/MenuRegistry";
import HamburgerMenu from "./HamburgerMenu"; // E3f #52b：汉堡——图标栏第一个位置
// E4V#48——跨容器拖放
import { ViewContainerService } from "../core/ViewContainerService";
import { getDraggingView, setDraggingView } from "./shared/viewDragState";
// E5#3a：壳内通信——订阅 sidebar:containerChanged 替代 App.tsx props
import { shellEvents } from "../core/ShellEvents";
import "./IconBar.css";

interface IconBarProps {
  /** E3f #52h：控制图标栏汉堡菜单显隐。true=显示，false/undefined=隐藏 */
  showHamburger?: boolean;
}

function getIcon(entry: { pluginId: string; manifest: { icon?: string; iconSource?: string } }) {
  return resolvePluginIcon(entry.pluginId, entry.manifest);
}

function loadOrder(): string[] {
  try {
    // Phase 5：PluginStateService 是唯一真源，不再回退 PreferenceService
    // B72 教训：兜底读 PreferenceService → 旧数据永远不清理 → 卸载重装后图标回老位置
    return getPluginStateValue<string[]>(APP_PLUGIN_ID, "iconOrder") ?? [];
  } catch { return []; }
}
function saveOrder(order: string[]): void {
  try {
    // Phase 5：写入 PluginStateService
    setPluginStateValue(APP_PLUGIN_ID, "iconOrder", order);
  } catch { /* 静默 */ }
}

/* ── 拖拽状态 ── */

interface DragState {
  pluginId: string;
  startY: number;
  moved: boolean;
}

function IconBar({ showHamburger }: IconBarProps) {
  const { t } = useTranslation();
  // E5#3a：替代 props.sidebarView——订阅壳事件，IconBar 不需要知道谁触发的容器切换
  const [activeContainerId, setActiveContainerId] = useState<string | null>(null);
  // E5#3c：侧栏折叠时不亮任何图标——与 containerChanged 形成双重守卫
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "top" | "bottom" } | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  // Phase 5c：齿轮菜单——右键 settings 图标
  const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);
  // Phase 5h Step 1：插件注册/注销时强制刷新——解决安装插件后图标不更新的问题
  const [pluginVersion, setPluginVersion] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const dropRef = useRef<{ id: string; pos: "top" | "bottom" } | null>(null);
  const wasDragRef = useRef(false); // 标记本次是否拖拽了——防止 onClick 误触发
  const containerRef = useRef<HTMLDivElement>(null);

  // E4V#48——跨容器拖放（HTML5 drag-and-drop 从 SectionStack 过来）
  const [viewDropTarget, setViewDropTarget] = useState<string | null>(null);

  const handleIconDragOver = useCallback((e: React.DragEvent, pluginId: string) => {
    const info = getDraggingView();
    if (!info) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setViewDropTarget(pluginId);
  }, []);

  const handleIconDragLeave = useCallback((_e: React.DragEvent, targetId: string) => {
    setViewDropTarget((prev) => prev === targetId ? null : prev);
  }, []);

  const handleIconDrop = useCallback((e: React.DragEvent, toPluginId: string) => {
    e.preventDefault();
    const info = getDraggingView();
    if (!info) return;
    // 查目标 plugin 声明的第一个容器 ID
    const toPlugin = getViewPlugin(toPluginId);
    const containers = toPlugin?.manifest.contributes?.viewsContainers as Record<string, unknown> | undefined;
    const toContainerId = containers ? Object.keys(containers)[0] : undefined;
    if (!toContainerId) return;
    ViewContainerService.moveView(info.viewId, info.fromContainerId, toContainerId);
    setDraggingView(null);
    setViewDropTarget(null);
  }, []);

  // Phase 5h Step 1：订阅 viewRegistry 变更——安装/卸载/禁用/启用即时更新图标栏
  useEffect(() => {
    const unsub1 = onDidRegister.event(() => setPluginVersion((v) => v + 1));
    const unsub2 = onDidUnregister.event(() => setPluginVersion((v) => v + 1));
    return () => { unsub1(); unsub2(); };
  }, []);

  // E5#3a：订阅侧栏容器切换——替代 props.sidebarView。IconBar 不知道谁触发的切换。
  useEffect(() => {
    const unsub = shellEvents.on("sidebar:containerChanged", (containerId) => {
      setActiveContainerId(containerId);
    });
    return unsub;
  }, []);

  // E5#3c：订阅侧栏折叠——折叠时图标不高亮
  useEffect(() => {
    const unsub = shellEvents.on("sidebar:toggled", (open) => {
      setIsSidebarOpen(open);
    });
    return unsub;
  }, []);

  type IconEntry = { pluginId: string; icon: ResolvedIcon; label: string };
  const ordered: IconEntry[] = useMemo(() => {
    void pluginVersion; // Phase 5h Step 1：插件变更时重新计算图标列表
    const plugins = getViewPlugins();
    const order = loadOrder();
    const result: IconEntry[] = [];
    const remaining = new Set(plugins.map((p) => p.pluginId));
    for (const id of order) {
      if (remaining.has(id)) {
        remaining.delete(id);
        const p = plugins.find((v) => v.pluginId === id);
        if (p) result.push({ pluginId: id, icon: getIcon(p), label: p.manifest.name });
      }
    }
    for (const id of remaining) {
      const p = plugins.find((v) => v.pluginId === id);
      if (p) result.push({ pluginId: id, icon: getIcon(p), label: p.manifest.name });
    }
    return result;
  }, [pluginVersion]);
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;

  const topIcons = ordered.filter((x) => getIconLocation(x.pluginId) !== "bottom");
  const bottomIcons = ordered.filter((x) => getIconLocation(x.pluginId) === "bottom");

  /* ── 查找鼠标下的图标 ── */

  const findTarget = (clientY: number, excludeId: string) => {
    const container = containerRef.current;
    if (!container) return null;
    const buttons = container.querySelectorAll("[data-plugin-id]");
    for (const btn of buttons) {
      if (btn.getAttribute("data-plugin-id") === excludeId) continue;
      const rect = btn.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return {
          id: btn.getAttribute("data-plugin-id")!,
          pos: (clientY < rect.top + rect.height / 2 ? "top" : "bottom") as "top" | "bottom",
        };
      }
    }
    return null;
  };

  /* ── 拖拽事件（窗口级，和 TabBar 同一模式） ── */

  const handleDragMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const dy = Math.abs(e.clientY - dragRef.current.startY);
    if (dy < 5) return;

    if (!dragRef.current.moved) {
      dragRef.current.moved = true;
      wasDragRef.current = true;
      setDraggedId(dragRef.current.pluginId);
    }

    const target = findTarget(e.clientY, dragRef.current.pluginId);
    dropRef.current = target;
    setPreviewPos({ x: e.clientX - 24, y: e.clientY - 24 });
    setDropTarget(target);
  }, []);

  const handleDragMouseUp = useCallback(() => {
    const drag = dragRef.current;
    const target = dropRef.current;
    if (!drag) return;

    if (drag.moved && target) {
      const ids = orderedRef.current.map((x) => x.pluginId).filter((x) => x !== drag.pluginId);
      const targetIdx = ids.indexOf(target.id);
      const insertAt = target.pos === "top" ? targetIdx : targetIdx + 1;
      ids.splice(Math.max(0, insertAt), 0, drag.pluginId);
      saveOrder(ids);
      setPluginVersion((v) => v + 1); // Phase 5h: 拖拽换位后触发 useMemo 重算
    }

    dragRef.current = null;
    dropRef.current = null;
    setDraggedId(null);
    setDropTarget(null);
    setPreviewPos(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleDragMouseMove);
    window.addEventListener("mouseup", handleDragMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleDragMouseMove);
      window.removeEventListener("mouseup", handleDragMouseUp);
    };
  }, [handleDragMouseMove, handleDragMouseUp]);

  /* ── 高亮 ── */

  // E5#3a+3c：activeContainerId + isSidebarOpen 均来自 shellEvents——不再读 props
  const isActive = (pluginId: string) => {
    if (!isSidebarOpen || !activeContainerId) return false;
    const plugin = getViewPlugin(pluginId);
    const containers = plugin?.manifest.contributes?.viewsContainers as Record<string, unknown> | undefined;
    if (!containers) return false;
    return Object.keys(containers).some((id) => id === activeContainerId);
  };

  const renderIcon = (entry: IconEntry) => {
    const showBefore = dropTarget?.id === entry.pluginId && dropTarget.pos === "top";
    const showAfter = dropTarget?.id === entry.pluginId && dropTarget.pos === "bottom";
    return (
      <div key={entry.pluginId} className="icon-bar-item-wrapper">
        {showBefore && <div className="icon-drop-indicator" />}
        <button
          className={`icon-btn${isActive(entry.pluginId) ? " active" : ""}${draggedId === entry.pluginId ? " dragging" : ""}${viewDropTarget === entry.pluginId ? " view-drop-target" : ""}`}
          data-plugin-id={entry.pluginId}
          onDragOver={(e) => handleIconDragOver(e, entry.pluginId)}
          onDragLeave={(e) => handleIconDragLeave(e, entry.pluginId)}
          onDrop={(e) => handleIconDrop(e, entry.pluginId)}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault(); // 阻止浏览器原生拖拽
            dragRef.current = { pluginId: entry.pluginId, startY: e.clientY, moved: false };
          }}
          onClick={(e) => {
            if (wasDragRef.current) {
              wasDragRef.current = false;
              dragRef.current = null;
              return;
            }
            if (getIconLocation(entry.pluginId) === "bottom") {
              // 底部图标（齿轮）：对标 VS Code 左下齿轮，左键弹出菜单——优先于 viewRole
              e.preventDefault();
              setGearAnchor({ x: e.clientX, y: e.clientY });
              return;
            }
            // E5#3b：emit 事件——IconBar 不知道谁会响应
            shellEvents.emit("icon:selected", entry.pluginId);
          }}
          onContextMenu={
            getIconLocation(entry.pluginId) === "bottom"
              ? (e) => {
                  e.preventDefault();
                  setGearAnchor({ x: e.clientX, y: e.clientY });
                }
              : undefined
          }
          title={t(entry.label)}
          aria-label={t(entry.label)}
        >
          <PluginIcon pluginId={entry.pluginId} className="icon-bar-plugin-icon" alt={t(entry.label)} />
        </button>
        {showAfter && <div className="icon-drop-indicator" />}
      </div>
    );
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={t("导航")}>
      <div className="icon-bar-top" ref={containerRef}>
        {/* E3f #52b+#52h：汉堡——图标栏第一个位置，showHamburger 控制显隐 */}
        {showHamburger && <HamburgerMenu />}
        {topIcons.map(renderIcon)}
      </div>
      <div className="icon-bar-bottom">
        {bottomIcons.map(renderIcon)}
      </div>

      {/* 拖影——对标 TabBar 的半透明跟随 */}
      {previewPos && draggedId && createPortal(
        <div
          className="icon-drag-preview"
          style={{ left: previewPos.x, top: previewPos.y }}
        >
          <PluginIcon pluginId={draggedId} className="icon-bar-plugin-icon" />
        </div>,
        document.body
      )}

      {/* Phase 5c：齿轮菜单——右键图标栏底部图标 */}
      {gearAnchor && (
        <ContextMenu
          menuId={MenuId.ExtensionGear}
          anchor={gearAnchor}
          context={{}}
          onClose={() => { setGearAnchor(null); (document.activeElement as HTMLElement)?.blur(); }}
        />
      )}
    </div>
  );
}

export default IconBar;
