/**
 * 系统插槽机制——壳通过角色名查找对应的插件，不硬编码 pluginId。
 *
 * 对标 VS Code：VS Code 的 settings/marketplace 是内置功能，不可替换。
 * LinkDesk 更进一步——这些是普通插件，壳只通过 factoryRole 查找。
 * 用户可以换一套设置插件：声明 factoryRole: "settings" → Ctrl+, 自动打开新插件。
 *
 * E2c #19e。
 */

import type { PluginManifest } from "../api/types";
import { PluginLifecycle } from "../../pluginLoader/lifecycle";
import { getLoadedPluginManifests } from "../../pluginLoader/loader";

/* ── 类型 ── */

/** 系统插槽角色——插件声明自己填充哪个系统级功能。 */
export type FactoryRole = string;

/** 插件条目——initialize() 的输入。 */
export interface SlotPluginEntry {
  pluginId: string;
  manifest: PluginManifest;
}

/* ── 实现 ── */

class FactorySlots {
  private _slots = new Map<FactoryRole, string>();

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
   * 优先级：core: true > 第一个声明者。
   * 必须在插件加载完成后、首次消费前调用。
   */
  initialize(plugins: Iterable<SlotPluginEntry>): void {
    for (const p of plugins) {
      const role = p.manifest.factoryRole as FactoryRole | undefined;
      if (!role) continue;
      if (!this._slots.has(role)) {
        this._slots.set(role, p.pluginId);
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

  /** 获取填充指定角色的插件 ID。未找到返回 undefined。 */
  getPluginId(role: FactoryRole): string | undefined {
    return this._slots.get(role);
  }

  /** 检查是否有插件填充了该角色。 */
  hasSlot(role: FactoryRole): boolean {
    return this._slots.has(role);
  }
}

export const factorySlots = new FactorySlots();
