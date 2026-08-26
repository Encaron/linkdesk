/**
 * 共享 `<ContextMenu>` —— 统一右键菜单 UI 组件。
 *
 * E5#44d：支持子菜单——静态 children 或动态 resolveChildren 回调。
 * 对标 VS Code：hover 父项右侧弹出子面板，移开自动收回（150ms 延迟防闪烁）。
 *
 * 🔥 E5.5#7-p3 多 WebView 改造：零 import @src/core。
 *    壳侧 IpcBridgeHandler 已做 when 过滤 + 命令标题 + 快捷键解析，
 *    组件只管分组和渲染。
 *
 * 🔥 E5.7#14 浮层归一化（浮层归一化设计.md §4）：
 *    - portal 到 `#context-menu-root`（OverlayPortal rootId——FloatingLayerHost 内），
 *      壳 DOM 无此 root 时自动回退 body（SettingsView 等壳侧消费者迁移期兼容）
 *    - 透明 backdrop（contextMenu-1 层级）——吞掉第一击：点击即关且不激活下层内容；
 *      E5.8#92 variant="non-modal" 跳过 backdrop（点击穿透下层，修命中区漂移——14-档案 §七）
 *    - 显示文本铁律：标签壳侧 t() 解析后推送——池哑渲染，本组件不再调用 t()
 *    - 翻转钳制 menuTop ≥ 30——TitleBarZone drag 区（硬约束 18，设计 §4.3）
 *    - 打开后聚焦菜单容器——键盘导航（设计 §4.2，防 focusable:false 回归）
 */
