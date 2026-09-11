/**
 * Settings Editor——对标 VS Code Settings UI。
 * 自壳迁入（E5.8#41.14 内置设置纯插件化）——本文件从壳 src/components/views/settings 整迁
 * 至设置插件 src/views，成为 plugin.json contributes.views[].render 直指的真实组件。
 *
 * @src 依赖处置（#41.14）：
 *   - 共享控件（InlineInput/ContextMenu/ColorPicker/Toggle/...）走 @linkdesk/ui（E6#54c）
 *   - getFilePath（壳 StorageService）→ linkdesk.path.appDataDir + join("settings.json")（零 @src/core）
 *   - getConfigurationContributions cast 已删——契约补全 LinkDeskConfigurationContribution 命名类型
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2
 * 核心无知原则：Settings Editor 不知道有哪些设置项——全部从 ConfigurationRegistry 派生。
 *
 * E5.8#0d.10-7e：feature-folder 聚合器——SettingsView/ 6 子模块整迁：
 *   types（三接口）· helpers（lk）· ObjectEditor（对象编辑）· renderControl（控件渲染）·
 *   SettingRow（单设置行）· useSettingsEvents（订阅 effect 组）。
 * E6#87d：再下沉四件——loadSettingsData（数据拉取与分组组装）· useSettingsSwitch（角色套/设置套切换）·
 *   filterGroups（搜索过滤）· GroupedKeys（组内二级标题渲染）。
 *   本文件仅剩：主组件 state + 数据装载 + JSX 编排。
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { InlineInput } from "@linkdesk/ui";
import KeybindingSettingsView from "./keybinding-settings/KeybindingSettingsView";
import useSettingsEvents from "./SettingsView/useSettingsEvents";
import { useUserOverridesIpc } from "./hooks/useUserOverridesIpc";
import { useBaselineSeedsIpc } from "./hooks/useBaselineSeedsIpc";
import { useEffectiveTokensIpc } from "./hooks/useEffectiveTokensIpc"; // E5.8#155：生效 token 集——跟随主题生效值徽标数据源
import { useConfigurationValueIpc } from "./hooks/useConfigurationValueIpc"; // E5.8#90：外观主开关订阅——空桶过滤 + D5 动态描述
import { loadSettingsData } from "./SettingsView/loadSettingsData";
import { filterGroups } from "./SettingsView/filterGroups";
import { useSettingsSwitch } from "./SettingsView/useSettingsSwitch";
import GroupedKeys from "./SettingsView/GroupedKeys";
import type { GroupInfo, ConfigProperty, SettingsViewProps } from "./SettingsView/types";
// E6#87d：原 SettingsView.css（630）按现有分节整段一切三——三件同为同一屏的样式，统一在此引入
import "./SettingsView.css";
import "./SettingsView-rows.css";
import "./SettingsView-objectEditor.css";

/* ── 组件 ── */

