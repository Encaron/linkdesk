/**
 * 漂亮设置——第三方整套软件设置 UI（E5.8#41.14 子D demo，E5.8#41.17 大改）。
 * 不是内置副本：按工厂角色并存 mockup（01-形态一形态二-复杂场景图.html）形态二「漂亮设置」大改——
 *   banner 头 + 卡片分区（全部配置组 = 卡片网格，含角色组胶囊行 + 快捷键键帽卡）+ 右下角胶囊切换套。
 * 同一份数据（getConfigurationContributions / getSchema / factorySlots / keybindings），不同的画布。
 *
 * 🔥 自己的类命名空间 .settings-demo / .sd-*（E5.8#41.17 bug2 根治）：本文件渲染的所有覆盖类、
 *    共享 SettingRow 类的覆盖规则一律挂 .settings-demo 根类——结构性消灭跨插件 CSS 污染
 *    （旧版微改样式的 .settings-form .settings-row / .settings-role-switch--gen 裸类泄漏进内置套）。
 *
 * @src 依赖处置（#41.14）：共享控件（InlineInput/Toggle/SelectBox/...）走 @src/components/shared
 *   例外表白名单；数据全走 window.linkdesk.*（零 @src/core）。
 * 核心无知原则：不知道有哪些设置项——全部从 ConfigurationRegistry 派生。
 * 事件订阅复用 useSettingsEvents（M1 双通道/scrollTo 双通道/契约双通道/配置/生命周期）——
 *   因无导航组/无内部 tab，setSelectedGroup/setActiveTab 适配为「滚动到卡片 / 闪烁快捷键卡」。
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { InlineInput } from "@src/components/shared/inline-input/InlineInput";
import SettingRow from "./SettingsView/SettingRow";
import KeybindingChips from "./SettingsView/KeybindingChips";
import useSettingsEvents from "./SettingsView/useSettingsEvents";
import { lk, OWN_FACTORY_ROLE } from "./SettingsView/helpers";
import type { GroupInfo, ConfigProperty, SettingsViewProps } from "./SettingsView/types";
import "./SettingsView.css";

/* ── 组件 ── */

