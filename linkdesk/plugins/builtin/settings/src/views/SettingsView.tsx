/**
 * Settings Editor——对标 VS Code Settings UI。
 * 自壳迁入（E5.8#41.14 内置设置纯插件化）——本文件从壳 src/components/views/settings 整迁
 * 至设置插件 src/views，成为 plugin.json contributes.views[].render 直指的真实组件。
 *
 * @src 依赖处置（#41.14）：
 *   - 共享控件（InlineInput/ContextMenu/ColorPicker/Toggle/...）走 @src/components/shared 例外表白名单
 *   - getFilePath（壳 StorageService）→ linkdesk.path.appDataDir + join("settings.json")（零 @src/core）
 *   - getConfigurationContributions cast 已删——契约补全 LinkDeskConfigurationContribution 命名类型
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2
 * 核心无知原则：Settings Editor 不知道有哪些设置项——全部从 ConfigurationRegistry 派生。
 *
 * E5.8#0d.10-7e：feature-folder 聚合器——SettingsView/ 6 子模块整迁：
 *   types（三接口）· helpers（lk）· ObjectEditor（对象编辑）· renderControl（控件渲染）·
 *   SettingRow（单设置行）· useSettingsEvents（订阅 effect 组）。
 *   本文件仅剩：主组件 state + loadData + filteredGroups + JSX 编排。
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { InlineInput } from "@src/components/shared/inline-input/InlineInput";
import KeybindingSettingsView from "./keybinding-settings/KeybindingSettingsView";
import SettingRow from "./SettingsView/SettingRow";
import useSettingsEvents from "./SettingsView/useSettingsEvents";
import { lk, OWN_FACTORY_ROLE } from "./SettingsView/helpers";
import type { GroupInfo, ConfigProperty, SettingsViewProps } from "./SettingsView/types";
import "./SettingsView.css";

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

  // ── 顶部通用区（E5.8#41.13）——本角色（设置套）全部候选 + 激活 id，用于切整套设置 UI ──
  const [settingsCandidates, setSettingsCandidates] = useState<{ pluginId: string; title: string; viewId?: string }[]>([]);
  const [settingsActiveId, setSettingsActiveId] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    try {
      const cfg = lk();
      const fs = window.linkdesk.factorySlots;
      // 并行拉取：配置分组 + schema + 角色枚举（#41.14 ⑤ 角色分组）+ 设置套候选/激活（#41.13）
      const [entries, schema, roles, settingsCandidates, settingsActiveId] = await Promise.all([
        cfg.getConfigurationContributions(),
        cfg.getSchema(),
        fs.listRoles(),
        fs.list(OWN_FACTORY_ROLE),
        fs.getActive(OWN_FACTORY_ROLE),
      ]);
      // E5.8#41.14：getConfigurationContributions 契约已补全命名类型（LinkDeskConfigurationContribution）
      // ——不再需要 IPC 边界 cast，形状由契约保证
      const contributions = new Map(entries);
      const result: GroupInfo[] = [];

      // ① contributes.configuration 分组（非空）
      for (const [pluginId, contrib] of contributions) {
        const keys = Object.keys(contrib.properties ?? {});
        if (keys.length > 0) {
          result.push({ pluginId, title: t(contrib.title ?? pluginId), keys });
        }
      }

      // ② factoryRole 角色分组（#41.14 ⑤）——任何非本设置插件角色 ≥2 候选 → 该角色名组出现：
      //    切换按钮在顶、激活套配置在下；复用同名组优先（按 pluginId 找激活候选自己的配置组，非显示名）、
      //    没有才新建；激活套无配置项 → 空状态。自身角色切换 = 顶部通用区（#41.13），不进导航组。
      const roleRows = await Promise.all(
        roles
          .filter((role) => role !== OWN_FACTORY_ROLE)
          .map(async (role) => {
            const [candidates, activeId] = await Promise.all([fs.list(role), fs.getActive(role)]);
            return { role, candidates, activeId };
          })
      );
      for (const { role, candidates, activeId } of roleRows) {
        if (!candidates || candidates.length < 2) continue; // 单候选不建组（无切换意义）
        const active = candidates.find((c) => c.pluginId === activeId) ?? candidates[0];
        const existing = contributions.get(active.pluginId);
        if (existing) {
          // 复用同名组：切换条直接进激活候选自己的配置组，不新建
          const idx = result.findIndex((g) => g.pluginId === active.pluginId);
          if (idx >= 0) {
            result[idx] = { ...result[idx], role, candidates, activeId: active.pluginId };
          } else {
            // 激活候选有贡献但组空（被 ① 过滤）——仍按贡献标题建组，保持命名语义
            result.push({
              pluginId: active.pluginId,
              title: t(existing.title ?? active.title),
              keys: Object.keys(existing.properties ?? {}),
              role,
              candidates,
              activeId: active.pluginId,
            });
          }
        } else {
          // 没有才新建：候选不贡献配置 → 自动建组 + 激活套无配置项空状态
          result.push({
            pluginId: active.pluginId,
            title: t(active.title),
            keys: [],
            role,
            candidates,
            activeId: active.pluginId,
          });
        }
      }

      setGroupsRaw(result);
      setAllProps((schema ?? {}) as Record<string, ConfigProperty>);
      setSettingsCandidates(settingsCandidates ?? []);
      setSettingsActiveId(settingsActiveId);
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
  const filteredGroups = useMemo(() => {
    const groups = groupsRaw;
    if (!search.trim()) return groups;
    const q = search.toLowerCase();

    return groups
      .map((g) => ({
        ...g,
        keys: g.keys.filter((k) => {
          const prop = allProps[k];
          return (
            k.toLowerCase().includes(q) ||
            (prop?.description ?? "").toLowerCase().includes(q) ||
            g.title.toLowerCase().includes(q)
          );
        }),
      }))
      // 配置分组按匹配键保留；角色分组（可能空配置）按标题匹配保留——空配置组搜索标题仍可达
      .filter((g) => g.keys.length > 0 || (!!g.role && g.title.toLowerCase().includes(q)));
  }, [groupsRaw, search, allProps]);

  // ── 角色分组切换（#41.14 ⑤）——setActive 落盘后重拉数据，激活套配置随切换换 ──
  const handleRoleSwitch = useCallback(async (role: string, pluginId: string) => {
    try {
      await window.linkdesk.factorySlots.setActive(role, pluginId);
      setVersion((v) => v + 1);
    } catch (e) {
      console.error(`[SettingsView] 切换角色 "${role}" 激活套失败:`, e);
    }
  }, []);

  // ── 设置套切换（E5.8#41.13）——全插件侧换套：setActive 落盘 → 关本套标签页 → 开新激活套。
  //    开关不触碰壳：换整套设置 UI = 换当前渲染的插件 tab（close 自身 tabId + create targetId，
  //    singleton 去重已存在则聚焦）。浮动面板（无 tabId）退化为只开新激活套 tab。 ──
  const handleSettingsSwitch = useCallback(async (targetId: string) => {
    if (targetId === settingsActiveId) return; // 点当前激活套 = 无操作（不重开自身 tab）
    try {
      await window.linkdesk.factorySlots.setActive(OWN_FACTORY_ROLE, targetId);
      if (tabId) {
        // 标签页形态：关自身 tab + 开目标 tab（singleton 去重已存在则聚焦）
        await window.linkdesk.tabs.close(tabId).catch(() => {});
        await window.linkdesk.tabs.create(targetId).catch(() => {});
      } else {
        // 悬浮面板形态（E5.8#41.18）：原地换套——revealFloating 复合替换（同 viewId 异插件 → 面板换内容）
        const target = settingsCandidates.find((c) => c.pluginId === targetId);
        if (target?.viewId) {
          await window.linkdesk.panel.revealFloating(target.viewId, target.pluginId).catch(() => {});
        } else {
          // 目标套未声明 floatingPanel → 退回开标签页（无悬浮面板可换）
          await window.linkdesk.tabs.create(targetId).catch(() => {});
        }
      }
    } catch (e) {
      console.error(`[SettingsView] 切换设置套 "${targetId}" 失败:`, e);
    }
  }, [tabId, settingsActiveId, settingsCandidates]);

  // ── 默认选中第一个分组（角色分组按 role 匹配——切换激活候选不改选中）──
  const activeGroup =
    filteredGroups.find((g) =>
      g.role ? g.role === selectedGroup : g.pluginId === selectedGroup
    ) ?? filteredGroups[0] ?? null;

  return (
    <div className="settings-editor">
      {/* 顶部通用区（E5.8#41.13）——N 套设置插件并存切换：全部入口含自身、激活高亮、
          删除任意一套 → onPluginLifecycleChange → version 重拉 → 按钮自动消失。
          位置/形态是本套 UI 的选择（内置 = 顶部平铺条，settings-demo = 右下角胶囊），非壳规定 */}
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
                    activeGroup.keys.map((key) => (
                      <SettingRow
                        key={key}
                        configKey={key}
                        prop={allProps[key]}
                        onChange={() => setVersion((v) => v + 1)}
                      />
                    ))
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
