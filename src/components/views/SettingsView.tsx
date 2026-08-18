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
 *    校正（E5.8#0d.5）：非零 import @src/core——窄引用例外：useConfigurationValueIpc（IPC 响应式取值）、
 *    MENU_SLOTS（菜单槽常量）、getFilePath（"以 JSON 打开"需解析 settings.json 真实路径）。
 *    设置插件 = 保姆插件——配置读写只消费大厅桌子，不直连核心服务。
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Toggle from "../shared/Toggle";
import SelectBox from "../shared/SelectBox";
import FontFamilySelect from "../shared/FontFamilySelect";
import FilePathInput from "../shared/FilePathInput";
import NumberInput from "../shared/NumberInput";
import { InlineInput } from "../shared/InlineInput";
import KeybindingSettingsView from "./KeybindingSettingsView";
import { useConfigurationValueIpc } from "../../core/react/useConfigurationIpc";
import { MENU_SLOTS } from "../../core/registry/MenuRegistry";
import { getFilePath } from "../../core/services/configuration/StorageService"; // E5.8#0d.5："以 JSON 打开"→ 打开 settings.json 真实落盘路径
import ContextMenu from "../shared/ContextMenu";
import ColorPicker from "../shared/ColorPicker";
import "./SettingsView.css";

/* ── 辅助函数 ── */

function lk() {
  if (!window.linkdesk?.configuration) {
    throw new Error("[SettingsView] window.linkdesk.configuration 不可用");
  }
  return window.linkdesk.configuration;
}

const CUSTOM_EVENT_OPEN_KEYBINDINGS = "linkdesk:openKeybindingsSettings";

/* ── 类型 ── */

interface SettingsViewProps {
  isActive: boolean;
}

interface GroupInfo {
  pluginId: string;
  title: string;
  keys: string[];
}

/** ConfigurationProperty 精简版——IPC 序列化后使用的本地类型 */
interface ConfigProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  enumDescriptions?: string[];
  minimum?: number;
  maximum?: number;
  uiHint?: string;
  renderHint?: string;
  dependsOn?: { key: string; value: unknown };
  onApply?: ((v: unknown) => void) | null; // E4V#46 renderHint "action"
}

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

  // ── 订阅配置变更 → 版本号递增触发刷新 ──
  useEffect(() => {
    try {
      const unsub = lk().onDidChangeConfiguration(() => setVersion((v) => v + 1));
      return unsub;
    } catch { return; }
  }, []);

  // ── 订阅插件生命周期 → 刷新分组列表（插件安装/卸载）──
  useEffect(() => {
    try {
      const unsub = lk().onPluginLifecycleChange(() => setVersion((v) => v + 1));
      return unsub;
    } catch { return; }
  }, []);

  // ── M1 双通道 A：mount 时消费 pending——设置未打开时齿轮"设置"跳转到指定分组 ──
  useEffect(() => {
    lk().consumeSettingsGroup().then((target: string | null) => {
      if (target) {
        setSearch("");
        setSelectedGroup(target);
      }
    }).catch(() => {});
  }, []);

  // ── M1 双通道 B：实时订阅——设置已打开时齿轮"设置"跳转 ──
  useEffect(() => {
    try {
      const unsub = lk().onRequestSettingsGroup((pluginId: string) => {
        setSearch("");
        setSelectedGroup(pluginId);
      });
      return unsub;
    } catch { return; }
  }, []);

  // ── scrollTo 双通道 A：mount 时消费 pending ──
  useEffect(() => {
    lk().consumeScrollToSetting().then((pendingKey: string | null) => {
      if (pendingKey) {
        setSearch("");
        for (const g of groupsRaw) {
          if (g.keys.includes(pendingKey)) {
            setSelectedGroup(g.pluginId);
            break;
          }
        }
        setTimeout(() => {
          document.getElementById(`setting-row-${pendingKey}`)?.scrollIntoView({ block: "center" });
        }, 200);
      }
    }).catch(() => {});
  }, [groupsRaw]);

  // ── scrollTo 双通道 B：实时订阅 ──
  useEffect(() => {
    try {
      const unsub = lk().onRequestScrollToSetting((key: string) => {
        setSearch("");
        for (const g of groupsRaw) {
          if (g.keys.includes(key)) {
            setSelectedGroup(g.pluginId);
            break;
          }
        }
        setTimeout(() => {
          document.getElementById(`setting-row-${key}`)?.scrollIntoView({ block: "center" });
        }, 200);
      });
      return unsub;
    } catch { return; }
  }, [groupsRaw]);

  // ── 监听外部"打开快捷键设置"请求 ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ query?: string }>).detail;
      setActiveTab("keybindings");
      if (detail?.query) setKeybindingQuery(detail.query);
    };
    window.addEventListener(CUSTOM_EVENT_OPEN_KEYBINDINGS, handler);
    return () => window.removeEventListener(CUSTOM_EVENT_OPEN_KEYBINDINGS, handler);
  }, []);

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

