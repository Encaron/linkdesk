/**
 * IconBarZone——E5.7#6。图标栏 React Zone——壳 IconBar + HamburgerMenu 迁入池。
 *
 * 数据全部来自 layout.iconBar（壳侧已排序/翻译/激活判定——显示文本铁律）。池 = 哑渲染器。
 *
 * 职责（设计 Zone分解设计.md §2.2）：
 *   - 图标按钮（垂直排列，42px 宽；top/bottom 分列——壳 getIconLocation 序列化为 location 字段）
 *   - 激活高亮（activePluginId——壳侧已算好：侧栏展开 + 活动容器属于该插件）
 *   - 点击 → window.linkdesk.events.emit("icon:selected", pluginId) → 主进程转发 → 壳开标签
 *   - 底部图标（齿轮）例外——左键/右键弹 ExtensionGear 菜单（壳 IconBar 同款：
 *     location=bottom 即齿轮，零 pluginId 硬编码；菜单项壳 MenuRegistry 解析推送，池哑渲染）
 *   - 拖拽换位（#6 补丁 2026-08-14）——壳 IconBar 状态机迁入：乐观本地序 + mouseup
 *     emit icon:reordered → 壳持久化 iconOrder + 重推确认（#13 同款"乐观本地 + commit"模式，
 *     真相源在壳）。设计 §2.2"可选——远期"废止——零丢失铁律：壳已验证功能不得静默砍。
 *     2026-08-16 闪修复：补 #13 同款回执对齐 guard（commitPendingRef + preDragOrderRef）——
 *     commit 后回执到达前的旧序在途推送不再覆盖本地新序（详见组件内两段 guard 注释）。
 *   - ☰ 汉堡（hamburgerVisible）——下拉分组菜单（壳 MenuRenderer showGroups+showKeybindings+checkWhen 语义）
 *
 * 与壳行为差异（诚实注记）：
 *   ② 壳 icon-btn 48×48 在 42px 列内横向溢出——池按设计修正为 42×42（Zone分解设计.md:81）。
 *   ③ 壳汉堡子面板仅 2 层——池共享 MenuItemList 递归支持 N 层（实际菜单数据 ≤2 层，无感）。
 *   ④ 拖拽落点范围：壳只把 icon-bar-top 作目标容器（底部图标不可作落点——壳实现遗漏），
 *      池整列可作落点。换位语义不变（全序 splice），只是落点检测完整化。
 *   ⑤ E4V#48 跨容器拖放（视图拖到图标栏 → 视图移入目标插件容器）——并入 #10 迁移
 *      （用户定夺 2026-08-14）：drop 源 PoolSectionStack handleDragStart 写 dataTransfer
 *      自定义 MIME（application/x-linkdesk-view），图标落点 onDrop 读 MIME → emit
 *      view:droppedOnIcon → 壳 usePoolSync 解析目标插件首个容器 → moveView + 重推确认。
 *      替代壳 getDraggingView/setDraggingView 共享状态——dataTransfer 是唯一同步通道。
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { IconBarLayout, IconBarItem } from "../../../core/types/pool/poolLayout";
import MenuItemList from "../../shared/menu-item-list/MenuItemList";
import PoolPluginIcon from "../../shared/pool-plugin-icon/PoolPluginIcon";
import { executePoolCommand } from "../../commands/executePoolCommand";
import ContextMenu from "@src/components/shared/context-menu/ContextMenu"; // 齿轮菜单——#14 门户（壳 IconBar 同款消费者）
import { VIEW_DRAG_MIME } from "../../protocol/viewDragProtocol"; // E4V#48：跨容器拖放入口（drop 目标判别）
import "./IconBarZone.css";

/* ── 拖拽状态（壳 IconBar DragState 同款） ── */

interface DragState {
  pluginId: string;
  startY: number;
  moved: boolean;
}

/** 拖拽落点位置判别字面量——eslint no-restricted-syntax 拦 `=== "小写字面量"`（防 pluginId
 *  硬编码，误伤 Union tag 判别）。pos 是拖拽位置（非插件 ID），按规则自带提示提为大写常量。 */
const DROP_POS_TOP = "top" as const;
const DROP_POS_BOTTOM = "bottom" as const;

