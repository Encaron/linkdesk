/**
 * Settings Editor——对标 VS Code Settings UI。
 * Phase 5 柱子 2：插件声明 contributes.configuration → 自动渲染。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2
 *
 * 结构：左侧分组树 + 右侧设置表单 + 顶部搜索栏。
 * 核心无知原则：Settings Editor 不知道有哪些设置项——全部从 ConfigurationRegistry 派生。
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  // 刷新计数器——配置变更时重渲染
  const [version, setVersion] = useState(0);

  // 监听配置变更
  useEffect(() => {
    import("../../core/ConfigurationService").then(({ onDidChangeConfiguration }) => {
      onDidChangeConfiguration(() => setVersion((v) => v + 1));
    });
  }, []);

  // 从 Registry 派生分组列表和 schema
  const { groups } = useMemo(() => {
    const contributions = getConfigurationContributions();
    const schema = getMergedSchema();
    const groups: GroupInfo[] = [];

    for (const [pluginId, contrib] of contributions) {
      const keys = Object.keys(contrib.properties);
      if (keys.length > 0) {
        groups.push({ pluginId, title: contrib.title, keys });
      }
    }

    return {
      groups,
      allKeys: Object.keys(schema),
    };
  }, [version]);

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

  // 所有 properties（跨所有分组）
  const allProps = useMemo(() => getMergedSchema(), [version]);

  return (
    <div className="settings-editor">
      {/* 搜索栏 */}
      <div className="settings-search-bar">
        <span className="codicon codicon-search settings-search-icon" />
        <input
          className="settings-search-input"
          type="text"
          placeholder={t("搜索设置")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
        <span className="settings-row-desc">{prop.description}</span>
      </div>
      <div className="settings-row-control">
        {renderControl(prop, currentValue, handleChange)}
      </div>
    </div>
  );
}

/** 根据 property type 渲染对应控件 */
function renderControl(
  prop: ConfigurationProperty,
  value: unknown,
  onChange: (v: unknown) => void
): React.ReactNode {
  const val = value ?? prop.default;

  switch (prop.type) {
    case "boolean":
      return (
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="settings-toggle-knob" />
        </label>
      );

    case "string":
      if (prop.enum && prop.enum.length > 0) {
        return (
          <select
            className="settings-select"
            value={String(val)}
            onChange={(e) => onChange(e.target.value)}
          >
            {prop.enum.map((opt, i) => (
              <option key={opt} value={opt}>
                {prop.enumDescriptions?.[i] ?? opt}
              </option>
            ))}
          </select>
        );
      }
      return (
        <input
          className="settings-input"
          type="text"
          value={String(val)}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <input
          className="settings-input settings-number"
          type="number"
          min={prop.minimum}
          max={prop.maximum}
          value={Number(val)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );

    default:
      return <span className="settings-unsupported">{String(val)}</span>;
  }
}

export default SettingsView;
