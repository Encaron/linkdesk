/**
 * ViewTitleActions——E5.8#36.5 视图动作区统一渲染器（壳侧声明、池统一渲染）。
 *
 * 消费 contributes.views[].titleActions 声明（随视图走、随视图在面板/侧栏迁移）——
 * 壳 ViewContainerService 原样透传 → pushLayout 到池，本组件按活动视图渲染。
 * 三 widget 形态（VS Code 终端 [+] 新建 + [▾] 配置文件列表同款）：
 *   - icon    单图标按钮——点击执行 command
 *   - dropdown 纯下拉——chevron 展开 items 列表
 *   - split   主按钮+下拉复合——主按钮执行 command（默认动作）+ chevron 展开备选 items
 * 动作 = command + args（args 作为单个位置参数 executeCommand 透传）。
 *
 * 铁律对齐：widget 是通用件不是给终端造的——谁声明谁用（插件独立铁律：第三方声明即用零壳改动）。
 * 无声明（actions 空数组）→ 渲染 null（右侧空白——现状保持）。
 * 显示文本铁律：label/title 壳侧声明 = i18n key，池 t() 解析（key 缺失 → key 原文兜底）。
 * 下拉交互：PanelZone 切换器下拉同款（fixed 锚点 + document 外部点击/Escape 关闭 + 入场动画）。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TitleActionItem, TitleActionWidget } from "../../../core/api/types";
import "../dropdown-card/dropdown-card.css"; // 共享下拉卡片本体（.dropdown-card）
import "./ViewTitleActions.css";

interface ViewTitleActionsProps {
  /** 活动视图的 titleActions 声明——空数组渲染 null（无声明视图右侧空白） */
  actions: TitleActionWidget[];
}

/** 带下拉条目的 widget 子集——dropdown / split（icon 无 items） */
type MenuWidget = Extract<TitleActionWidget, { items: TitleActionItem[] }>;

/** 执行命令——args 作为单个位置参数透传（无 args 裸执行）。
 *  executeCommand 池侧注册表优先、壳 IPC fallback（preload-pool 同款语义）。 */
function runCommand(command: string, args: unknown): void {
  if (args === undefined) {
    window.linkdesk?.commands?.executeCommand(command);
  } else {
    window.linkdesk?.commands?.executeCommand(command, args);
  }
}

export default function ViewTitleActions({ actions }: ViewTitleActionsProps) {
  const { t } = useTranslation();
  // 展开的下拉 widget ID + 锚点——fixed 定位在 chevron 正下方（TitleBarZone 下拉同款）
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** 展开/收起 chevron 下拉——按当前按钮几何计算锚点 */
  const handleToggle = useCallback(
    (w: TitleActionWidget, e: React.MouseEvent) => {
      if (openId === w.id) {
        setOpenId(null);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setAnchor({ top: rect.bottom, left: rect.left });
      setOpenId(w.id);
    },
    [openId],
  );

  /** 外部点击 + Escape 关闭——document 级（池 DOM 焦点天然分区） */
  useEffect(() => {
    if (openId === null) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      setOpenId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openId]);

  /** 下拉条目点击——执行命令 + 关闭 */
  const handleItemClick = useCallback((item: TitleActionItem) => {
    runCommand(item.command, item.args);
    setOpenId(null);
  }, []);

  if (actions.length === 0) return null;

  /** 渲染下拉（dropdown / split 共用）——fixed 定位 + role=menu + 键盘 Enter/Space 激活 */
  const renderDropdown = (w: MenuWidget) =>
    openId === w.id && anchor ? (
      <div className="dropdown-card vta-dropdown" style={anchor} ref={dropdownRef} role="menu">
        {w.items.map((item, i) => (
          <div
            key={i}
            className="vta-item"
            role="menuitem"
            tabIndex={0}
            onClick={() => handleItemClick(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleItemClick(item);
              }
            }}
          >
            {t(item.label)}
          </div>
        ))}
      </div>
    ) : null;

  /** chevron 按钮（dropdown / split 共用）——展开下拉；dropdown 可选 title tooltip */
  const renderChevron = (w: MenuWidget) => (
    <button
      className={`vta-btn vta-chev${openId === w.id ? " open" : ""}`}
      title={w.type === "dropdown" && w.title ? t(w.title) : undefined}
      aria-label={w.type === "dropdown" && w.title ? t(w.title) : t("更多操作")}
      aria-haspopup="menu"
      aria-expanded={openId === w.id}
      onClick={(e) => handleToggle(w, e)}
    >
      <span className="codicon codicon-chevron-down" aria-hidden="true" />
    </button>
  );

  return (
    <div className="vta" role="toolbar" aria-label={t("视图操作")}>
      {actions.map((w) => (
        <div key={w.id} className="vta-widget">
          {w.type === "icon" && (
            <button
              className="vta-btn"
              title={t(w.title)}
              aria-label={t(w.title)}
              onClick={() => runCommand(w.command, w.args)}
            >
              <span className={`codicon ${w.icon}`} aria-hidden="true" />
            </button>
          )}
          {w.type === "dropdown" && (
            <>
              {renderChevron(w)}
              {renderDropdown(w)}
            </>
          )}
          {w.type === "split" && (
            <>
              <button
                className="vta-btn"
                title={t(w.title)}
                aria-label={t(w.title)}
                onClick={() => runCommand(w.command, w.args)}
              >
                {w.icon ? (
                  <span className={`codicon ${w.icon}`} aria-hidden="true" />
                ) : (
                  t(w.title)
                )}
              </button>
              {renderChevron(w)}
              {renderDropdown(w)}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