import { useEffect, useMemo, useRef, useCallback, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { MenuItemDescriptor } from "@src/core/api/linkdesk-api";
import { Z_INDEX } from "../../../constants";
import OverlayPortal, { getScrimTarget } from "../overlay-portal/OverlayPortal";
import "./ContextMenu.css";

/* ── 辅助函数 ── */

function lk() {
  return window.linkdesk;
}

/* ── 类型 ── */

export interface ContextMenuProps {
  /** 菜单槽位——字符串 API 契约 */
  menuId: string;
  anchor: { x: number; y: number };
  /** 传给命令的上下文（when 过滤 + handler args） */
  context?: Record<string, unknown>;
  onClose: () => void;
  /**
   * E5#44d：动态子菜单解析器。
   * 当 menu item 声明 children: []（空数组）时调用此函数获取子项。
   * @param parentId 父菜单项的命令 ID（空字符串表示纯标签项）
   * @param ctx 同 context prop
   * @returns 子菜单项列表，或 undefined 表示无子项
   */
  resolveChildren?: (parentId: string, ctx: Record<string, unknown>) => Array<{ id: string; label: string }> | undefined;
  /**
   * E5.8#55：外部注入菜单项——顶部/汉堡下拉复用本渲染器（menuId 仅作标识，
   * 数据不走 menu.getItems IPC，布局快照 PoolMenuItem[] 转换后直接注入）。
   * 提供时跳过 getItems 拉取——壳侧布局已 when 过滤 + t() 翻译（显示文本铁律）。
   */
  items?: MenuItemDescriptor[];
  /** E5.8#55：浮层形态——两行为耦合成一词（B1 合并，2026-08-23 拍板）：
   *  - "overlay"（默认，右键/汉堡）：全屏透明 backdrop 吞第一击 + 点外部关闭（现状行为）。
   *  - "non-modal"（E5.8#92 设置行齿轮）：无 backdrop + 保留点外关闭——点击穿透下层元素
   *    （不吞首击）：gear 菜单开着真实点击色块 → 菜单关 + 取色器开（修命中区漂移，14-档案 §七）。
   *  - "embedded"（顶部菜单栏下拉）：无 backdrop + 点外关闭由宿主自管——菜单嵌在按钮行
   *    hover 切换交互里，backdrop 会吞掉按钮行第一击导致切换失效（硬约束 18 已钳制菜单 top≥30）。 */
  variant?: "overlay" | "non-modal" | "embedded";
}

// E5.7#97：原 EnrichedItem 本地类型整删——menu.getItems() 已按 LinkDeskAPI 契约定型
// （MenuItemDescriptor——壳侧已 when 过滤 + 标题翻译 + 快捷键解析后的最终形态），
// 直接消费，不再本地二次包装。

interface ResolvedItem {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  /** E5.8#37.7：当前项 √ 标记——壳侧 getItems 解析透传（面板位置/对齐命中项 + 视图显隐 visible） */
  checked?: boolean;
  /**
   * E5.8#37.7.1：每项命令载荷——壳侧 getItems 动态注入（面板视图清单 commandArgs=[containerId, viewId]）。
   * context 整菜单共享，per-item 身份只能走命令载荷：executeCommand(id, undefined, ...commandArgs, context)。
   */
  commandArgs?: unknown[];
  /** 子菜单项——有值则渲染为可展开项，hover 弹出子面板 */
  children?: ResolvedItem[];
}

/* ── 组件 ── */

export default function ContextMenu({ menuId, anchor, context, onClose, resolveChildren, items, variant }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 异步获取菜单项——壳侧已做 when 过滤 + 命令标题 + 快捷键解析 ── */
  const [rawItems, setRawItems] = useState<MenuItemDescriptor[]>([]);
  // 稳定 context 引用——避免对象引用变化导致无限重取
  const contextKey = useMemo(() => JSON.stringify(context ?? {}), [context]);

  useEffect(() => {
    let cancelled = false;
    // E5.8#55：外部注入 items → 布局快照直接渲染（跳过 IPC 拉取）
    if (items) {
      setRawItems(items);
      return () => { cancelled = true; };
    }
    lk().menu?.getItems?.(menuId, context).then((raw) => {
      if (!cancelled && raw) setRawItems(raw);
    }).catch(() => {
      // 菜单获取失败 → 不显示项，静默处理
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId, contextKey, items]);

  /* ── 菜单项解析（分组 + 分隔线）── */
  const resolved = useMemo((): Array<ResolvedItem | { type: "divider"; group: string }> => {
    const grouped = new Map<string, ResolvedItem[]>();
    const groupOrder: string[] = [];

    for (const item of rawItems) {
      const rawChildren = item.children;
      // 有 children 的父项放行（即使 command 为空）
      if (!item.command && !rawChildren) continue;

      const group = item.group ?? "__default";
      if (!grouped.has(group)) { grouped.set(group, []); groupOrder.push(group); }

      // 子菜单：静态 children 透传 / 空 children 调 resolveChildren 动态填充
      let children: ResolvedItem[] | undefined;
      if (rawChildren && rawChildren.length > 0) {
        // E5.7#98：wire 契约 children 是 string | MenuItemDescriptor 联合——
        // 字符串 = 命令引用原样透传（IpcBridgeHandler 序列化注释同义）。
        // E5.8#37.7：checked 壳侧 getItems 解析透传（位置/对齐当前项 √ + 视图显隐 visible）。
        // E5.8#37.7.1：commandArgs 同步透传——子项同样可带命令载荷。
        children = rawChildren.map((c) =>
          typeof c === "string"
            ? { id: c, label: c, group }
            : { id: c.command, label: c.label ?? c.command, group, checked: c.checked, commandArgs: c.commandArgs },
        );
      } else if (rawChildren && rawChildren.length === 0 && resolveChildren) {
        const dyn = resolveChildren(item.command, context ?? {});
        if (dyn && dyn.length > 0) {
          children = dyn.map((c) => ({ id: c.id, label: c.label, group }));
        }
      }

      grouped.get(group)!.push({
        id: item.command || item.label || "",
        // E5.8#37.7.1：label 优先于命令 title——菜单项显式 label 是槽位显示文本（如 when 门控的
        // 「移动到右侧/左侧」、面板视图清单的视图名）；命令 title 只是无 label 时的兜底
        // （修复 #37.6 侧栏换边菜单项被命令 title「切换侧栏位置」遮蔽的潜在 bug）。
        label: item.label ?? item.title ?? item.command,
        group,
        shortcut: item.shortcut,
        checked: item.checked,
        commandArgs: item.commandArgs,
        children,
      });
    }

    const result: Array<ResolvedItem | { type: "divider"; group: string }> = [];
    for (let i = 0; i < groupOrder.length; i++) {
      if (i > 0) result.push({ type: "divider", group: groupOrder[i] });
      result.push(...grouped.get(groupOrder[i])!);
    }
    return result;
  }, [rawItems, context, resolveChildren]);

  /* ═══ E5#44d：hover 子菜单状态 ═══ */
  const [subData, setSubData] = useState<{ x: number; y: number; items: ResolvedItem[] } | null>(null);

  /* ── E5#94a：两阶段渲染状态（声明提前——活跃守卫 visible 依赖）── */
  const [menuPos, setMenuPos] = useState({ left: anchor.x, top: anchor.y });
  const [menuReady, setMenuReady] = useState(false);

  /* ── E5.7#100：活跃守卫——入场动画完成前菜单 visibility:hidden 不可交互，
        窗口级监听器同态挂载，防"隐藏但挂载"态回调泄漏（硬约束 14，#59c Bug 2）── */
  const visible = menuReady;

  /* ── 统一失焦 ── */
  useEffect(() => {
    if (!visible) return; // 活跃守卫——菜单未显示时不挂失焦监听
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (subData) setSubData(null); else onClose(); } };
    const onBlur = () => onClose();
    const onWheel = () => onClose();
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !subRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("wheel", onWheel, true);
    // E5.8#55：variant="embedded"（顶部菜单栏）不挂 mousedown——
    // 外部点击关闭由 TitleBarZone 自己管理（豁免 group 按钮行，保留 hover 切换）
    if (variant !== "embedded") window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("wheel", onWheel, true);
      if (variant !== "embedded") window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [onClose, subData, visible, variant]);

  /* ── 键盘导航 ── */
  const [focusIdx, setFocusIdx] = useState(-1);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const clickableItems = useMemo(() => resolved.filter((r) => !("type" in r)) as ResolvedItem[], [resolved]);

  useEffect(() => {
    if (!visible) return; // 活跃守卫——菜单未显示时不挂键盘导航
    const onKeyNav = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((prev) => Math.min(prev + 1, clickableItems.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((prev) => Math.max(prev - 1, 0)); }
      else if (e.key === "Enter" && focusIdx >= 0) {
        e.preventDefault();
        const item = clickableItems[focusIdx];
        // E5.8#37.7.1：命令载荷透传——executeCommand(id, undefined, ...commandArgs, context)，
        // 池 preload 剥 token 后原样转发 → 壳 handler 收 args = [...commandArgs, context]。
        if (item) { lk().commands?.executeCommand?.(item.id, undefined, ...(item.commandArgs ?? []), context); onClose(); }
      }
    };
    window.addEventListener("keydown", onKeyNav);
    return () => window.removeEventListener("keydown", onKeyNav);
  }, [clickableItems, focusIdx, context, onClose, visible]);

  useEffect(() => {
    if (focusIdx >= 0) itemRefs.current.get(focusIdx)?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  /* ── 命令执行 ── */
  // E5.8#37.7.1：整项传入（非 commandId）——载荷 commandArgs 随执行透传（context 共享，
  // per-item 身份走命令载荷：executeCommand(id, undefined, ...commandArgs, context)）。
  const handleItemClick = useCallback(async (item: ResolvedItem) => {
    onClose();
    await lk().commands?.executeCommand?.(item.id, undefined, ...(item.commandArgs ?? []), context);
  }, [context, onClose]);

  /* ── 视口自适应（E5#94a：两阶段渲染——先隐藏量测真实 DOM 尺寸再修正位置）── */
  useLayoutEffect(() => {
    // E5.7#14：初始定位即钳制 menuTop ≥ 30（TitleBarZone drag 区下沿——硬约束 18）
    setMenuPos({ left: anchor.x, top: Math.max(30, anchor.y) });
    setMenuReady(false);
  }, [anchor.x, anchor.y, resolved.length]);

  /* ── 入场动画 + 定位修正 ── */
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    // 1. 量测真实尺寸 + 修正溢出
    const rect = el.getBoundingClientRect();
    let left = anchor.x;
    // E5.7#14：翻转钳制 menuTop ≥ 30——菜单顶部进入 TitleBarZone drag 区
    // → OS 截鼠标事件 → 顶部菜单项点不动（设计 §4.3，硬约束 18）
    let top = Math.max(30, anchor.y);
    if (left + rect.width > window.innerWidth) left = Math.max(0, window.innerWidth - rect.width - 4);
    if (top + rect.height > window.innerHeight) top = Math.max(30, window.innerHeight - rect.height - 4);
    setMenuPos({ left, top });
    // 2. 入场动画
    const frame = requestAnimationFrame(() => {
      setMenuReady(true);
      el.classList.add("show");
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor.x, anchor.y, resolved.length]);

  /* ── E5.7#14：打开后聚焦菜单容器——键盘导航（visibility 转可见后再 focus，
      否则 focus() 静默失败；menuReady 已在入场动画 rAF 内置 true）── */
  useEffect(() => {
    if (menuReady) menuRef.current?.focus();
  }, [menuReady]);

  /* ═══ E5#44d：hover 子菜单 handler ═══ */
  const openSub = useCallback((el: HTMLElement, items: ResolvedItem[]) => {
    if (subTimer.current) { clearTimeout(subTimer.current); subTimer.current = null; }
    const r = el.getBoundingClientRect();
    // E5#94b：子菜单方向跟随可用空间——右边放不下就放左边
    const subEstW = 160;
    const x = r.right + subEstW > window.innerWidth ? r.left - subEstW - 4 : r.right + 4;
    setSubData({ x, y: r.top, items });
  }, []);

  const closeSubDelayed = useCallback(() => {
    subTimer.current = setTimeout(() => setSubData(null), 150);
  }, []);

  /* ── 渲染 ── */
  let clickableIdx = 0;

  return (
    <OverlayPortal rootId="context-menu-root" zIndex={String(Z_INDEX.contextMenu)}>
      {/* E5.7#14：透明 backdrop——吞掉第一击（VS Code 行为）：点击即关且不激活下层内容。
          层级 = contextMenu-1，与菜单本体同 wrapper stacking context 内比较。
          窗口级 mousedown 监听（下方"统一失焦"）已处理 backdrop 点击关闭。
          pointer-events 不在此写——池侧由 #context-menu-root 根级提供（补丁 2026-08-14）。
          E5.8#107 浮层权威：归 #ld-scrim-plane（遮罩平面，无磨砂）——满屏遮罩与 surface 分离，
          结构隔离地板 :not(#ld-scrim-plane) 天然不碰它。menuRef/subRef contains 守卫不受影响
          （backdrop 不在 ref 内 → mousedown 点遮罩照常 onClose）。
          E5.8#55：variant="embedded" 时跳过——顶部菜单栏下拉点按钮行 hover 切换，
          无需全屏吞击（吞了按钮行第一击 hover 切换失效）。
          E5.8#92：variant="non-modal" 时跳过——设置行齿轮轻量菜单不吞首击（根因修：
          backdrop 在 mousedown 与 mouseup 间移除 → click 落 body → 每次 gear/右键后首击被吞）；
          无 backdrop = 点击穿透原目标（mousedown 关菜单、click 照常落色块开取色器）。 */}
      {variant !== "embedded" && variant !== "non-modal" && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: Z_INDEX.contextMenu - 1,
          }}
        />,
        getScrimTarget()
      )}

      {/* 主菜单 */}
      <div
        ref={menuRef}
        className="ctx-menu"
        tabIndex={-1}
        style={{
          left: menuPos.left,
          top: menuPos.top,
          zIndex: Z_INDEX.contextMenu,
          visibility: menuReady ? undefined : "hidden",
        }}
      >
        {resolved.map((item, i) => {
          if ("type" in item) return <div key={`div-${i}`} className="ctx-divider" />;
          const idx = clickableIdx++;
          const hasKids = !!(item.children && item.children.length > 0);
          const isFocused = idx === focusIdx;
          const isDanger = item.group === "delete";

          return (
            // E5.8#37.7.1：复合 key——共享命令 id 的动态项（面板视图清单全用同一 toggle 命令）会撞 key；
            // 并入数组索引消歧（菜单项在菜单生命周期内静态，索引稳定）。
            <div
              key={`${item.id}::${i}`}
              ref={(el) => { if (el) itemRefs.current.set(idx, el); else itemRefs.current.delete(idx); }}
              className={`ctx-item${isFocused ? " focused" : ""}${isDanger ? " ctx-item-danger" : ""}`}
              onClick={(e) => { e.stopPropagation(); if (!hasKids) handleItemClick(item); }}
              onMouseEnter={(e) => {
                setFocusIdx(idx);
                if (hasKids) openSub(e.currentTarget as HTMLElement, item.children!);
              }}
              onMouseLeave={() => { if (hasKids) closeSubDelayed(); }}
            >
              {/* E5.7#14：显示文本铁律——壳侧 t() 解析后推送，池哑渲染原文（不初始化 i18n） */}
              {/* E5.8#37.7：当前项 √——固定宽占位保证选中项标签不错位（VS Code 菜单同款） */}
              <span className="ctx-item-check" aria-hidden="true">{item.checked ? "✓" : ""}</span>
              <span className="ctx-item-label">{item.label}</span>
              {hasKids && <span className="ctx-item-chevron">›</span>}
              {item.shortcut && <span className="ctx-item-shortcut">{item.shortcut}</span>}
            </div>
          );
        })}
      </div>

      {/* 子面板——独立于主菜单，避免 overflow 裁切 */}
      {subData && (
        <div
          ref={subRef}
          className="ctx-menu show"
          style={{ left: subData.x, top: subData.y, zIndex: Z_INDEX.contextMenu }}
          onMouseEnter={() => { if (subTimer.current) { clearTimeout(subTimer.current); subTimer.current = null; } }}
          onMouseLeave={closeSubDelayed}
        >
          {subData.items.map((child, ki) => (
            <div key={ki} className="ctx-item" onClick={(e) => { e.stopPropagation(); handleItemClick(child); }}>
              <span className="ctx-item-check" aria-hidden="true">{child.checked ? "✓" : ""}</span>
              <span className="ctx-item-label">{child.label}</span>
            </div>
          ))}
        </div>
      )}
    </OverlayPortal>
  );
}