/* ── 单个设置行 ── */

function SettingRow({
  configKey,
  prop,
  onChange,
}: {
  configKey: string;
  prop: ConfigProperty | undefined;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const gearRef = useRef<HTMLButtonElement>(null);
  const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<{ x: number; y: number } | null>(null);

  // IPC 版 hook——替代 useConfigurationValue
  const currentValue = useConfigurationValueIpc(configKey);
  const depValue = useConfigurationValueIpc(prop?.dependsOn?.key ?? "");

  const handleChange = useCallback(
    async (value: unknown) => {
      try {
        await lk().set(configKey, value);
        onChange();
      } catch (e) {
        console.error("[SettingsView] 设置失败:", configKey, e);
      }
    },
    [configKey, onChange],
  );

  // 齿轮打开前设 context key
  const handleGearClick = useCallback(async () => {
    try {
      window.linkdesk?.contextKey?.set("settingKey", configKey);
      // inspectConfiguration 异步获取修改状态——wire 面 unknown，IPC 边界收窄（主进程组装 { userValue, ... }）
      const insp = await lk().inspectConfiguration(configKey) as { userValue?: unknown } | undefined;
      window.linkdesk?.contextKey?.set("settingModified", insp?.userValue !== undefined);
    } catch { /* 静默 */ }
    const rect = gearRef.current?.getBoundingClientRect();
    if (rect) {
      setGearAnchor({ x: rect.left, y: rect.bottom + 4 });
    }
  }, [configKey]);

  // 齿轮关闭——清理 context key
  const handleGearClose = useCallback(() => {
    setGearAnchor(null);
    window.linkdesk?.contextKey?.set("settingKey", undefined);
    window.linkdesk?.contextKey?.set("settingModified", false);
  }, []);

  if (!prop) return null;

  // 声明式条件显隐
  if (prop.dependsOn && depValue !== prop.dependsOn.value) return null;

  return (
    <div className="settings-row" id={`setting-row-${configKey}`}>
      <div className="settings-row-info">
        <label className="settings-row-label">{configKey}</label>
        <span className="settings-row-desc">{t(prop.description ?? "")}</span>
      </div>
      <div className="settings-row-control">
        {renderControl(prop, currentValue, handleChange, t, (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setColorPickerAnchor({ x: rect.right + 4, y: rect.top });
          setColorPickerOpen(true);
        })}
      </div>
      {/* hover 齿轮 */}
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
          menuId={MENU_SLOTS.SettingItemGear}
          anchor={gearAnchor}
          context={{ settingKey: configKey }}
          onClose={handleGearClose}
        />
      )}
      {/* 色块点击 → ColorPicker */}
      {prop.renderHint === "color" && (
        <ColorPicker
          open={colorPickerOpen}
          value={String(currentValue ?? prop.default ?? "")}
          onChange={(hex) => handleChange(hex)}
          onClose={() => setColorPickerOpen(false)}
          anchor={colorPickerAnchor}
          presets={["#0078d4", "#e81123", "#10893e", "#ff8c00", "#6b69d6", "#0099bc"]}
        />
      )}
    </div>
  );
}

/* ── ObjectEditor——object/array 配置项键值对编辑器 ── */

