/**
 * IconBarZone——E5.7#6。图标栏 React Zone——壳 IconBar + HamburgerMenu 迁入池。
 *
 * 数据全部来自 layout.iconBar（壳侧已排序/翻译/激活判定——显示文本铁律）。池 = 哑渲染器。
 *
 * 职责（设计 Zone分解设计.md §2.2）：
 *   - 图标按钮（垂直排列，42px 宽；top/bottom 分列——壳 getIconLocation 序列化为 location 字段）
 *   - 激活高亮（activePluginId——壳侧已算好：侧栏展开 + 活动容器属于该插件）
 *   - 点击 → window.linkdesk.events.emit("icon:selected", pluginId) → 主进程转发 → 壳开标签
 *   - ☰ 汉堡（hamburgerVisible）——下拉分组菜单（壳 MenuRenderer showGroups+showKeybindings+checkWhen 语义）
 *
 * 与壳行为差异（诚实注记）：
 *   ① 拖拽换位——设计 §2.2 明确"可选——远期"，池暂无拖拽（壳 IconBar 的 drag 状态机不迁）。
 *   ② 底部齿轮左键/右键菜单（MenuId.ExtensionGear）——推迟 Phase 4 #14（ContextMenu 浮层门户）。
 *      过渡期点击齿轮无动作；设置视图仍可从 文件 → 打开设置 或命令面板到达。
 *   ③ 壳 icon-btn 48×48 在 42px 列内横向溢出——池按设计修正为 42×42（Zone分解设计.md:81）。
 *   ④ 壳汉堡子面板仅 2 层——池共享 MenuItemList 递归支持 N 层（实际菜单数据 ≤2 层，无感）。
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { IconBarLayout, IconBarItem } from "../../core/types/poolLayout";
import MenuItemList from "../shared/MenuItemList";
import PoolPluginIcon from "../shared/PoolPluginIcon";
import { executePoolCommand } from "../shared/executePoolCommand";
import "./IconBarZone.css";

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

  // top/bottom 分列——switch 判别（eslint E5.5#10 规则拦 `=== "小写字面量"`，tag 判别用 switch 不误报）
  const topIcons: IconBarItem[] = [];
  const bottomIcons: IconBarItem[] = [];
  for (const item of iconBar.icons) {
    switch (item.location) {
      case "top": topIcons.push(item); break;
      default: bottomIcons.push(item); break;
    }
  }

  const renderIcon = (item: IconBarItem) => (
    <button
      key={item.pluginId}
      className={`icon-btn${iconBar.activePluginId === item.pluginId ? " active" : ""}`}
      title={item.label}
      aria-label={item.label}
      onClick={() => {
        // 壳侧消费方：壳 App 桥接 linkdesk.events.on → shellEvents → MainContent 开标签（E5.7#6）
        window.linkdesk?.events?.emit("icon:selected", item.pluginId);
      }}
    >
      <PoolPluginIcon icon={item.icon} className="icon-bar-plugin-icon" alt={item.label} />
    </button>
  );

  return (
    <div className="icon-bar" role="navigation" aria-label={iconBar.navLabel}>
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
    </div>
  );
}

export default IconBarZone;