function SettingsView({ isActive: _isActive, tabId }: SettingsViewProps) {
  const { t } = useTranslation();

  const [search, setSearch] = useState("");
  const [version, setVersion] = useState(0);

  // ── 异步数据：配置分组 + 合并 schema ──
  const [groupsRaw, setGroupsRaw] = useState<GroupInfo[]>([]);
  const [allProps, setAllProps] = useState<Record<string, ConfigProperty>>({});
  const [dataLoaded, setDataLoaded] = useState(false);

  // ── 顶部通用区（E5.8#41.13）——本角色（设置套）全部候选 + 激活 id，用于切整套设置 UI。
  //    本套 UI 形态 = 右下角胶囊（mockup .fancy-switch），非内置的顶部条 ──
  const [settingsCandidates, setSettingsCandidates] = useState<{ pluginId: string; title: string }[]>([]);
  const [settingsActiveId, setSettingsActiveId] = useState<string | undefined>();

  // ── 卡片网格跳转（无导航组）：齿轮「设置」→ 滚动到目标组卡片 ──
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  // ── 快捷键卡搜索词（「打开快捷键设置」命令 query 契约通道写入）──
  const [kbQuery, setKbQuery] = useState<string | undefined>();

  // ── 快捷键卡片闪烁（「打开快捷键设置」命令 → 滚动 + 高亮脉冲）──
  const [kbFlash, setKbFlash] = useState(0);
  const handleOpenKb = useCallback(() => setKbFlash((v) => v + 1), []);

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
      //    卡片头 + 胶囊行切换按钮、激活套配置在下；复用同名组优先（按 pluginId 找激活候选自己的配置组，
      //    非显示名）、没有才新建；激活套无配置项 → 空状态。自身角色切换 = 右下角胶囊（#41.13），不进卡片。
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
          // 复用同名组：切换胶囊直接进激活候选自己的配置组，不新建
          const idx = result.findIndex((g) => g.pluginId === active.pluginId);
          if (idx >= 0) {
            result[idx] = { ...result[idx], role, candidates, activeId: active.pluginId };
          } else {
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
  //    无导航组 + 无内部 tab 的适配：setSelectedGroup → 滚动到卡片；setActiveTab → 闪烁快捷键卡。
  useSettingsEvents({
    setVersion,
    setSearch,
    setSelectedGroup: setScrollTarget,
    setActiveTab: handleOpenKb,
    setKeybindingQuery: setKbQuery,
    groupsRaw,
  });

  // ── 滚动到目标组卡片 ──
  useEffect(() => {
    if (!scrollTarget) return;
    document.getElementById(`sd-card-${scrollTarget}`)?.scrollIntoView({ block: "center" });
  }, [scrollTarget]);

  // ── 快捷键卡闪烁（打开快捷键设置命令 → 滚动 + 1.2s 高亮脉冲）──
  useEffect(() => {
    if (!kbFlash) return;
    document.getElementById("sd-card-keybindings")?.scrollIntoView({ block: "center" });
    const id = setTimeout(() => setKbFlash(0), 1200);
    return () => clearTimeout(id);
  }, [kbFlash]);

  // ── 搜索过滤（配置分组按匹配键保留；角色分组按标题匹配保留——空配置组搜索标题仍可达）──
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
        await window.linkdesk.tabs.close(tabId).catch(() => {});
      }
      await window.linkdesk.tabs.create(targetId).catch(() => {});
    } catch (e) {
      console.error(`[SettingsView] 切换设置套 "${targetId}" 失败:`, e);
    }
  }, [tabId, settingsActiveId]);

  // ── 打开 settings.json（同内置：走 fileAssociation 不写死编辑器插件 ID——硬约束 #10）──
  const openJson = useCallback(async () => {
    try {
      const dir = await window.linkdesk.path?.appDataDir?.();
      const filePath = dir ? window.linkdesk.path.join(dir, "settings.json") : "";
      if (!filePath) return;
      const pluginId = await window.linkdesk.fileAssociation.getPluginFor("json");
      await window.linkdesk.tabs.create(pluginId || "", {
        filePath,
        sourceId: filePath,
        label: "settings.json",
        pinned: true,
      });
    } catch { /* 静默 */ }
  }, []);

  return (
    <div className="settings-demo">
      {/* 右下角胶囊切换（E5.8#41.13）——本套 UI 形态：右下角悬浮胶囊，非内置顶部条（mockup .fancy-switch）。
          删除任意一套 → onPluginLifecycleChange → version 重拉 → 按钮自动消失 */}
      {settingsCandidates.length >= 2 && (
        <div className="sd-switch">
          <span className="sd-switch-label">{t("设置套切换")}</span>
          {settingsCandidates.map((c) => (
            <button
              key={c.pluginId}
              className={`sd-switch-btn ${c.pluginId === settingsActiveId ? "active" : ""}`}
              onClick={() => handleSettingsSwitch(c.pluginId)}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      {/* banner 头（mockup .fancy-header）——本套 UI 的标志性横幅 */}
      <div className="sd-header">
        <span className="sd-logo"><span className="codicon codicon-settings" /></span>
        <span className="sd-title">{t("漂亮设置")}</span>
        <span className="sd-sub">{t("· 第三方整套软件设置 UI")}</span>
        <span className="sd-header-spacer" />
        <button className="sd-json-btn" title={t("打开设置 (JSON)")} onClick={openJson}>
          <span className="codicon codicon-json" />
          <span className="sd-json-label">{t("JSON")}</span>
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="sd-search-bar">
        <span className="codicon codicon-search sd-search-icon" />
        <InlineInput
          size="normal"
          value={search}
          onChange={setSearch}
          onConfirm={setSearch}
          onCancel={() => setSearch("")}
          placeholder={t("搜索设置")}
        />
      </div>

      {/* 卡片网格（mockup .fancy-cards/.fancy-card）——全部配置组 = 卡片 */}
      <div className="sd-cards">
        {!dataLoaded && groupsRaw.length === 0 ? (
          <div className="sd-empty sd-empty-grid">{t("加载中...")}</div>
        ) : filteredGroups.length === 0 ? (
          <div className="sd-empty sd-empty-grid">{t("无匹配设置")}</div>
        ) : (
          <>
            {filteredGroups.map((g) => (
              <div className="sd-card" key={g.role ?? g.pluginId} id={`sd-card-${g.role ?? g.pluginId}`}>
                <div className="sd-card-head">
                  {g.title}
                  {g.role && <span className="sd-role-tag">{t("{{n}} 候选", { n: g.candidates?.length ?? 0 })}</span>}
                </div>
                {/* 角色分组（#41.14 ⑤）：卡片头下胶囊行切换、激活套配置在下（mockup .fancy-serial-row） */}
                {g.role && g.candidates && (
                  <div className="sd-role-row">
                    {g.candidates.map((c) => (
                      <button
                        key={c.pluginId}
                        className={`sd-role-btn ${c.pluginId === g.activeId ? "active" : ""}`}
                        onClick={() => handleRoleSwitch(g.role!, c.pluginId)}
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>
                )}
                {g.keys.length > 0 ? (
                  g.keys.map((key) => (
                    <SettingRow
                      key={key}
                      configKey={key}
                      prop={allProps[key]}
                      onChange={() => setVersion((v) => v + 1)}
                    />
                  ))
                ) : g.role ? (
                  <div className="sd-empty">{t("激活套无配置项")}</div>
                ) : null}
              </div>
            ))}
            {/* 快捷键卡（mockup 帧③）——同一份快捷键数据，插件作者画键帽横排，不走平铺表格 */}
            <div className={`sd-card sd-card-kb ${kbFlash ? "flash" : ""}`} id="sd-card-keybindings">
              <div className="sd-card-head">
                <span className="codicon codicon-keyboard sd-card-head-icon" />
                {t("快捷键")}
                <span className="sd-role-tag">{t("设置页自己的子页")}</span>
              </div>
              <KeybindingChips
                query={kbQuery}
                onQueryChange={setKbQuery}
                highlighted={kbFlash > 0}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SettingsView;
