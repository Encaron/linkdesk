/**
 * Settings Editor——对标 VS Code Settings UI。
 * Phase 5 柱子 2：插件声明 contributes.configuration → 自动渲染。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2
 * VS Code 对标：src/vs/workbench/contrib/preferences/browser/settingsWidgets.ts
 *
 * 结构：顶部搜索栏 + 左侧分组树 + 右侧设置表单。
 * 核心无知原则：Settings Editor 不知道有哪些设置项——全部从 ConfigurationRegistry 派生。
 *
 * 🔥 E5.5#7 多 WebView 改造：数据访问走 window.linkdesk.configuration.* IPC（壳/插件 WebView 通用）。
 *    校正（E5.8#0d.5）：非零 import @src/core——窄引用例外：getFilePath（"以 JSON 打开"需解析 settings.json 真实路径；
 *    useConfigurationValueIpc/MENU_SLOTS 已随 SettingRow 子模块迁入 SettingsView/）。
 *    设置插件 = 保姆插件——配置读写只消费大厅桌子，不直连核心服务。
 *
 * E5.8#0d.10-7e：feature-folder 聚合器——SettingsView/ 6 子模块整迁：
 *   types（三接口）· helpers（lk/常量）· ObjectEditor（对象编辑）· renderControl（控件渲染）·
 *   SettingRow（单设置行）· useSettingsEvents（订阅 effect 组）。
 *   本文件仅剩：主组件 state + loadData + filteredGroups + JSX 编排。
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { InlineInput } from "../../shared/inline-input/InlineInput";
import KeybindingSettingsView from "../keybinding-settings/KeybindingSettingsView";
import { getFilePath } from "../../../core/services/configuration/StorageService"; // E5.8#0d.5："以 JSON 打开"→ 打开 settings.json 真实落盘路径
import SettingRow from "./SettingsView/SettingRow";
import useSettingsEvents from "./SettingsView/useSettingsEvents";
import { lk } from "./SettingsView/helpers";
import type { GroupInfo, ConfigProperty, SettingsViewProps } from "./SettingsView/types";
import "./SettingsView.css";

/* ── 组件 ── */

function SettingsView({ isActive: _isActive }: SettingsViewProps) {
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

  const loadData = useCallback(async () => {
    try {
      const cfg = lk();
      // 并行拉取分组和 schema
      const [entries, schema] = await Promise.all([
        cfg.getConfigurationContributions(),
        cfg.getSchema(),
      ]);
      // E5.7#97：getConfigurationContributions wire 面是 [string, unknown][]——IPC 边界收窄为
      // 主进程 ConfigurationRegistry 组装的 [pluginId, { title, properties }] 形状（一处 cast，边界即守卫）
      const contributions = new Map(
        entries as Array<[string, { title: string; properties: Record<string, unknown> }]>,
      );
      const result: GroupInfo[] = [];
      for (const [pluginId, contrib] of contributions) {
        const keys = Object.keys(contrib.properties ?? {});
        if (keys.length > 0) {
          result.push({ pluginId, title: t(contrib.title ?? pluginId), keys });
        }
      }
      setGroupsRaw(result);
      setAllProps((schema ?? {}) as Record<string, ConfigProperty>);
      setDataLoaded(true);
    } catch (e) {
      console.error("[SettingsView] 加载配置数据失败:", e);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData, version]);

  // ── 订阅/跳转 effect 组（配置变更/插件生命周期/M1 双通道/scrollTo 双通道/外部快捷键事件）──
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
      .filter((g) => g.keys.length > 0);
  }, [groupsRaw, search, allProps]);

  // ── 默认选中第一个分组 ──
  const activeGroup =
    filteredGroups.find((g) => g.pluginId === selectedGroup) ?? filteredGroups[0] ?? null;

  return (
    <div className="settings-editor">
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
                  const filePath = await getFilePath("settings");
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
                      key={g.pluginId}
                      className={`settings-nav-item ${activeGroup?.pluginId === g.pluginId ? "active" : ""}`}
                      onClick={() => setSelectedGroup(g.pluginId)}
                    >
                      {g.title}
                      <span className="settings-nav-count">{g.keys.length}</span>
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
                  <h2 className="settings-group-title">{activeGroup.title}</h2>
                  {activeGroup.keys.map((key) => (
                    <SettingRow
                      key={key}
                      configKey={key}
                      prop={allProps[key]}
                      onChange={() => setVersion((v) => v + 1)}
                    />
                  ))}
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
