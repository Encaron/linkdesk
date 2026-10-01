/**
 * GroupTabBar——E5.6#16.5。
 *
 * MainPool 内的标签栏。每个 group 自包含——GroupPane 内部渲染自己的 TabBar。
 * 所有写操作走 pool.tabAction() → IPC → 壳 useTabManager → pushLayout 回环。
 *
 * 对标壳 TabBar.tsx（431 行）的核心功能：
 * - 标签页渲染（图标/标题/dirty dot/固定状态）
 * - 点击切标签页 / [×] 关闭 / 中键关闭
 * - 拖拽排序——乐观更新 + 松手 IPC
 * - overflow 折叠——滚动箭头
 * - 右键菜单——壳 ContextMenu 归一化（menuId="TabContext"），池零菜单逻辑
 * - [+] 新建标签页按钮
 *
 * 🔴 不包含（留在壳 TabBar）：
 * - 跨 group 拖拽分屏（MainRenderer 负责）
 * - 拖到其他 group（MainRenderer 负责）
 * - createPortal 拖拽预览（池 DOM 内 float div 替代）
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { PoolTab } from "../../../core/types/pool/poolLayout";
import type { PoolTabAction } from "../../../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约
import type { LinkDeskAPI } from "../../../core/api/linkdesk-api"; // E5.7#98：pool 命名空间契约类型
import { normalizePath } from "../../../core/utils/path/pathUtils";
import ContextMenu from "@src/components/shared/context-menu/ContextMenu";
import OverlayPortal from "../../../components/shared/overlay-portal/OverlayPortal"; // E5.8#107 浮层权威：PlusMenu 进 #overlay-root
import { Z_INDEX } from "../../../constants"; // E5.8#107：裸 1001 → Z_INDEX 常量（禁裸数字）
import PoolPluginIcon from "../pool-plugin-icon/PoolPluginIcon"; // E6#69g：标签图标哑渲染判别联合（codicon/img/emoji/lucide）
import { revealDelta } from "./revealActiveTab"; // 04「标签栏内容自适应」：活动标签滚入视野的纯增量
import { executePoolCommand } from "../../commands/executePoolCommand"; // W4b：「+」菜单「欢迎页」末项走命令派发
import "./GroupTabBar.css";

// ═══════════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════════

interface GroupTabBarProps {
  groupId: string;
  tabs: PoolTab[];
  activeTabId: string;
  /** E5.6#16.7：拖拽中的标签页 ID——MainRenderer 全局协调 */
  draggingId?: string;
  /** E5.6#16.7：拖拽插入位置——显示 drop indicator 的位置 */
  dragInsertIndex?: number | null;
  /** E5.6#16.7：用户 mousedown → MainRenderer 接管拖拽 */
  onTabDragStart?: (tabId: string, index: number, e: ReactMouseEvent) => void;
  /** E5.6#16.7：TabBar DOM 挂载/卸载 → MainRenderer 记录 bounding rect */
  onTabBarMount?: (el: HTMLDivElement | null) => void;
  /** E5.6#16.7k-3：可创建为标签页的视图——[+] 按钮下拉菜单 */
  creatableViews?: { pluginId: string; label: string }[];
  /** E5.8#46.10：吸附插入缝隙（跨窗拖拽命中本组 TabBar——壳下发 viewport，池算缝隙）——两 tab 间渲染细竖线
   *  （VS Code 式插入指示，替代原整条 `tab-bar-adsorb` 高亮——归属随竖线落在哪个标签栏自然清晰）。父层已按组解析（非本组传 null） */
  adsorbInsertIndex?: number | null;
}

// ═══════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════