/** 序比较——回执对齐基准比对（长度 + 逐位 pluginId） */
function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function IconBarZone({ iconBar }: { iconBar: IconBarLayout }) {
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 齿轮菜单锚点（壳 IconBar gearAnchor 同款）——底部图标左键/右键 → ExtensionGear 菜单
  const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);

  const handleCommand = useCallback((command: string) => {
    setHamburgerOpen(false);
    executePoolCommand(command);
  }, []);

  // 外部点击 + Escape 关闭（TitleBarZone 同款模式）
  useEffect(() => {
    if (!hamburgerOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (hamburgerBtnRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setHamburgerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHamburgerOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [hamburgerOpen]);

  /* ── E5.7#6 补丁：拖拽换位——壳 IconBar.tsx 状态机迁入 ── */

  // 乐观本地序——壳是真相源：layout 推送到达时对齐壳序。
  // 防闪两段 guard（#13 侧栏拖宽同款）：
  //   ① 拖拽期间 draggingRef 忽略推送（isDragging guard）；
  //   ② commit 后回执对齐（2026-08-16 闪修复）——旧序推送（= 拖前序：壳尚未处理 commit 的
  //      在途推送）忽略，回执 = 首条序 ≠ 拖前序的推送（壳已持久化重推权威序，或序另有
  //      变化——壳是真相源，接受）。
  const [localIcons, setLocalIcons] = useState<IconBarItem[]>(iconBar.icons);
  const localIconsRef = useRef(localIcons);
  localIconsRef.current = localIcons;
  const draggingRef = useRef(false);
  const commitPendingRef = useRef(false); // commit 已发待回执——回执期忽略旧序推送
  const preDragOrderRef = useRef<string[]>([]); // 拖前序——回执对齐基准
  useEffect(() => {
    if (draggingRef.current) return;
    if (!commitPendingRef.current) {
      setLocalIcons(iconBar.icons);
      return;
    }
    // 回执对齐——迟到旧序推送忽略（防闪）；序变了（回执或壳侧另有变化）→ 释放并接受
    const pushedOrder = iconBar.icons.map((x) => x.pluginId);
    if (!sameOrder(pushedOrder, preDragOrderRef.current)) {
      commitPendingRef.current = false;
      setLocalIcons(iconBar.icons);
    }
  }, [iconBar.icons]);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "top" | "bottom" } | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  // E4V#48：跨容器拖放悬停目标——数据含 VIEW_DRAG_MIME 的 HTML5 拖拽（换位拖拽走 mousedown，不触发）
  const [viewDropTarget, setViewDropTarget] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dropRef = useRef<{ id: string; pos: "top" | "bottom" } | null>(null);
  const wasDragRef = useRef(false); // 标记本次是否拖拽了——防止 onClick 误触发
  const barRef = useRef<HTMLDivElement>(null);

  /** 查找鼠标下的图标（壳 findTarget 同款；落点 = 整列——注记⑤） */
  const findTarget = (clientY: number, excludeId: string) => {
    const container = barRef.current;
    if (!container) return null;
    const buttons = container.querySelectorAll("[data-plugin-id]");
    for (const btn of buttons) {
      if (btn.getAttribute("data-plugin-id") === excludeId) continue;
      const rect = btn.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return {
          id: btn.getAttribute("data-plugin-id")!,
          pos: clientY < rect.top + rect.height / 2 ? DROP_POS_TOP : DROP_POS_BOTTOM,
        };
      }
    }
    return null;
  };

  // 窗口级 mousemove/mouseup——壳 IconBar 同一模式（5px 阈值防误触）
  const handleDragMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const dy = Math.abs(e.clientY - dragRef.current.startY);
    if (dy < 5) return;

    if (!dragRef.current.moved) {
      dragRef.current.moved = true;
      draggingRef.current = true;
      wasDragRef.current = true;
      setDraggedId(dragRef.current.pluginId);
    }

    const target = findTarget(e.clientY, dragRef.current.pluginId);
    dropRef.current = target;
    setPreviewPos({ x: e.clientX - 21, y: e.clientY - 21 }); // 42/2 居中（壳 -24 = 48/2）
    setDropTarget(target);
  }, []);

  const handleDragMouseUp = useCallback(() => {
    const drag = dragRef.current;
    const target = dropRef.current;
    draggingRef.current = false;
    if (!drag) return;

    if (drag.moved && target) {
      const ids = localIconsRef.current.map((x) => x.pluginId).filter((x) => x !== drag.pluginId);
      const targetIdx = ids.indexOf(target.id);
      const insertAt = target.pos === DROP_POS_TOP ? targetIdx : targetIdx + 1;
      ids.splice(Math.max(0, insertAt), 0, drag.pluginId);
      // 乐观本地——立即渲染新序；events 回环壳持久化 + 重推确认（真相源在壳）
      preDragOrderRef.current = localIconsRef.current.map((x) => x.pluginId); // 拖前序——回执对齐基准
      const byId = new Map<string, IconBarItem>(localIconsRef.current.map((x) => [x.pluginId, x]));
      setLocalIcons(ids.map((id) => byId.get(id)!));
      commitPendingRef.current = true; // 待回执——回执期忽略旧序推送（#13 同款）
      window.linkdesk?.events?.emit("icon:reordered", ids);
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

  // top/bottom 分列——switch 判别（eslint E5.5#10 规则拦 `=== "小写字面量"`，tag 判别用 switch 不误报）
  const topIcons: IconBarItem[] = [];
  const bottomIcons: IconBarItem[] = [];
  for (const item of localIcons) {
    switch (item.location) {
      case "top": topIcons.push(item); break;
      default: bottomIcons.push(item); break;
    }
  }

  const draggedIcon = draggedId ? localIcons.find((x) => x.pluginId === draggedId) : null;

  const renderIcon = (item: IconBarItem, isBottom: boolean) => {
    const showBefore = dropTarget?.id === item.pluginId && dropTarget.pos === DROP_POS_TOP;
    const showAfter = dropTarget?.id === item.pluginId && dropTarget.pos === DROP_POS_BOTTOM;
    return (
      <div key={item.pluginId} className="icon-bar-item-wrapper">
        {showBefore && <div className="icon-drop-indicator" />}
        <button
          className={`icon-btn${iconBar.activePluginId === item.pluginId ? " active" : ""}${draggedId === item.pluginId ? " dragging" : ""}${viewDropTarget === item.pluginId ? " view-drop-target" : ""}`}
          data-plugin-id={item.pluginId}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault(); // 阻止浏览器原生拖拽
            dragRef.current = { pluginId: item.pluginId, startY: e.clientY, moved: false };
          }}
          onClick={(e) => {
            if (wasDragRef.current) {
              wasDragRef.current = false;
              dragRef.current = null;
              return;
            }
            if (isBottom) {
              // 底部图标（齿轮）：对标 VS Code 左下齿轮——左键弹 ExtensionGear 菜单，不开标签
              // （壳 IconBar 同款语义；菜单含"打开设置"入口）
              e.preventDefault();
              setGearAnchor({ x: e.clientX, y: e.clientY });
              return;
            }
            // 壳侧消费方：壳 App 桥接 linkdesk.events.on → shellEvents → App 开标签（E5.7#6）
            window.linkdesk?.events?.emit("icon:selected", item.pluginId);
          }}
          onContextMenu={isBottom ? (e) => {
            // 右键同弹齿轮菜单（壳同款——顶部图标右键无菜单）
            e.preventDefault();
            setGearAnchor({ x: e.clientX, y: e.clientY });
          } : undefined}
          // E4V#48：视图拖放落点——仅响应携带自定义 MIME 的 HTML5 拖拽（换位拖拽走 mousedown 不触发）
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(VIEW_DRAG_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setViewDropTarget(item.pluginId);
          }}
          onDragLeave={() => {
            setViewDropTarget((cur) => (cur === item.pluginId ? null : cur));
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(VIEW_DRAG_MIME);
            setViewDropTarget(null);
            if (!raw) return;
            e.preventDefault();
            try {
              const payload = JSON.parse(raw) as { viewId?: string; fromContainerId?: string };
              if (payload.viewId && payload.fromContainerId) {
                // 壳 usePoolSync 解析目标插件首个容器（无 viewsContainers 声明则无动作）→ moveView + 重推
                window.linkdesk?.events?.emit("view:droppedOnIcon", {
                  viewId: payload.viewId,
                  fromContainerId: payload.fromContainerId,
                  toPluginId: item.pluginId,
                });
              }
            } catch {
              // 数据损坏忽略——壳侧无动作
            }
          }}
          title={item.label}
          aria-label={item.label}
        >
          <PoolPluginIcon icon={item.icon} className="icon-bar-plugin-icon" alt={item.label} />
        </button>
        {showAfter && <div className="icon-drop-indicator" />}
      </div>
    );
  };

  return (
    <div className="icon-bar" role="navigation" aria-label={iconBar.navLabel} ref={barRef}>
      <div className="icon-bar-top">
        {/* ☰ 汉堡——图标栏第一个位置（壳 HamburgerMenu；menuStyle hamburger/both 时可见） */}
        {iconBar.hamburgerVisible && iconBar.hamburger && (
          <>
            <button
              ref={hamburgerBtnRef}
              className={`hamburger-btn${hamburgerOpen ? " hamburger-open" : ""}`}
              onClick={() => setHamburgerOpen(!hamburgerOpen)}
              title={iconBar.hamburger.title}
              aria-label={iconBar.hamburger.title}
            >
              <span className="codicon codicon-menu" />
            </button>

            {/* 下拉——fixed 贴图标栏（top: 30px 避开拖拽区，硬约束 #18；WCV 满窗 = 窗口坐标） */}
            {hamburgerOpen && (
              <div className="hamburger-dropdown" ref={dropdownRef}>
                <MenuItemList groups={iconBar.hamburger.groups} onCommand={handleCommand} cssPrefix="hamburger" />
              </div>
            )}
          </>
        )}
        {topIcons.map((item) => renderIcon(item, false))}
      </div>
      <div className="icon-bar-bottom">{bottomIcons.map((item) => renderIcon(item, true))}</div>

      {/* 齿轮菜单——底部图标左键/右键 → ExtensionGear（壳 IconBar 同款；#14 ContextMenu 门户） */}
      {gearAnchor && (
        <ContextMenu
          menuId={"extensionGear"}
          anchor={gearAnchor}
          context={{}}
          onClose={() => { setGearAnchor(null); (document.activeElement as HTMLElement)?.blur(); }}
        />
      )}

      {/* 拖影——壳 IconBar 同款半透明跟随 */}
      {previewPos && draggedIcon && createPortal(
        <div
          className="icon-drag-preview"
          style={{ left: previewPos.x, top: previewPos.y }}
        >
          <PoolPluginIcon icon={draggedIcon.icon} className="icon-bar-plugin-icon" />
        </div>,
        document.body
      )}
    </div>
  );
}

export default IconBarZone;
