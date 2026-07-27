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

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Toggle from "../shared/Toggle";
import SelectBox from "../shared/SelectBox";
import KeybindingSettingsView from "./KeybindingSettingsView"; // E3f #59
import { CUSTOM_EVENTS } from "../../core/CoreEvents"; // E3f #59
import {
  getConfigurationContributions,
  getMergedSchema,
  consumeSettingsGroup,
  onRequestSettingsGroup,
  consumeScrollToSetting,
  onRequestScrollToSetting,
  type ConfigurationProperty,
} from "../../core/ConfigurationRegistry";
import {
  getConfigurationValue,
  setConfigurationValue,
  inspectConfiguration,
} from "../../core/ConfigurationService";
import { onPluginLifecycleChange } from "../../pluginLoader/lifecycle";
import { MenuId } from "../../core/MenuRegistry";
import { ContextKeyService } from "../../core/ContextKeyService";
import ContextMenu from "../shared/ContextMenu";
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

  // E3f #59：双 tab——设置 / 快捷键
  const [activeTab, setActiveTab] = useState<"settings" | "keybindings">("settings");

  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [keybindingQuery, setKeybindingQuery] = useState<string | undefined>(); // E3f #59
  const [version, setVersion] = useState(0);
  const [jsonDialog, setJsonDialog] = useState<string | null>(null); // null=关闭, string=JSON 内容

  // 监听配置值变更
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    import("../../core/ConfigurationService").then(({ onDidChangeConfiguration }) => {
      unsubscribe = onDidChangeConfiguration(() => setVersion((v) => v + 1));
    });
    return () => { unsubscribe?.(); };
  }, []);

  // 监听插件生命周期——配置分组需要刷新（对标 IconBar 订阅 viewRegistry 的模式）
  useEffect(() => {
    return onPluginLifecycleChange.event(() => setVersion((v) => v + 1));
  }, []);

  // M1 双通道 A：mount 时消费 pending 变量——设置未打开时齿轮"设置"跳转到指定分组
  useEffect(() => {
    const target = consumeSettingsGroup();
    if (target) {
      setSearch("");
      setSelectedGroup(target);
    }
  }, []);

  // M1 双通道 B：Emitter 订阅——设置已打开时齿轮"设置"实时跳转
  useEffect(() => {
    return onRequestSettingsGroup.event((pluginId) => {
      setSearch("");
      setSelectedGroup(pluginId);
    });
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

  // E3f #59：监听外部"打开快捷键设置"请求——从命令面板齿轮跳转
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ query?: string }>).detail;
      setActiveTab("keybindings");
      if (detail?.query) setKeybindingQuery(detail.query);
    };
    window.addEventListener(CUSTOM_EVENTS.OPEN_KEYBINDINGS_SETTINGS, handler);
    return () => window.removeEventListener(CUSTOM_EVENTS.OPEN_KEYBINDINGS_SETTINGS, handler);
  }, []);

  // E3f #53e：scrollTo 订阅——跳转到设置中指定配置项（#53b 命令面板齿轮"重置选项"消费）
  useEffect(() => {
    // mount 时消费 pending 值
    const pendingKey = consumeScrollToSetting();
    if (pendingKey) {
      setSearch("");
      for (const g of groups) {
        if (g.keys.includes(pendingKey)) {
          setSelectedGroup(g.pluginId);
          break;
        }
      }
      setTimeout(() => {
        document.getElementById(`setting-row-${pendingKey}`)?.scrollIntoView({ block: "center" });
      }, 150);
    }
    // 已打开时实时滚动
    return onRequestScrollToSetting.event((key) => {
      setSearch("");
      for (const g of groups) {
        if (g.keys.includes(key)) {
          setSelectedGroup(g.pluginId);
          break;
        }
      }
      setTimeout(() => {
        document.getElementById(`setting-row-${key}`)?.scrollIntoView({ block: "center" });
      }, 150);
    });
  }, [groups]);

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
      {/* E3f #59：双 tab——设置 / 快捷键 */}
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
                // 当前占位——React 弹窗代替 alert()，避免 Electron 原生对话框焦点不归还导致控件无法交互
                import("../../core/ConfigurationService").then(({ getUserSettings }) => {
                  setJsonDialog(JSON.stringify(getUserSettings(), null, 2));
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

          {/* JSON 设置弹窗——用 React 弹窗代替 alert()，避免 Electron 原生对话框焦点不归还导致控件无法交互 */}
          {jsonDialog !== null && (
            <div className="settings-json-overlay" onClick={() => setJsonDialog(null)}>
              <div className="settings-json-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="settings-json-header">
                  <span className="settings-json-title">settings.json</span>
                  <button
                    className="settings-json-close"
                    onClick={() => setJsonDialog(null)}
                  >
                    {t("确定")}
                  </button>
                </div>
                <pre className="settings-json-content">{jsonDialog}</pre>
              </div>
            </div>
          )}
        </>
      )}
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
  const gearRef = useRef<HTMLButtonElement>(null);
  const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);
  const currentValue = getConfigurationValue(configKey);

  const handleChange = useCallback(
    async (value: unknown) => {
      await setConfigurationValue(configKey, value, "user");
      onChange();
    },
    [configKey, onChange]
  );

  // E3f #53d：齿轮打开前设 context key（settingModified 给 ContextMenu 的 when 过滤用）
  const handleGearClick = useCallback(() => {
    const insp = inspectConfiguration(configKey);
    ContextKeyService.setValue("settingKey", configKey);
    ContextKeyService.setValue("settingModified", insp.userValue !== undefined);
    const rect = gearRef.current?.getBoundingClientRect();
    if (rect) {
      setGearAnchor({ x: rect.left, y: rect.bottom + 4 });
    }
  }, [configKey]);

  // 齿轮关闭——清理 context key
  const handleGearClose = useCallback(() => {
    setGearAnchor(null);
    ContextKeyService.setValue("settingKey", undefined);
    ContextKeyService.setValue("settingModified", false);
  }, []);

  if (!prop) return null;

  // E3f #59d0：声明式条件显隐——prop.dependsOn.key 的值不等于指定值时整行不渲染
  if (prop.dependsOn) {
    const depValue = getConfigurationValue(prop.dependsOn.key);
    if (depValue !== prop.dependsOn.value) return null;
  }

  return (
    <div className="settings-row" id={`setting-row-${configKey}`}>
      <div className="settings-row-info">
        <label className="settings-row-label">{configKey}</label>
        <span className="settings-row-desc">{t(prop.description)}</span>
      </div>
      <div className="settings-row-control">
        {renderControl(prop, currentValue, handleChange, t)}
      </div>
      {/* E3f #53c：hover 齿轮——对标 VS Code Settings Editor per-setting gear */}
      <button
        ref={gearRef}
        className="settings-row-gear"
        title={t("更多操作")}
        onClick={handleGearClick}
      >
        <span className="codicon codicon-gear" />
      </button>
      {gearAnchor && (
        <ContextMenu
          menuId={MenuId.SettingItemGear}
          anchor={gearAnchor}
          context={{ settingKey: configKey }}
          onClose={handleGearClose}
        />
      )}
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
        // E2c #13 16.1：enumDescriptions 优先于 enum 作为 label 来源。
        // prop.enumDescriptions[i] 与 prop.enum[i] 一一对应——值是 "hex" 但显示 "HEX 编码"。
        const enumOptions = prop.enum.map((v, i) => ({
          value: v,
          label: prop.enumDescriptions?.[i] ? t(prop.enumDescriptions[i]) : t(v),
        }));
        return (
          <SelectBox
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
