/**
 * MarketplaceSidebar — 插件管理侧栏。
 * Phase 4 UX：对标 VS Code Extensions 侧栏。
 *   header（搜索）→ extension list（icon + name/version/desc + actions）
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
// E3a #31：数据路径 IPC 化——plugin 管理走 window.linkdesk.plugins.*
// UI 组件/命令注册保持 @src/ 导入（WebView 未分离，仍在壳进程）
import { onPluginLifecycleChange } from "@src/pluginLoader/lifecycle";
import { PluginIcon } from "@src/components/shared/PluginIcon";
import { useTabActions } from "@src/core/TabActionsContext";
import ContextMenu from "@src/components/shared/ContextMenu";
import { registerCommand } from "@src/core/CommandRegistry";
import { registerMenuItems, MenuId } from "@src/core/MenuRegistry";
import { ContextKeyService } from "@src/core/ContextKeyService";
import type { ViewPluginEntry } from "@src/core/types";
import "./MarketplaceSidebar.css";

/** E3a #31：插件管理 API 快捷访问——pluginManager 独立命名空间（避免与 shell 侧 Rust 层 plugins.* 冲突） */
const pm = () => (window as any).linkdesk?.pluginManager;
const lk = () => (window as any).linkdesk;

/* ── 模块级：注册 marketplace 命令（Phase 5f 归一化——替代手写 gear 菜单） ── */

let _marketplaceCommandsRegistered = false;

function ensureMarketplaceCommands(): void {
  if (_marketplaceCommandsRegistered) return;
  _marketplaceCommandsRegistered = true;

  registerCommand("marketplace", {
    id: "marketplace.enable",
    title: "启用",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().enable(ctx.pluginId);
    },
  });

  registerCommand("marketplace", {
    id: "marketplace.disable",
    title: "禁用",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().disable(ctx.pluginId);
    },
  });

  registerCommand("marketplace", {
    id: "marketplace.uninstall",
    title: "卸载",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      if (ctx?.pluginId) await pm().uninstall(ctx.pluginId);
    },
  });

  registerMenuItems(MenuId.MarketplaceItemGear, "marketplace", [
    { command: "core.openSettings", group: "navigation", when: "extensionHasConfiguration" },
    { command: "workbench.action.selectTheme", group: "navigation", when: "extensionHasThemes" },
    { command: "workbench.action.selectLanguage", group: "navigation", when: "extensionHasLanguages" },
    { command: "workbench.action.openExtensionKeybindings", group: "navigation", when: "extensionHasKeybindings" },
    { command: "marketplace.enable", group: "navigation", when: "pluginDisabled" },
    { command: "marketplace.disable", group: "navigation", when: "!pluginDisabled" },
    { command: "marketplace.uninstall", group: "delete" },
  ]);
}

/**
 * 归一化：从插件 manifest 提取所有贡献特征，映射到 ContextKeyService。
 * 菜单项的 `when` 条件消费这些 key，添加新类型时只需加一行映射。
 *
 * 设计依据：VS Code `cksOverlay`——`extensionsActions.ts` line ~1300
 *   cksOverlay.push(['extensionHasColorThemes', ...]);
 *   cksOverlay.push(['extensionHasFileIconThemes', ...]);
 *   cksOverlay.push(['extensionHasProductIconThemes', ...]);
 */
function applyExtensionContextKeys(manifest: any, isDisabled: boolean): void {
  const c = manifest?.contributes ?? {};
  ContextKeyService.setValue("pluginDisabled", isDisabled);
  ContextKeyService.setValue("extensionHasThemes", !!c.themes);
  ContextKeyService.setValue("extensionHasLanguages", !!c.languages);
  ContextKeyService.setValue("extensionHasIconThemes", !!c.iconThemes);
  ContextKeyService.setValue("extensionHasConfiguration", !!c.configuration);
  ContextKeyService.setValue("extensionHasKeybindings", !!c.keybindings);
}

