/**
 * 系统插槽机制——壳通过角色名查找对应的插件，不硬编码 pluginId。
 *
 * 对标 VS Code：VS Code 的 settings/marketplace 是内置功能，不可替换。
 * LinkDesk 更进一步——这些是普通插件，壳只通过 factoryRole 查找。
 * 用户可以换一套设置插件：声明 factoryRole: "settings" → Ctrl+, 自动打开新插件。
 *
 * E2c #19e。E5.8#41.11（Phase 8.2 方案 A）：**一槽多插件**——`Map<FactoryRole, string[]>`。
 * 多个插件声明同一 factoryRole = **合法并存**（形态二进槽，设计见 工厂角色并存 档案）：
 *   - 候选全收——不再静默 first-wins（旧实现 `if (!has) set` = 两个设置插件谁先扫到谁赢 = #41.5 同碰撞类隐患）
 *   - 默认 = core:true 优先、否则注册序首声明（稳定排序保证「第一个 core:true 胜出」——不再靠扫描序巧合）
 *   - 多候选 fail-loud 诊断点名全部候选 + 默认（对标 #24.6 失败必出声；每候选集合变化才重喷一次）
 * 路由停靠点：**#41.11 消费方全走 `getDefaultPluginId`**（保持「默认=内置」行为）——概念生效的路由翻转在
 * #41.12 改 `getActive()`（读持久化激活套）。#41.11 不暴露 window.linkdesk.factorySlots.*（#41.14 ⑤ 才建）。
 *
 * E5.8#41.12（Phase 8.2 方案 A）：**活动套**——`getActive(role)` / `setActive(role, pluginId)`。
 *   活动 = 用户切换的激活套（读持久化，无记录/已卸载回退默认）；setActive 校验候选后落盘
 *   （PluginStateService `app.factorySlot:active:<role>` 键）——重启保持。概念生效接缝：
 *   消费方（openSettings/lifecycle/图标栏槽位感知）#41.11 用 getDefaultPluginId → #41.12 翻转 getActive。
 *   window.linkdesk.settings.* 三方法面（list/getActive/setActive）由 #41.12 建，泛化 factorySlots.* 在 #41.14 ⑤。
 */

import type { PluginManifest } from "../../api/types";
import { PluginLifecycle } from "../../../pluginLoader/lifecycle";
import { getLoadedPluginManifests } from "../../../pluginLoader/loader";
// E5.8#41.12：活动套落盘——持久化「用户选了哪套设置」，重启保持
import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../plugins/PluginStateService";

/* ── 类型 ── */

/** 系统插槽角色——插件声明自己填充哪个系统级功能。 */
export type FactoryRole = string;

/** 插件条目——initialize() 的输入。 */
export interface SlotPluginEntry {
  pluginId: string;
  manifest: PluginManifest;
}

/** 按角色收集的候选——default 解析需要 core 标志。 */
interface RoleCandidate {
  pluginId: string;
  core: boolean;
}

/** 活动套持久化键——按角色分区（role 含冒号时键仍唯一，防跨角色串号）。 */
function activeKey(role: FactoryRole): string {
  return `factorySlot:active:${role}`;
}

/* ── 实现 ── */

export class FactorySlots {
  private _slots = new Map<FactoryRole, string[]>();
  /** fail-loud 诊断去重——记录每角色最后诊断的候选签名，候选集合变化才重喷（refresh 不刷屏）。 */
  private _diagnosedSig = new Map<FactoryRole, string>();

  constructor() {
    // 桌子管理规则——机制 2：插件进出自动重扫描
    PluginLifecycle.onDidInstall.event(() => {
      this.refreshFromPlugins();
    });
    PluginLifecycle.onDidUninstall.event(() => {
      this.refreshFromPlugins();
    });
  }

