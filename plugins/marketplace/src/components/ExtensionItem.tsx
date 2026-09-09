/**
 * ExtensionItem — 插件列表行组件。
 * E3.6 E36#7.2：从 sidebar.tsx L466-549 提取（纯 UI、props 驱动、零副作用）。
 * clickTimer 区分单击（预览）/ 双击（固定打开）。
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu, PluginIcon } from "@linkdesk/ui";
// E5.8#20-c：契约化——插件列表类型走 @linkdesk/contracts（零 @src/core）
import type { PluginListEntry, PluginListSubset } from "@linkdesk/contracts";

const pm = () => window.linkdesk?.pluginManager;

/** 齿轮菜单打开时设置 context key（菜单项 when 条件消费） */
function applyExtensionContextKeys(manifest: PluginListSubset, isDisabled: boolean): void {
  const c = manifest?.contributes ?? {};
  window.linkdesk?.contextKey?.set("pluginDisabled", isDisabled);
  window.linkdesk?.contextKey?.set("extensionHasThemes", !!c.themes);
  window.linkdesk?.contextKey?.set("extensionHasLanguages", !!c.languages);
  window.linkdesk?.contextKey?.set("extensionHasIconThemes", !!c.iconThemes);
  window.linkdesk?.contextKey?.set("extensionHasConfiguration", !!c.configuration);
  window.linkdesk?.contextKey?.set("extensionHasKeybindings", !!c.keybindings);
}

/** 齿轮菜单关闭时清理 context key */
function clearExtensionContextKeys(): void {
  window.linkdesk?.contextKey?.set("pluginDisabled", false);
  window.linkdesk?.contextKey?.set("extensionHasThemes", false);
  window.linkdesk?.contextKey?.set("extensionHasLanguages", false);
  window.linkdesk?.contextKey?.set("extensionHasIconThemes", false);
  window.linkdesk?.contextKey?.set("extensionHasConfiguration", false);
  window.linkdesk?.contextKey?.set("extensionHasKeybindings", false);
}

interface ExtensionItemProps {
  plugin: PluginListEntry;
  onClick: () => void;
  onDoubleClick: () => void;
  /** E6#33b：远端稳定版可更新版本（有值 = 行内「可更新 vN」accent 徽标——只示状态，动作归详情） */
  updateTo?: string;
}

export function ExtensionItem({ plugin, onClick, onDoubleClick, updateTo }: ExtensionItemProps) {
  const { t } = useTranslation();
  const m = plugin.manifest;
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gearBtnRef = useRef<HTMLButtonElement>(null);
  const [gearMenuAnchor, setGearMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  /* VS Code 风格：计时器区分单击/双击。300ms 内两次点击 = 双击（固定打开） */
  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onDoubleClick();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onClick();
      }, 300);
    }
  };

  /* ⚙ 齿轮菜单——Phase 5f 归一化：走 ContextMenu + MenuRegistry */
  const handleGear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const disabled = await pm().isDisabled(plugin.pluginId);
    applyExtensionContextKeys(plugin.manifest, disabled);
    setGearMenuAnchor({ x: rect.right, y: rect.bottom });
  };

  return (
    <div className="ms-extension-item" onClick={handleClick}>
      {/* icon: 从 manifest 动态读取（E6#65b：manifest 传入 PluginIcon——resolvePluginIcon 只读
       *  manifest.icon/iconSource 裁决；此前不传 = PluginIcon 无 manifest → 恒 📄 emoji 兜底，
       *  现在 list() 子集带 icon（E6#65a）→ 各插件现有图标立显） */}
      <div className="ms-item-icon">
        <PluginIcon pluginId={plugin.pluginId} manifest={plugin.manifest} />
        {m.core && <span className="ms-item-badge codicon codicon-star-full" />}
      </div>

      {/* VS Code: .details */}
      <div className="ms-item-details">
        <div className="ms-item-header">
          <span className="ms-item-name">{t(m.name ?? "")}</span>{/* E5.8#37.9.1：插件显示名 t() 解析——lang-defaults 持壳插件名 key（name 可空 → t("") 原样空） */}
          {/* E5.8#15.5：缺依赖挂起（PENDING）徽标——tooltip 显完整原因（"等待依赖: xxx"） */}
          {plugin.pendingReason && (
            <span className="ms-item-badge-pending" title={plugin.pendingReason}>{t("等待依赖")}</span>
          )}
          {/* E6#33b：可更新徽标（accent 信息态——只示状态，点击行开详情即升级入口） */}
          {updateTo && (
            <span className="ms-item-badge-update" title={t("可更新")}>
              <span className="codicon codicon-arrow-up" /> {t("可更新")} v{updateTo}
            </span>
          )}
          <span className="ms-item-version">v{m.version}</span>
        </div>
        {m.description && <span className="ms-item-desc">{m.description}</span>}
        <div className="ms-item-footer">
          {m.author && <span className="ms-item-author">{m.author}</span>}
          {m.statusBar && m.statusBar.length > 0 && (
            <span className="ms-item-tag">{m.statusBar.length} status</span>
          )}
        </div>
      </div>

      {/* ⚙ 齿轮——core 插件无齿轮菜单 */}
      {!m.core && (
        <div className="ms-item-gear-wrapper">
          <button ref={gearBtnRef} className="ms-item-gear-btn" onClick={handleGear} title={t("管理")}>
            <span className="codicon codicon-gear" />
          </button>
          {gearMenuAnchor && (
            <ContextMenu
              menuId={"marketplaceItemGear"}
              anchor={gearMenuAnchor}
              context={{ pluginId: plugin.pluginId }}
              onClose={() => {
                clearExtensionContextKeys();
                setGearMenuAnchor(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