/** 去歧义标签名——同名文件加父目录后缀（对标 VS Code） */
function disambiguateLabels(tabs: PoolTab[]): Map<string, string> {
  const result = new Map<string, string>();
  const countByLabel = new Map<string, number>();
  for (const t of tabs) countByLabel.set(t.title, (countByLabel.get(t.title) ?? 0) + 1);
  for (const t of tabs) {
    // ⛔ 读 `hint`（壳给的人看的来源——**真文件标签**才有值 = 完整路径），不读 `sourceId`：
    //   sourceId 是功能键，插件标签上是 `settings-2` 这类内部 id——单段取不到父目录虽不显形，
    //   但插件 id 里含 `/` 时会把一个无意义的「父段」印进**可见标签名**（2026-09-27 同案收口）
    if ((countByLabel.get(t.title) ?? 0) <= 1 || !t.hint) {
      result.set(t.id, t.title);
      continue;
    }
    const parts = normalizePath(t.hint).split("/").filter(Boolean);
    const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
    result.set(t.id, parent ? `${t.title} • ${parent}/` : t.title);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════════════════════════════

export default function GroupTabBar({ groupId, tabs, activeTabId, draggingId, dragInsertIndex, onTabDragStart, onTabBarMount, creatableViews, adsorbInsertIndex }: GroupTabBarProps) {
  // ── i18n ──
  const { t } = useTranslation();

  // ── 池 API 引用（E5.7#98：LinkDeskAPI["pool"] 契约类型替代 any）──
  const poolApiRef = useRef<NonNullable<LinkDeskAPI["pool"]> | null>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = window.linkdesk?.pool ?? null;
  }
  const poolApi = poolApiRef.current;

  const tabAction = useCallback(
    (action: PoolTabAction) => {
      poolApi?.tabAction?.(action);
    },
    [poolApi],
  );

  // ── E5.6#16.7k：右键菜单归一化——壳 ContextMenu，menuId="TabContext" ──
  // 壳 coreCommands.ts 已注册 TabContext 菜单项（close/closeOthers/closeRight/closeAll/splitDown/splitRight/duplicate/togglePin）。
  // 池不再硬编码菜单项——ContextMenu 通过 lk.menu.getItems("TabContext") 获取壳 MenuRegistry。
  // E5.8#39.5 子项 C：anchor 携带 pluginId——右键标签页的插件身份随 context 传给壳 menu:getItems
  // （I8-3 声明即出现：壳侧据此查该插件是否声明 contributes.floatingPanel → 动态注入「在悬浮面板中打开」）。
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ x: number; y: number; tabId: string; pluginId: string } | null>(null);

  // ── E5.6#16.7k-3：PlusMenu [+] 按钮下拉 ──
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [plusMenuPos, setPlusMenuPos] = useState<{ x: number; y: number } | null>(null);
  // 触发锚 = [+] 按钮（OverlayPortal triggerRef——点击按钮 toggle 关闭，E5.8#107）
  const plusBtnRef = useRef<HTMLButtonElement | null>(null);
  const labels = useMemo(() => disambiguateLabels(tabs), [tabs]);

  // ── Overflow 检测 ──
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOverflowLeft(el.scrollLeft > 2);
    setOverflowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    el.addEventListener("scroll", checkOverflow, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", checkOverflow);
    };
  }, [checkOverflow, tabs.length]);

  const scrollTabs = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  // ── 滚轮横向滚动（04「标签栏内容自适应」判据写死：纵向滚轮→横向滚；横向滚轮走原生 deltaX；
  //    Ctrl+滚轮不拦截——字号缩放优先）──
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) return;
    if (!scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  }, []);

  // ── 活动标签自动滚入视野（04「标签栏内容自适应」配套：切/键盘切/新开（落最右）/关闭后邻居上位，
  //    全部经 activeTabId 变化汇入这一个 effect——不含无关 tabs 重排，用户手滚的位置不被拽走）。
  //    位置用 rect 差值不用 offsetLeft——item 外的 display:contents wrapper 让 offsetParent 不可靠
  //    （见 revealActiveTab.ts 头注）。reduced-motion 下退化为瞬时跳转。──
  useEffect(() => {
    const list = scrollRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`);
    if (!el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = revealDelta(
      list.scrollLeft,
      list.clientWidth,
      elRect.left - listRect.left + list.scrollLeft,
      elRect.width,
    );
    if (delta === 0) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: list.scrollLeft + delta, behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeTabId]);

  // ── 拖拽到可视区边缘自动滚动（04 配套 3：标签变宽后目标位可能落在屏外——不自动滚拖不过去也看不见）。
  //    指针停在边缘区即持续滚（rAF 循环），离开边缘区/拖出列表即停；拖拽结束（draggingId 清空）整组拆除。──
  useEffect(() => {
    if (!draggingId) return; // 活跃守卫（硬约束 14）
    const list = scrollRef.current;
    if (!list) return;
    const EDGE_PX = 32; // 距左右缘多宽算「边缘区」
    const SPEED_PX = 10; // 每帧滚动的像素（rAF ~60fps ⇒ ~600px/s）
    let raf = 0;
    let speed = 0;
    const tick = (): void => {
      if (speed !== 0) list.scrollLeft += speed;
      raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent): void => {
      const rect = list.getBoundingClientRect();
      const inside = e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right;
      if (!inside) {
        speed = 0;
        return;
      }
      if (e.clientX < rect.left + EDGE_PX) speed = -SPEED_PX;
      else if (e.clientX > rect.right - EDGE_PX) speed = SPEED_PX;
      else speed = 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [draggingId]);

  // ── 右键菜单——壳 ContextMenu 接管（menuId="TabContext"），池不再硬编码菜单项。
  // ContextMenu 自带 mousedown 外部点击检测（contains 守卫）+ E5.7#14 backdrop 吞第一击
  // ——不需要池侧 useEffect 关闭逻辑。对标壳 ContextMenu.tsx:152。

  // PlusMenu 外部点击/Escape 关闭——E5.8#107 由 OverlayPortal onClose 统一处理（triggerRef=[+] 按钮豁免）

  const onContextMenu = useCallback(
    (tabId: string, pluginId: string, e: ReactMouseEvent) => {
      e.preventDefault();
      setContextMenuAnchor({ tabId, pluginId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  // E5.6#16.7：拖拽状态由 MainRenderer 全局管理——此组件只做视觉渲染
  // draggingId / dragInsertIndex 从 props 读

  // ── Enter / Exit 动画已整删（04「标签栏开关联动动画」，2026-09-27 用户拍板）──
  // 原为 150ms 展开（entering）/ 120ms 收缩（exiting）两段 max-width 动画。用户实测两个坏效果：
  // ① 预览替换（点新文件顶掉斜体标签）时——旧格瞬失、新格从 0 长回，后面的标签先左移再右移，
  //    「猛的缩口再猛的拓回」；② 关闭时后面标签跟着 120ms 滑动补位。而状态层（reduceCreateTab
  //    Step 3）本就是原位替换、关后补位也只需一帧——动画是唯一的元凶，删掉即「直接替换／瞬时开关」。
  // 焦点语义的 120ms 等待随之退役：beforeClose 确认一过立即发 IPC。

  const barRef = useRef<HTMLDivElement | null>(null);

  // E5.6#16.7：通知 MainRenderer TabBar DOM 挂载/卸载——用于拖拽 bounding rect 检测
  const onMountRef = useRef(onTabBarMount);
  onMountRef.current = onTabBarMount;
  const setBarRef = useCallback((el: HTMLDivElement | null) => {
    barRef.current = el;
    onMountRef.current?.(el);
  }, []);

  // ── 关闭（无动画——04 拍板「瞬时关闭」）──
  // E5.8#30.16（P8）：先 await 通用 beforeClose 可取消通道（插件 handler 否决则标签页/串口双保留）→
  // 立即发 IPC 关闭（原 120ms exit 动画等待已随动画整删）。closingRef 防重入：beforeClose 弹确认
  // 进行中，同标签页的二次关闭点击直接忽略（确认后 closePort 恰好一次）。
  const closingRef = useRef(new Set<string>());
  const handleClose = useCallback(
    async (tab: PoolTab, e?: ReactMouseEvent) => {
      e?.stopPropagation();
      if (closingRef.current.has(tab.id)) return;
      closingRef.current.add(tab.id);
      try {
        const allowed = await poolApi?.beforeClose?.(tab.pluginId, tab) ?? true;
        if (!allowed) return;
        tabAction({ action: "closeTab", tabId: tab.id });
      } finally {
        closingRef.current.delete(tab.id);
      }
    },
    [poolApi, tabAction],
  );

  // ── 渲染 ──

  // 无标签页——不渲染 TabBar（空 group 由 MainRenderer 处理）
  if (tabs.length === 0) return null;

  return (
    <div
      className="ldk-group-tab-bar"
      ref={setBarRef}
    >
      {/* 左滚动箭头 */}
      {overflowLeft && (
        <button
          className="ldk-group-tab-scroll-arrow group-tab-scroll-left"
          onClick={() => scrollTabs(-200)}
        >
          <span className="codicon codicon-chevron-left" />
        </button>
      )}

      {/* 标签页列表 */}
      <div
        className="ldk-group-tab-list"
        ref={scrollRef}
        onWheel={onWheel}
        onScroll={checkOverflow}
        role="tablist"
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isDragging = draggingId === tab.id;

          return (
            <div key={tab.id} style={{ display: "contents" }}>
              {/* 拖拽插入指示器——E5.6#16.7：props 驱动 */}
              {dragInsertIndex === idx && draggingId !== tab.id && (
                <div className="ldk-group-tab-drop-indicator" />
              )}
              {/* E5.8#46.10：跨窗吸附插入指示竖线（替代原整条 tab-bar-adsorb 高亮）——壳下发缝隙，父层按组解析。
                  本地拖拽与被动吸附不同时发生（壳排除源窗），两指示器恒不同帧生效 */}
              {adsorbInsertIndex === idx && (
                <div className="ldk-group-tab-drop-indicator" />
              )}
              {/* tooltip 文案：壳推的 `hint`（文件标签 = 完整路径）优先，否则标签名（未固定时带「双击固定」）。
                  ⛔ 不许用 tab.sourceId——它是跨组移动/事件寻址/插件绑数据的功能键，插件标签上会是
                  settings-2 / serial-monitor-49 这类内部 id（2026-09-27 曾原样印在 tooltip 上） */}
              <div
                data-tab-id={tab.id}
                className={`ldk-group-tab-item${isActive ? " active" : ""}${isDragging ? " dragging" : ""}${!tab.pinned ? " preview" : ""}`}
                data-hint={tab.hint ?? (tab.pinned ? tab.title : `${tab.title} — ${t("双击固定")}`)} data-hint-delay="0"
                onClick={() => {
                  tabAction({ action: "focusTab", tabId: tab.id });
                  // E5.7 fix（2026-08-16）：点击标签 → 该编辑器获焦（VS Code 语义）。
                  // 点已激活标签不翻转 isActive → EditorView 激活 focus effect 不触发，
                  // 分屏下焦点留在另一组编辑器里，Ctrl+S（Monaco 局部键位）打到错实例
                  // ——保存错文件。池内事件直达编辑器插件（EditorTab 订阅，匹配 tabId）。
                  // 点未激活标签时此事件早于 pushLayout 到达（display:none 中 focus 无害
                  // no-op），随后 isActive 翻转的 effect 兜底。
                  window.linkdesk?.events?.emit("tab:focusRequested", { tabId: tab.id });
                }}
                onDoubleClick={() => tabAction({ action: "pinTab", tabId: tab.id })}
                onContextMenu={(e) => onContextMenu(tab.id, tab.pluginId, e)}
                onMouseDown={(e) => {
                  // 中键关闭
                  if (e.button === 1) {
                    e.preventDefault();
                    handleClose(tab);
                    return;
                  }
                  // 左键拖拽——E5.6#16.7：交 MainRenderer 全局协调。
                  // singleton 只管打开时去重，不阻止拖拽分屏（分屏=移动，不是复制）。
                  if (e.button === 0) {
                    onTabDragStart?.(tab.id, idx, e);
                  }
                }}
              >
                {/* dirty dot */}
                {tab.dirty && <span className="ldk-group-tab-dirty-dot" />}

                {/* 图标——IconBarIcon 判别联合（E6#69g：文件标签 codicon/img、视图标签 Type-2 img 等）
                    池侧哑渲染；img 禁原生拖拽（PoolPluginIcon draggable=false） */}
                {tab.icon && <PoolPluginIcon icon={tab.icon} className="ldk-group-tab-icon" />}

                {/* 标签文字 */}
                <span className="ldk-group-tab-label">{labels.get(tab.id) ?? tab.title}</span>

                {/* 关闭按钮——仅 blocked 不显示。singleton 只管打开时去重，不管关闭 */}
                {tab.closeBehavior !== "blocked" && (
                  <button
                    className="ldk-group-tab-close"
                    onClick={(e) => handleClose(tab, e)}
                    data-hint={t("关闭")}
                    aria-label={t("关闭")}
                  >
                    <span className="codicon codicon-close" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* 末尾插入指示器 */}
        {dragInsertIndex === tabs.length && (
          <div className="ldk-group-tab-drop-indicator" />
        )}
        {/* E5.8#46.10：吸附竖线——末尾缝隙（落到最后一个标签之后） */}
        {adsorbInsertIndex === tabs.length && (
          <div className="ldk-group-tab-drop-indicator" />
        )}

        {/* 右滚动箭头 */}
        {overflowRight && (
          <button
            className="ldk-group-tab-scroll-arrow group-tab-scroll-right"
            onClick={() => scrollTabs(200)}
          >
            <span className="codicon codicon-chevron-right" />
          </button>
        )}

        {/* [+] PlusMenu——E5.6#16.7k-3：壳推送 creatableViews 时显示动态列表，否则兜底欢迎页。
            E5.8#107：触发锚 = 本按钮（ref + toggle——再点收起，OverlayPortal onClose 替代手动 mousedown） */}
        <button
          ref={plusBtnRef}
          className="ldk-group-tab-plus-btn"
          onClick={(e) => {
            if (showPlusMenu) {
              setShowPlusMenu(false);
              return;
            }
            if (creatableViews && creatableViews.length > 0) {
              const btnRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setPlusMenuPos({ x: btnRect.left, y: btnRect.bottom + 4 });
              setShowPlusMenu(true);
            } else {
              tabAction({ action: "createTab" });
            }
          }}
          data-hint={t("新建标签页")}
          aria-label={t("新建标签页")}
        >
          +
        </button>

        {/* PlusMenu 下拉——动态列出可创建视图。E5.8#107 浮层权威：OverlayPortal 进 #overlay-root（单一门），
            z-index 走 Z_INDEX.contextMenu 常量（裸 1001 删）——禁裸数字（#26 常量表）。 */}
        {showPlusMenu && plusMenuPos && creatableViews && creatableViews.length > 0 && (
          <OverlayPortal onClose={() => setShowPlusMenu(false)} triggerRef={plusBtnRef}>
          <div
            className="ldk-group-tab-plus-menu"
            style={{
              position: "fixed",
              left: plusMenuPos.x,
              top: plusMenuPos.y,
              zIndex: Z_INDEX.contextMenu,
            }}
          >
            {creatableViews.map((v) => (
              <button
                key={v.pluginId}
                className="ldk-group-tab-plus-menu-item"
                onClick={() => {
                  tabAction({ action: "createTab", pluginId: v.pluginId });
                  setShowPlusMenu(false);
                }}
              >
                {v.label}
              </button>
            ))}
            {/* W4b：「+」菜单末项——分隔线＋「欢迎页」固定入口。菜单面纯文字（用户拍板，无图标）；
                走命令派发不直调 tabAction——菜单语义归一（入口可多处，命令源唯一，与帮助菜单同落点）。 */}
            <div className="ldk-group-tab-plus-menu-sep" role="separator" />
            <button
              className="ldk-group-tab-plus-menu-item"
              onClick={() => {
                executePoolCommand("app.openWelcome"); // 命令 id 唯一源 = 壳 welcomeCommands.ts OPEN_WELCOME_COMMAND_ID
                setShowPlusMenu(false);
              }}
            >
              {t("欢迎页")}
            </button>
          </div>
          </OverlayPortal>
        )}
      </div>

      {/* E5.6#16.7k：右键菜单归一化——壳 ContextMenu，menuId="TabContext"。
           壳 coreCommands.ts 注册菜单项，MenuRegistry 存储，池通过 lk.menu.getItems() 查询。
           ContextMenu 自带 mousedown contains 守卫、视口自适应、键盘导航——池零菜单逻辑。 */}
      {contextMenuAnchor && (
        <ContextMenu
          menuId={"tabContext"}
          anchor={contextMenuAnchor}
          context={{ tabId: contextMenuAnchor.tabId, groupId, pluginId: contextMenuAnchor.pluginId }}
          onClose={() => setContextMenuAnchor(null)}
        />
      )}

    </div>
  );
}
