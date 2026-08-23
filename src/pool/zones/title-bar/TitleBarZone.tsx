/**
 * TitleBarZone——E5.7#5。标题栏 React Zone——壳 TitleBar + WindowControls 迁入池。
 *
 * 数据全部来自 layout.titleBar（壳侧已分组/展平/翻译/过滤——显示文本铁律）。
 * 池 = 哑渲染器：不评估 when、不 t()、不 import @src/core。
 *
 * 职责（设计 Zone分解设计.md §2.1）：
 *   - Logo（logoUrl——壳 getAssetPath 解析）
 *   - 左右槽位按钮（插件 contributes.titleBar，when 已壳侧过滤）
 *   - 菜单栏（menuBarVisible 条件渲染）——group 按钮 + fixed 下拉（WCV 满窗无裁剪，
 *     无需 OverlayPortal；下拉在 30px 拖拽区之下——硬约束 #18 满足）
 *   - 拖拽区（-webkit-app-region: drag）+ 按钮 no-drag
 *   - 窗口控制（─ □ ×）——window.linkdesk.window → 主进程
 *
 * 与壳行为差异（诚实注记）：
 *   ① 壳 TitleBar 不渲染 title 文本（仅 Logo）——零丢失照搬。
 *   ② 壳下拉无快捷键显示/无 when 灰显（checkWhen=false）——池同。
 *   ③ Alt 调出隐藏菜单栏——壳未实现，池也未实现（设计稿远期项）。
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { TitleBarLayout, TitleBarSlotButton } from "../../../core/types/pool/poolLayout";
import MenuItemList from "../../shared/menu-item-list/MenuItemList"; // E5.7#6：菜单项列表提取为池共享组件（汉堡复用）
import { executePoolCommand } from "../../commands/executePoolCommand"; // E5.7#6：命令执行提取为池共享（IconBarZone 复用）
import "./TitleBarZone.css";

/* ── TitleBarZone ── */

function TitleBarZone({ titleBar }: { titleBar: TitleBarLayout }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCommand = useCallback((command: string) => {
    setOpenGroup(null);
    executePoolCommand(command);
  }, []);

  /** 鼠标划过不同 group 按钮时自动切换下拉（壳 TitleBar 同款） */
  const handleButtonHover = useCallback(
    (group: string) => {
      if (openGroup && openGroup !== group) setOpenGroup(group);
    },
    [openGroup]
  );

  // 外部点击 + Escape 关闭（壳 OverlayPortal 的 backdrop click + Escape 同款语义）
  useEffect(() => {
    if (!openGroup) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const btn = btnRefs.current.get(openGroup);
      if (btn?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpenGroup(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openGroup]);

  // 窗口最大化状态——─ □ × 的 □/还原切换
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = window.linkdesk?.window;
    if (!win) return;
    win.isMaximized().then((m: boolean) => setMaximized(!!m)).catch(() => { /* 静默 */ });
    const unsub = win.onMaximizeChange?.((m: boolean) => setMaximized(!!m));
    return () => { unsub?.(); };
  }, []);

  // E5.8#46.18：窗口 OS 置顶状态——pin 按钮两态（钉上/解除）。与 maximized 同款：invoke 初始化 + 事件跟随
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const win = window.linkdesk?.window;
    if (!win) return;
    win.isAlwaysOnTop?.().then((p: boolean) => setPinned(!!p)).catch(() => { /* 静默 */ });
    const unsub = win.onAlwaysOnTopChange?.((p: boolean) => setPinned(!!p));
    return () => { unsub?.(); };
  }, []);

  const wc = titleBar.windowControls;
  const openItems = openGroup ? titleBar.menuGroups.find((g) => g.group === openGroup) : undefined;

  /** 槽位按钮渲染——left/right 共用（E5.8#1c 去重） */
  const renderSlotButton = (item: TitleBarSlotButton) => (
    <button
      key={item.command}
      className="titlebar-btn titlebar-slot-btn"
      onClick={() => executePoolCommand(item.command)}
      title={item.title}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {item.icon ? (
        <span className={`codicon ${item.icon}`} />
      ) : (
        <span className="codicon codicon-circle-outline" />
      )}
    </button>
  );

  /** 下拉定位——按钮 rect 下方（池 WCV 满窗，rect 即窗口坐标） */
  const dropdownStyle = (() => {
    if (!openGroup) return { display: "none" as const };
    const btn = btnRefs.current.get(openGroup);
    if (!btn) return { display: "none" as const };
    const rect = btn.getBoundingClientRect();
    return { position: "fixed" as const, top: rect.bottom, left: rect.left };
  })();

  return (
    <div className="titlebar">
      {/* Logo——URL 由壳 getAssetPath 解析推送 */}
      <img className="titlebar-logo" src={titleBar.logoUrl} alt="LinkDesk" />

      {/* 左槽位——插件 contributes.titleBar.left（when 已壳侧过滤） */}
      {titleBar.slots.left.map(renderSlotButton)}

      {/* 菜单按钮——hamburger 模式下隐藏（☰ 在 IconBarZone） */}
      {titleBar.menuBarVisible && titleBar.menuGroups.length > 0 && (
        <div className="titlebar-menus">
          {titleBar.menuGroups.map((g) => (
            <button
              key={g.group}
              ref={(el) => {
                if (el) btnRefs.current.set(g.group, el);
                else btnRefs.current.delete(g.group);
              }}
              className={`titlebar-btn titlebar-menu-btn${openGroup === g.group ? " titlebar-btn-open" : ""}`}
              onClick={() => setOpenGroup(openGroup === g.group ? null : g.group)}
              onMouseEnter={() => handleButtonHover(g.group)}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* 右槽位——插件 contributes.titleBar.right */}
      {titleBar.slots.right.map(renderSlotButton)}

      {/* 拖拽区——填充剩余空间 */}
      <div className="titlebar-drag-area" />

      {/* 窗口控制（pin ─ □ ×）——tooltip 壳 t() 推送；pin 置顶两态（E5.8#46.18：OS 级置顶，盖过其他应用） */}
      <div className="window-controls">
        <button
          className={`wc-btn wc-pin${pinned ? " wc-pin-active" : ""}`}
          onClick={() => {
            const win = window.linkdesk?.window;
            if (pinned) win?.setAlwaysOnTop(false);
            else win?.setAlwaysOnTop(true);
          }}
          title={pinned ? wc.unpin : wc.pin}
        >
          <span className={`codicon ${pinned ? "codicon-pinned" : "codicon-pin"}`} />
        </button>
        <button className="wc-btn" onClick={() => window.linkdesk?.window?.minimize()} title={wc.minimize}>
          <span className="codicon codicon-chrome-minimize" />
        </button>
        <button
          className="wc-btn"
          onClick={() => {
            const win = window.linkdesk?.window;
            if (maximized) win?.unmaximize();
            else win?.maximize();
          }}
          title={maximized ? wc.restore : wc.maximize}
        >
          <span className={`codicon ${maximized ? "codicon-chrome-restore" : "codicon-chrome-maximize"}`} />
        </button>
        <button className="wc-btn wc-close" onClick={() => window.linkdesk?.window?.close()} title={wc.close}>
          <span className="codicon codicon-chrome-close" />
        </button>
      </div>

      {/* 下拉面板——fixed 定位在按钮下方 */}
      {openGroup && openItems && (
        <div className="titlebar-dropdown" style={dropdownStyle} ref={dropdownRef}>
          <MenuItemList key={openGroup} items={openItems.items} onCommand={handleCommand} cssPrefix="titlebar" />
        </div>
      )}
    </div>
  );
}

export default TitleBarZone;
