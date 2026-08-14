/**
 * IconBarZone——E5.7#6。图标栏 React Zone——壳 IconBar + HamburgerMenu 迁入池。
 *
 * 数据全部来自 layout.iconBar（壳侧已排序/翻译/激活判定——显示文本铁律）。池 = 哑渲染器。
 *
 * 职责（设计 Zone分解设计.md §2.2）：
 *   - 图标按钮（垂直排列，42px 宽；top/bottom 分列——壳 getIconLocation 序列化为 location 字段）
 *   - 激活高亮（activePluginId——壳侧已算好：侧栏展开 + 活动容器属于该插件）
 *   - 点击 → window.linkdesk.events.emit("icon:selected", pluginId) → 主进程转发 → 壳开标签
 *   - 拖拽换位（#6 补丁 2026-08-14）——壳 IconBar 状态机迁入：乐观本地序 + mouseup
 *     emit icon:reordered → 壳持久化 iconOrder + 重推确认（#13 同款"乐观本地 + commit"模式，
 *     真相源在壳）。设计 §2.2"可选——远期"废止——零丢失铁律：壳已验证功能不得静默砍。
 *   - ☰ 汉堡（hamburgerVisible）——下拉分组菜单（壳 MenuRenderer showGroups+showKeybindings+checkWhen 语义）
 *
 * 与壳行为差异（诚实注记）：
 *   ② 底部齿轮左键/右键菜单（MenuId.ExtensionGear）——推迟 Phase 4 #14（ContextMenu 浮层门户）。
 *      过渡期点击齿轮无动作；设置视图仍可从 文件 → 打开设置 或命令面板到达。
 *   ③ 壳 icon-btn 48×48 在 42px 列内横向溢出——池按设计修正为 42×42（Zone分解设计.md:81）。
 *   ④ 壳汉堡子面板仅 2 层——池共享 MenuItemList 递归支持 N 层（实际菜单数据 ≤2 层，无感）。
 *   ⑤ 拖拽落点范围：壳只把 icon-bar-top 作目标容器（底部图标不可作落点——壳实现遗漏），
 *      池整列可作落点。换位语义不变（全序 splice），只是落点检测完整化。
 *   ⑥ E4V#48 跨容器拖放（文件树条目拖到图标栏 → 视图移入目标插件容器）未迁——drop 源是
 *      SectionStack（文件树，Phase 3 #10 SidebarZone 才迁池），池内无源无从触发；E5.7
 *      清单无此任务（与拖拽换位同类的静默丢失）。建议并入 #10 迁移——待用户定夺。
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { IconBarLayout, IconBarItem } from "../../core/types/poolLayout";
import MenuItemList from "../shared/MenuItemList";
import PoolPluginIcon from "../shared/PoolPluginIcon";
import { executePoolCommand } from "../shared/executePoolCommand";
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

function IconBarZone({ iconBar }: { iconBar: IconBarLayout }) {
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // 乐观本地序——壳是真相源：layout 推送到达时对齐壳序（拖拽期间忽略推送防闪跳——#13 isDragging 同款防护）
  const [localIcons, setLocalIcons] = useState<IconBarItem[]>(iconBar.icons);
  const localIconsRef = useRef(localIcons);
  localIconsRef.current = localIcons;
  const draggingRef = useRef(false);
  useEffect(() => {
    if (!draggingRef.current) setLocalIcons(iconBar.icons);
  }, [iconBar.icons]);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "top" | "bottom" } | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
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
      const byId = new Map<string, IconBarItem>(localIconsRef.current.map((x) => [x.pluginId, x]));
      setLocalIcons(ids.map((id) => byId.get(id)!));
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

  const renderIcon = (item: IconBarItem) => {
    const showBefore = dropTarget?.id === item.pluginId && dropTarget.pos === DROP_POS_TOP;
    const showAfter = dropTarget?.id === item.pluginId && dropTarget.pos === DROP_POS_BOTTOM;
    return (
      <div key={item.pluginId} className="icon-bar-item-wrapper">
        {showBefore && <div className="icon-drop-indicator" />}
        <button
          className={`icon-btn${iconBar.activePluginId === item.pluginId ? " active" : ""}${draggedId === item.pluginId ? " dragging" : ""}`}
          data-plugin-id={item.pluginId}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault(); // 阻止浏览器原生拖拽
            dragRef.current = { pluginId: item.pluginId, startY: e.clientY, moved: false };
          }}
          onClick={() => {
            if (wasDragRef.current) {
              wasDragRef.current = false;
              dragRef.current = null;
              return;
            }
            // 壳侧消费方：壳 App 桥接 linkdesk.events.on → shellEvents → App 开标签（E5.7#6）
            window.linkdesk?.events?.emit("icon:selected", item.pluginId);
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
        {topIcons.map(renderIcon)}
      </div>
      <div className="icon-bar-bottom">{bottomIcons.map(renderIcon)}</div>

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