function ObjectEditor({ value, onChange }: {
  value: Record<string, unknown>;
  onChange: (newValue: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(value);

  const handleToggle = (k: string, v: boolean) => {
    onChange({ ...value, [k]: v });
  };

  const handleKeyChange = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const newObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      newObj[k === oldKey ? newKey : k] = v;
    }
    onChange(newObj);
  };

  const handleValueChange = (k: string, v: string) => {
    onChange({ ...value, [k]: v });
  };

  const handleDelete = (k: string) => {
    const { [k]: _, ...rest } = value;
    onChange(rest);
  };

  const handleAdd = () => {
    const baseKey = t("newPattern");
    let candidate = baseKey;
    let i = 1;
    while (candidate in value) {
      candidate = `${baseKey}${i}`;
      i++;
    }
    onChange({ ...value, [candidate]: true });
  };

  return (
    <div className="object-editor">
      {entries.map(([k, v]) => (
        <div key={k} className="object-editor-row">
          <input
            className="input object-editor-key"
            type="text"
            defaultValue={k}
            onBlur={(e) => handleKeyChange(k, e.target.value)}
            spellCheck={false}
          />
          <span className="object-editor-colon">:</span>
          {typeof v === "boolean" ? (
            <button
              className={`object-editor-toggle ${v ? "object-editor-toggle--on" : ""}`}
              onClick={() => handleToggle(k, !v)}
              title={v ? t("已启用") : t("已禁用")}
            >
              <span className={`codicon ${v ? "codicon-check" : "codicon-close"}`} />
            </button>
          ) : typeof v === "number" ? (
            <input
              className="input object-editor-value"
              type="number"
              defaultValue={v}
              onBlur={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
            />
          ) : (
            <input
              className="input object-editor-value"
              type="text"
              defaultValue={String(v)}
              onBlur={(e) => handleValueChange(k, e.target.value)}
              spellCheck={false}
            />
          )}
          <button
            className="object-editor-delete"
            onClick={() => handleDelete(k)}
            title={t("删除")}
          >
            <span className="codicon codicon-trash" />
          </button>
        </div>
      ))}
      <button className="object-editor-add" onClick={handleAdd}>
        <span className="codicon codicon-add" />
        <span>{t("添加模式")}</span>
      </button>
    </div>
  );
}

/** 根据 property type 渲染对应控件 */
function renderControl(
  prop: ConfigProperty,
  value: unknown,
  onChange: (v: unknown) => void,
  t: (key: string) => string,
  onColorSwatchClick?: (e: React.MouseEvent<HTMLDivElement>) => void,
): React.ReactNode {
  const val = value ?? prop.default;

  // uiHint 优先——plugin.json 声明式控件选择
  switch (prop.uiHint) {
    case "fontSize":
      return (
        <NumberInput
          value={Number(val)}
          onChange={(v) => onChange(v)}
          min={8}
          max={72}
          step={1}
        />
      );
    case "color":
      return (
        <div className="settings-color-control">
          <div
            className="settings-color-swatch"
            style={{ background: String(val) }}
            title={String(val)}
            onClick={onColorSwatchClick}
          />
          <input
            className="input"
            type="text"
            value={String(val)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "fontFamily":
      return <FontFamilySelect value={String(val)} onChange={(v) => onChange(v)} />;
    case "file":
      return <FilePathInput value={String(val)} onChange={(v) => onChange(v)} dialogType="file" />;
    case "directory":
      return <FilePathInput value={String(val)} onChange={(v) => onChange(v)} dialogType="directory" />;
    default:
      break;
  }

  switch (prop.type) {
    case "boolean":
      return (
        <Toggle
          checked={!!val}
          onChange={(v) => onChange(v)}
        />
      );

    case "string":
      // renderHint "action"：渲染操作按钮
      if (prop.renderHint === "action") {
        return (
          <button
            className="settings-action-btn"
            onClick={() => { prop.onApply?.(null); }}
          >
            {t(prop.description ?? "")}
          </button>
        );
      }
      if (prop.enum && prop.enum.length > 0) {
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
      // renderHint "color" → 色块预览
      if (prop.renderHint === "color") {
        return (
          <div className="settings-color-control">
            <div
              className="settings-color-swatch"
              style={{ background: String(val) }}
              title={String(val)}
              onClick={onColorSwatchClick}
            />
            <input
              className="input"
              type="text"
              value={String(val)}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
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
        <NumberInput
          value={Number(val)}
          onChange={(v) => onChange(v)}
          min={prop.minimum}
          max={prop.maximum}
        />
      );

    case "object": {
      const obj = (typeof val === "object" && val !== null && !Array.isArray(val))
        ? (val as Record<string, unknown>)
        : {};
      return <ObjectEditor value={obj} onChange={(newObj) => onChange(newObj)} />;
    }

    case "array": {
      const arr = Array.isArray(val) ? val : [];
      const obj: Record<string, unknown> = {};
      arr.forEach((item, i) => { obj[String(i)] = item; });
      return (
        <ObjectEditor
          value={obj}
          onChange={(newObj) => {
            const newArr = Object.values(newObj);
            onChange(newArr);
          }}
        />
      );
    }

    default:
      return <span className="text-muted">{String(val)}</span>;
  }
}

export default SettingsView;