  /**
   * 扫描所有已加载插件，自动填充插槽。
   * 一对多：每角色收集全部候选；稳定排序 core:true 置前（默认 = 内置），其余按注册序。
   * 多候选并存合法——但默认解析显式 fail-loud 出声（对标 #24.6 失败必出声，不静默抢椅）。
   * 必须在插件加载完成后、首次消费前调用。
   */
  initialize(plugins: Iterable<SlotPluginEntry>): void {
    const byRole = new Map<FactoryRole, RoleCandidate[]>();
    for (const p of plugins) {
      const role = p.manifest.factoryRole as FactoryRole | undefined;
      if (!role) continue;
      const list = byRole.get(role) ?? [];
      list.push({ pluginId: p.pluginId, core: !!p.manifest.core });
      byRole.set(role, list);
    }
    for (const [role, candidates] of byRole) {
      // 稳定排序：core:true 置前（ES2019 起稳定）——「第一个 core:true 胜出」由排序保证，非扫描序巧合
      candidates.sort((a, b) => Number(b.core) - Number(a.core));
      this._slots.set(role, candidates.map((c) => c.pluginId));
      if (candidates.length > 1) {
        const sig = candidates.map((c) => c.pluginId).sort().join(",");
        if (this._diagnosedSig.get(role) !== sig) {
          this._diagnosedSig.set(role, sig);
          const names = candidates.map((c) => c.pluginId).join(" / ");
          console.error(
            `[FactorySlots] 角色 "${role}" 多候选并存：${names}。默认 = "${candidates[0].pluginId}"（core:true 优先，否则注册序首声明）——并存合法（形态二进槽，激活套占槽、非激活套图标隐藏），用户可在设置 UI 切换激活套。`
          );
        }
      }
    }
  }

  /**
   * 从当前已加载插件重新扫描插槽。
   * 插件安装/卸载/启用/禁用后自动调用——调用方无需手动刷新。
   */
  refreshFromPlugins(): void {
    const plugins = getLoadedPluginManifests().map((p) => ({
      pluginId: p.pluginId,
      manifest: p.manifest,
    }));
    this._slots.clear();
    this.initialize(plugins);
  }

  /** 获取填充指定角色的全部候选插件 ID（默认=首）。未填充返回空数组（拷贝防外改）。 */
  getPluginIds(role: FactoryRole): string[] {
    return [...(this._slots.get(role) ?? [])];
  }

  /** 获取填充指定角色的默认插件 ID（core:true 优先，否则首声明）。未找到返回 undefined。 */
  getDefaultPluginId(role: FactoryRole): string | undefined {
    return this._slots.get(role)?.[0];
  }

  /** 检查是否有插件填充了该角色。 */
  hasSlot(role: FactoryRole): boolean {
    return (this._slots.get(role)?.length ?? 0) > 0;
  }

  // ── E5.8#41.12：活动套——用户切换的激活插件，落盘持久化（重启保持）──

  /**
   * 获取填充指定角色的**活动**插件 ID。
   * 读持久化激活套（#41.12 落盘）；无记录 / 已卸载（候选列表漂移）→ 回退默认。
   * #41.11 停靠点 getDefaultPluginId 是「默认=内置」行为；#41.12 起消费方翻转走 getActive。
   */
  getActive(role: FactoryRole): string | undefined {
    const candidates = this.getPluginIds(role);
    if (candidates.length === 0) return undefined;
    const activeId = getPluginStateValue<string>(APP_PLUGIN_ID, activeKey(role));
    if (activeId && candidates.includes(activeId)) return activeId;
    return candidates[0];
  }

  /**
   * 切换填充指定角色的活动插件 ID——落盘持久化（重启保持）。
   * 非候选 fail-loud 拒绝（对标 #24.6 失败必出声——不静默吞掉无效切换）。
   */
  async setActive(role: FactoryRole, pluginId: string): Promise<void> {
    const candidates = this.getPluginIds(role);
    if (!candidates.includes(pluginId)) {
      throw new Error(
        `[FactorySlots] 角色 "${role}" 无候选 "${pluginId}"（候选：${candidates.join(" / ") || "无"}）——不能设为激活`
      );
    }
    await setPluginStateValue(APP_PLUGIN_ID, activeKey(role), pluginId);
  }
}

export const factorySlots = new FactorySlots();