function SettingsView({ isActive: _isActive, tabId }: SettingsViewProps) {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<"settings" | "keybindings">("settings");
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [keybindingQuery, setKeybindingQuery] = useState<string | undefined>();
  const [version, setVersion] = useState(0);

  // ── 异步数据：配置分组 + 合并 schema ──
  const [groupsRaw, setGroupsRaw] = useState<GroupInfo[]>([]);
  const [allProps, setAllProps] = useState<Record<string, ConfigProperty>>({});
  const [dataLoaded, setDataLoaded] = useState(false);

  // E5.8#87：用户覆盖集——来源徽标 presence 派生（单 hook 顶升，SettingRow 按需读 prop，不重复订阅）
  const userOverrides = useUserOverridesIpc();
  // E5.8#88：基准种子集——「已修改」徽标 value-vs-baseline 判定（播种值/恰与主题同值 = 主题 🎨，非用户 ✏️）
  const baselineSeeds = useBaselineSeedsIpc();
  // E5.8#155：生效 token 集——跟随主题生效值徽标数据源（父级单拉取，SettingRow 按需读 prop，不重复订阅）
  const effectiveTokens = useEffectiveTokensIpc();
  // E5.8#90：外观主开关订阅——空桶过滤（followTheme 下 强调色/外观覆盖/域混搭 整组空不渲染空子标题）+ themeColor D5 动态描述
  const appearanceMode = useConfigurationValueIpc<string>("app.appearanceMode");

  // ── 顶部通用区（E5.8#41.13）——本角色（设置套）全部候选 + 激活 id，用于切整套设置 UI ──
  const [settingsCandidates, setSettingsCandidates] = useState<{ pluginId: string; title: string; viewId?: string }[]>([]);
  const [settingsActiveId, setSettingsActiveId] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    try {
      const data = await loadSettingsData(t);
      setGroupsRaw(data.groups);
      setAllProps(data.allProps);
      setSettingsCandidates(data.candidates);
      setSettingsActiveId(data.activeId);
      setDataLoaded(true);
    } catch (e) {
      console.error("[SettingsView] 加载配置数据失败:", e);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData, version]);

  // ── 订阅/跳转 effect 组（配置变更/插件生命周期/M1 双通道/scrollTo 双通道/快捷键契约通道）──
  useSettingsEvents({
    setVersion,
    setSearch,
    setSelectedGroup,
    setActiveTab,
    setKeybindingQuery,
    groupsRaw,
  });

  // ── 搜索过滤 ──
  const filteredGroups = useMemo(
    () => filterGroups(groupsRaw, search, allProps),
    [groupsRaw, search, allProps],
  );

  const { handleRoleSwitch, handleSettingsSwitch } = useSettingsSwitch(
    tabId,
    settingsActiveId,
    settingsCandidates,
    setVersion,
  );

  // ── 默认选中第一个分组（角色分组按 role 匹配——切换激活候选不改选中）──
  const activeGroup =
    filteredGroups.find((g) =>
      g.role ? g.role === selectedGroup : g.pluginId === selectedGroup
    ) ?? filteredGroups[0] ?? null;

  return (
    <div className="settings-editor">
      {/* 顶部通用区（E5.8#41.13）——N 套设置插件并存切换：全部入口含自身、激活高亮、
          删除任意一套 → onPluginLifecycleChange → version 重拉 → 按钮自动消失。
          位置/形态是本套 UI 的选择（官方套 = 顶部平铺条；第三方套可自选右下角胶囊等），非壳规定 */}
      {settingsCandidates.length >= 2 && (
        <div className="settings-role-switch settings-role-switch--gen">
          <span className="settings-role-switch-label">{t("激活角色套")}</span>
          {settingsCandidates.map((c) => (
            <button
              key={c.pluginId}
              className={`settings-role-switch-btn ${
                c.pluginId === settingsActiveId ? "active" : ""
              }`}
              onClick={() => handleSettingsSwitch(c.pluginId)}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}
      {/* 双 tab——设置 / 快捷键 */}
      <div className="settings-tab-bar">
        <button
          className={`settings-tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => { setActiveTab("settings"); setKeybindingQuery(undefined); }}
        >
          {t("设置")}
        </button>
        <button
          className={`settings-tab ${activeTab === "keybindings" ? "active" : ""}`}
          onClick={() => setActiveTab("keybindings")}
        >
          {t("快捷键")}
        </button>
      </div>

      {activeTab === "keybindings" ? (
        <KeybindingSettingsView initialQuery={keybindingQuery} />
      ) : (
        <>
          {/* 搜索栏 + Open JSON 按钮 */}
          <div className="settings-search-bar">
            <span className="codicon codicon-search settings-search-icon" />
            <InlineInput
              size="normal"
              value={search}
              onChange={setSearch}
              onConfirm={setSearch}
              onCancel={() => setSearch("")}
              placeholder={t("搜索设置")}
            />
            <button
              className="settings-json-btn"
              title={t("打开设置 (JSON)")}
              onClick={async () => {
                try {
                  // E5.8#41.14：getFilePath("settings") 消除——linkdesk.path 自包含解析 settings.json 真实落盘路径
                  //（appDataDir 契约标可选——可选链守卫）
                  const dir = await window.linkdesk.path?.appDataDir?.();
                  const filePath = dir ? window.linkdesk.path.join(dir, "settings.json") : "";
                  if (!filePath) return;
                  const pluginId = await window.linkdesk.fileAssociation.getPluginFor("json");
                  // E5.8#0d.5：与 file-tree 打开文件同一条链——显式查关联不写死编辑器插件 ID（硬约束 #10）
                  await window.linkdesk.tabs.create(pluginId || "", {
                    filePath,
                    sourceId: filePath,
                    label: "settings.json",
                    pinned: true,
                  });
                } catch { /* 静默 */ }
              }}
            >
              <span className="codicon codicon-json" />
              <span className="settings-json-label">{t("JSON")}</span>
            </button>
          </div>

          <div className="settings-body">
            {/* 左侧分组树 */}
            <nav className="settings-nav">
              {!dataLoaded && groupsRaw.length === 0 ? (
                <div className="settings-nav-empty">{t("加载中...")}</div>
              ) : (
                <>
                  {filteredGroups.map((g) => (
                    <button
                      key={g.role ?? g.pluginId}
                      className={`settings-nav-item ${
                        activeGroup && (g.role ? g.role === activeGroup.role : g.pluginId === activeGroup.pluginId)
                          ? "active"
                          : ""
                      }`}
                      onClick={() => setSelectedGroup(g.role ?? g.pluginId)}
                    >
                      {g.title}
                      <span className="settings-nav-count">
                        {g.role ? g.candidates?.length ?? 0 : g.keys.length}
                      </span>
                    </button>
                  ))}
                  {filteredGroups.length === 0 && (
                    <div className="settings-nav-empty">{t("无匹配设置")}</div>
                  )}
                </>
              )}
            </nav>

            {/* 右侧设置表单 */}
            <div className="settings-form" key={activeGroup?.pluginId}>
              {activeGroup ? (
                <>
                  {/* 角色分组（#41.14 ⑤）：切换按钮在顶、激活套配置在下 */}
                  {activeGroup.role && activeGroup.candidates && (
                    <div className="settings-role-switch">
                      <span className="settings-role-switch-label">{t("激活角色套")}</span>
                      {activeGroup.candidates.map((c) => (
                        <button
                          key={c.pluginId}
                          className={`settings-role-switch-btn ${
                            c.pluginId === activeGroup.activeId ? "active" : ""
                          }`}
                          onClick={() => handleRoleSwitch(activeGroup.role!, c.pluginId)}
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <h2 className="settings-group-title">{activeGroup.title}</h2>
                  {activeGroup.keys.length > 0 ? (
                    <GroupedKeys
                      keys={activeGroup.keys}
                      allProps={allProps}
                      appearanceMode={appearanceMode}
                      userOverrides={userOverrides}
                      baselineSeeds={baselineSeeds}
                      effectiveTokens={effectiveTokens}
                      onChange={() => setVersion((v) => v + 1)}
                    />
                  ) : activeGroup.role ? (
                    <div className="settings-empty">{t("激活套无配置项")}</div>
                  ) : null}
                </>
              ) : (
                <div className="settings-empty">
                  {search ? t("无匹配设置") : t("选择一个分组以开始配置")}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default SettingsView;
