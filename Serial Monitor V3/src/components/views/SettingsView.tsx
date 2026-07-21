/**
 * Settings Editor——对标 VS Code Settings UI。
 * Phase 5 柱子 2：插件声明 contributes.configuration → 自动渲染。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2
 * VS Code 对标：src/vs/workbench/contrib/preferences/browser/settingsWidgets.ts
 *
 * 结构：顶部搜索栏 + 左侧分组树 + 右侧设置表单。
 * 核心无知原则：Settings Editor 不知道有哪些设置项——全部从 ConfigurationRegistry 派生。
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Toggle from "../shared/Toggle";
import Select from "../shared/Select";
import {
  getConfigurationContributions,
  getMergedSchema,
  type ConfigurationProperty,
} from "../../core/ConfigurationRegistry";
import {
  getConfigurationValue,
  setConfigurationValue,
} from "../../core/ConfigurationService";
import "./SettingsView.css";

/* ── 类型 ── */

interface SettingsViewProps {
  isActive: boolean;
}

interface GroupInfo {
  pluginId: string;
  title: string;
  keys: string[];
}

/* ── 组件 ── */

function SettingsView({ isActive: _isActive }: SettingsViewProps) {
  const { t } = useTranslation();

  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // 监听配置值变更
  useEffect(() => {
    import("../../core/ConfigurationService").then(({ onDidChangeConfiguration }) => {
      onDidChangeConfiguration(() => setVersion((v) => v + 1));
    });
  }, []);

  // 监听插件卸载/禁用——配置分组需要刷新（unregisterConfiguration 不触发 onDidChangeConfiguration）
  useEffect(() => {
    const onPluginChanged = () => setVersion((v) => v + 1);
    window.addEventListener("plugin-removed", onPluginChanged);
    window.addEventListener("plugin-installed", onPluginChanged);
    return () => {
      window.removeEventListener("plugin-removed", onPluginChanged);
      window.removeEventListener("plugin-installed", onPluginChanged);
    };
  }, []);

  // 从 Registry 派生分组列表——title/description 走 t() 做 i18n
  const groups = useMemo(() => {
    const contributions = getConfigurationContributions();
    const result: GroupInfo[] = [];

    for (const [pluginId, contrib] of contributions) {
      const keys = Object.keys(contrib.properties);
      if (keys.length > 0) {
        result.push({ pluginId, title: t(contrib.title), keys });
      }
    }

    return result;
  }, [version, t]);

  // 所有 properties——必须在 filteredGroups 之前定义（搜索过滤引用 allProps）
  const allProps = useMemo(() => getMergedSchema(), [version]);

  // 搜索过滤
  const filteredGroups = useMemo(() => {
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
  }, [groups, search, version]);

  // 默认选中第一个分组
  const activeGroup =
    filteredGroups.find((g) => g.pluginId === selectedGroup) ?? filteredGroups[0] ?? null;

  return (
    <div className="settings-editor">
      {/* 搜索栏 + Open JSON 按钮 */}
      <div className="settings-search-bar">
        <span className="codicon codicon-search settings-search-icon" />
        <input
          className="settings-search-input"
          type="text"
          placeholder={t("搜索设置")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="settings-json-btn"
          title={t("打开设置 (JSON)")}
          onClick={() => {
            // TODO Phase 6 §2.17：Monaco JSON 编辑器标签页，对标 VS Code "Open Settings (JSON)"
            // 当前占位——Phase 6 替换为 createTab("editor", {filePath: settings.json})
            // 文档：docs/phase5_应用基础设施/V3-Phase5-Phase6-通盘分析.md §2.17
            import("../../core/ConfigurationService").then(({ getUserSettings }) => {
              const settings = getUserSettings();
              alert("settings.json 内容:\n\n" + JSON.stringify(settings, null, 2));
            });
          }}
        >
          <span className="codicon codicon-json" />
          <span className="settings-json-label">{t("JSON")}</span>
        </button>
      </div>

      <div className="settings-body">
        {/* 左侧分组树 */}
        <nav className="settings-nav">
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
    </div>
  );
}

/* ── 单个设置行 ── */

function SettingRow({
  configKey,
  prop,
  onChange,
}: {
  configKey: string;
  prop: ConfigurationProperty | undefined;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  if (!prop) return null;

  const currentValue = getConfigurationValue(configKey);

  const handleChange = useCallback(
    async (value: unknown) => {
      await setConfigurationValue(configKey, value, "user");
      onChange();
    },
    [configKey, onChange]
  );

  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <label className="settings-row-label">{configKey}</label>
        <span className="settings-row-desc">{t(prop.description)}</span>
      </div>
      <div className="settings-row-control">
        {renderControl(prop, currentValue, handleChange, t)}
      </div>
    </div>
  );
}

/** 根据 property type 渲染对应控件——使用共享组件对标终端侧栏样式 */
function renderControl(
  prop: ConfigurationProperty,
  value: unknown,
  onChange: (v: unknown) => void,
  t: (key: string) => string,
): React.ReactNode {
  const val = value ?? prop.default;

  switch (prop.type) {
    case "boolean":
      return (
        <Toggle
          checked={!!val}
          onChange={(v) => onChange(v)}
        />
      );

    case "string":
      if (prop.enum && prop.enum.length > 0) {
        // Phase 5e：enum 选项用 {value, label} 显示中文标签——对齐终端侧栏
        const enumOptions = prop.enum.map((v) => ({
          value: v,
          label: t(v), // "text"→"文本", "hex"→"HEX", etc.
        }));
        return (
          <Select
            value={String(val)}
            options={enumOptions}
            onChange={(v) => onChange(v)}
          />
        );
      }
      return (
        <input
          className="input"
          type="text"
          value={String(val)}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <input
          className="input"
          type="number"
          min={prop.minimum}
          max={prop.maximum}
          value={Number(val)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: 80 }}
        />
      );

    default:
      return <span className="text-muted">{String(val)}</span>;
  }
}

export default SettingsView;