/** 齿轮菜单关闭时清理所有扩展 context key——#36f10。不清理会导致下次打开不同插件齿轮时残留旧 key。 */
function clearExtensionContextKeys(): void {
  ContextKeyService.setValue("pluginDisabled", false);
  ContextKeyService.setValue("extensionHasThemes", false);
  ContextKeyService.setValue("extensionHasLanguages", false);
  ContextKeyService.setValue("extensionHasIconThemes", false);
  ContextKeyService.setValue("extensionHasConfiguration", false);
  ContextKeyService.setValue("extensionHasKeybindings", false);
}

function MarketplaceSidebar() {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const [search, setSearch] = useState("");

  // Phase 5f 归一化：注册 marketplace 命令（幂等——只执行一次）
  ensureMarketplaceCommands();

  // E3a #31：插件列表走 IPC——异步获取替代同步 getViewPlugins()
  const [allPlugins, setAllPlugins] = useState<ViewPluginEntry[]>([]);
  const [disabledPlugins, setDisabledPlugins] = useState<Array<{ pluginId: string; name: string; description?: string; version?: string }>>([]);
  const [uninstalledPlugins, setUninstalledPlugins] = useState<Array<{ pluginId: string; name: string; description?: string; version?: string }>>([]);
  const [loading, setLoading] = useState(true);

  const refreshLists = useCallback(async () => {
    try {
      const [plugins, disabled, uninstalled] = await Promise.all([
        pm().list(),
        pm().getDisabled(),
        pm().getUninstalled(),
      ]);
      setAllPlugins(plugins);
      setDisabledPlugins(disabled);
      setUninstalledPlugins(uninstalled);
    } catch { /* 静默 */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refreshLists();
    const unsub = onPluginLifecycleChange.event(() => {
      refreshLists();
    });
    return unsub;
  }, [refreshLists]);

  const filtered = allPlugins.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.manifest.name.toLowerCase().includes(q) ||
      p.pluginId.toLowerCase().includes(q) ||
      (p.manifest.description ?? "").toLowerCase().includes(q)
    );
  });

  const filteredDisabled = disabledPlugins.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.pluginId.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q)
    );
  });

  const filteredUninstalled = uninstalledPlugins.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.pluginId.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q)
    );
  });

  // VS Code 分组：Installed / Built-in
  const userPlugins = filtered.filter((p) => !p.manifest.core);
  const builtinPlugins = filtered.filter((p) => p.manifest.core);

  // 单击 → 预览模式（替换现有预览标签页）
  // B1 fix: 显式传 pinned:false 触发 useTabManager 的 opt-IN 预览替换逻辑
  const handleOpenDetail = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: false });
  };
  // 双击 → 固定模式（新建或固定现有标签页）
  const handleOpenDetailPinned = (pluginId: string) => {
    tabActions?.createTab("plugin-detail", { pluginId, pinned: true });
  };

  const handleEnable = useCallback(async (pluginId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await pm().enable(pluginId);
  }, []);

  const [installing, setInstalling] = useState(false);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      const selected = await lk().dialog.open({ directory: true, title: "选择插件目录" });
      if (selected) await pm().install(selected as string);
    } catch { /* 静默 */ }
    finally { setInstalling(false); }
  }, []);

  const handleReinstall = useCallback(async (pluginId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await pm().reinstall(pluginId);
    refreshLists();
  }, [refreshLists]);

  return (
    <div className="marketplace-sidebar">
      {/* VS Code: .header 41px, search box 28px */}
      <div className="ms-header">
        <div className="ms-header-actions">
          <button
            className="ms-install-btn"
            onClick={handleInstall}
            disabled={installing}
            title={t("从本地安装插件")}
          >
            <span className="codicon codicon-add" />
            {installing ? t("安装中...") : t("安装")}
          </button>
        </div>
        <div className="ms-search-container">
          <input
            className="ms-search-box"
            type="text"
            placeholder={t("搜索插件...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="ms-search-clear" onClick={() => setSearch("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* VS Code: .extensions list area (height: calc(100% - 41px)) */}
      <div className="ms-extensions">
        {loading ? (
          <div className="ms-empty">{t("加载中...")}</div>
        ) : filtered.length === 0 && filteredDisabled.length === 0 && filteredUninstalled.length === 0 ? (
          <div className="ms-empty">
            {search ? t("未找到匹配的插件") : t("暂无插件")}
          </div>
        ) : (
          <>
            {userPlugins.length > 0 && (
              <Section
                title={t("已安装") + ` (${userPlugins.length})`}
                plugins={userPlugins}
                onOpenDetail={handleOpenDetail}
                onOpenDetailPinned={handleOpenDetailPinned}
              />
            )}
            {builtinPlugins.length > 0 && (
              <Section
                title={t("内置") + ` (${builtinPlugins.length})`}
                plugins={builtinPlugins}
                onOpenDetail={handleOpenDetail}
                onOpenDetailPinned={handleOpenDetailPinned}
                defaultCollapsed
              />
            )}
            {filteredDisabled.length > 0 && (
              <DisabledSection
                title={t("已禁用") + ` (${filteredDisabled.length})`}
                plugins={filteredDisabled}
                onEnable={handleEnable}
                onOpenDetail={handleOpenDetail}
                onOpenDetailPinned={handleOpenDetailPinned}
              />
            )}
            {filteredUninstalled.length > 0 && (
              <UninstalledSection
                title={t("待安装") + ` (${filteredUninstalled.length})`}
                plugins={filteredUninstalled}
                onInstall={handleReinstall}
                onOpenDetail={handleOpenDetail}
                onOpenDetailPinned={handleOpenDetailPinned}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── 已禁用分区 ── */

function DisabledSection({
  title,
  plugins,
  onEnable,
  onOpenDetail,
  onOpenDetailPinned,
}: {
  title: string;
  plugins: Array<{ pluginId: string; name: string; description?: string; version?: string }>;
  onEnable: (pluginId: string, e: React.MouseEvent) => void;
  onOpenDetail: (pluginId: string) => void;
  onOpenDetailPinned: (pluginId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (pluginId: string) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onOpenDetailPinned(pluginId);
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onOpenDetail(pluginId);
      }, 300);
    }
  };

  return (
    <div className="ms-section">
      <button className="ms-section-header" onClick={() => setCollapsed(!collapsed)}>
        <span className={`codicon ${collapsed ? "codicon-chevron-right" : "codicon-chevron-down"}`} />
        <span className="ms-section-title">{title}</span>
      </button>
      {!collapsed && (
        <div className="ms-section-items">
          {plugins.map((p) => (
            <div key={p.pluginId} className="ms-extension-item disabled">
              <div className="ms-item-icon">
                <PluginIcon pluginId={p.pluginId} />
              </div>
              <div className="ms-item-details" onClick={() => handleClick(p.pluginId)} style={{ cursor: "pointer" }}>
                <div className="ms-item-header">
                  <span className="ms-item-name" style={{ opacity: 0.6 }}>{p.name}</span>
                  {p.version && <span className="ms-item-version">v{p.version}</span>}
                </div>
                {p.description && (
                  <span className="ms-item-desc" style={{ opacity: 0.5 }}>{p.description}</span>
                )}
              </div>
              <button
                className="ms-item-enable-btn"
                onClick={(e) => onEnable(p.pluginId, e)}
                title="启用插件"
              >
                <span className="codicon codicon-play" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 待安装分区（对标 VS Code 绿色 Install 按钮）── */

function UninstalledSection({
  title,
  plugins,
  onInstall,
  onOpenDetail,
  onOpenDetailPinned,
}: {
  title: string;
  plugins: Array<{ pluginId: string; name: string; description?: string; version?: string }>;
  onInstall: (pluginId: string, e: React.MouseEvent) => void;
  onOpenDetail: (pluginId: string) => void;
  onOpenDetailPinned: (pluginId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (pluginId: string) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onOpenDetailPinned(pluginId);
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onOpenDetail(pluginId);
      }, 300);
    }
  };

  return (
    <div className="ms-section">
      <button className="ms-section-header" onClick={() => setCollapsed(!collapsed)}>
        <span className={`codicon ${collapsed ? "codicon-chevron-right" : "codicon-chevron-down"}`} />
        <span className="ms-section-title">{title}</span>
      </button>
      {!collapsed && (
        <div className="ms-section-items">
          {plugins.map((p) => (
            <div key={p.pluginId} className="ms-extension-item uninstalled">
              <div className="ms-item-icon">
                <PluginIcon pluginId={p.pluginId} />
              </div>
              <div className="ms-item-details" onClick={() => handleClick(p.pluginId)} style={{ cursor: "pointer" }}>
                <div className="ms-item-header">
                  <span className="ms-item-name">{p.name}</span>
                  {p.version && <span className="ms-item-version">v{p.version}</span>}
                </div>
                {p.description && (
                  <span className="ms-item-desc">{p.description}</span>
                )}
              </div>
              <button
                className="ms-item-install-btn"
                onClick={(e) => onInstall(p.pluginId, e)}
                title="安装插件"
              >
                <span className="codicon codicon-cloud-download" /> 安装
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 分区 ── */

function Section({
  title,
  plugins,
  onOpenDetail,
  onOpenDetailPinned,
  defaultCollapsed = false,
}: {
  title: string;
  plugins: ViewPluginEntry[];
  onOpenDetail: (pluginId: string) => void;
  onOpenDetailPinned: (pluginId: string) => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="ms-section">
      <button
        className="ms-section-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={`codicon ${collapsed ? "codicon-chevron-right" : "codicon-chevron-down"}`} />
        <span className="ms-section-title">{title}</span>
      </button>
      {!collapsed && (
        <div className="ms-section-items">
          {plugins.map((p) => (
            <ExtensionItem
              key={p.pluginId}
              plugin={p}
              onClick={() => onOpenDetail(p.pluginId)}
              onDoubleClick={() => onOpenDetailPinned(p.pluginId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 对标 VS Code .extension-list-item ── */

function ExtensionItem({
  plugin,
  onClick,
  onDoubleClick,
}: {
  plugin: ViewPluginEntry;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const m = plugin.manifest;
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gearBtnRef = useRef<HTMLButtonElement>(null);
  const [gearMenuAnchor, setGearMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  // VS Code 风格：计时器区分单击/双击。300ms 内两次点击 = 双击（固定打开）
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

  // ⚙ 齿轮菜单——Phase 5f 归一化：走 ContextMenu + MenuRegistry（替代手写菜单）
  const handleGear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // 🔥 rect 必须在 await 之前捕获——React 合成事件在 handler 返回后回收，
    // await 让出执行权后 e.currentTarget 变 null（B86 同类——异步边界 + React 事件池）
    const rect = e.currentTarget.getBoundingClientRect();
    // E3a #31：isPluginDisabled 走 IPC
    const disabled = await pm().isDisabled(plugin.pluginId);
    applyExtensionContextKeys(plugin.manifest, disabled);
    setGearMenuAnchor({ x: rect.right, y: rect.bottom });
  };

  return (
    <div className="ms-extension-item" onClick={handleClick}>
      {/* icon: 从 manifest 动态读取 */}
      <div className="ms-item-icon">
        <PluginIcon pluginId={plugin.pluginId} />
        {m.core && <span className="ms-item-badge codicon codicon-star-full" />}
      </div>

      {/* VS Code: .details */}
      <div className="ms-item-details">
        <div className="ms-item-header">
          <span className="ms-item-name">{m.name}</span>
          <span className="ms-item-version">v{m.version}</span>
        </div>
        {m.description && (
          <span className="ms-item-desc">{m.description}</span>
        )}
        <div className="ms-item-footer">
          {m.author && <span className="ms-item-author">{m.author}</span>}
          {m.statusBar && m.statusBar.length > 0 && (
            <span className="ms-item-tag">{m.statusBar.length} status</span>
          )}
        </div>
      </div>

      {/* ⚙ 齿轮 —— Phase 5f 归一化：ContextMenu 替代手写菜单，失焦/滚动/Escape 统一 */}
      {!m.core && (
        <div className="ms-item-gear-wrapper">
          <button ref={gearBtnRef} className="ms-item-gear-btn" onClick={handleGear} title="管理">
            <span className="codicon codicon-gear" />
          </button>
          {gearMenuAnchor && (
            <ContextMenu
              menuId={MenuId.MarketplaceItemGear}
              anchor={gearMenuAnchor}
              context={{ pluginId: plugin.pluginId }}
              onClose={() => { clearExtensionContextKeys(); setGearMenuAnchor(null); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default MarketplaceSidebar;
