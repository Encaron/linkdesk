/**
 * 图标主题登记本——产品图标主题的唯一真相源。
 *
 * 对标 VS Code Product Icon Theme：
 *   插件通过 contributes.iconThemes 声明图标集，
 *   用户在设置中选择 app.iconTheme 切换。
 *
 * IconRegistry 只管登记和查询。加载 JSON、应用图标是调用方的事。
 * 架构：圆形大厅的"图标本"——插件往本子上登记图标集，谁都可以翻。
 *
 * 自动注销：继承 RegistryBase——插件卸载时 unregisterAll 自动被调用，
 * 无需 lifecycle.ts 手动添加清理逻辑。
 */

import { RegistryBase } from "./RegistryBase";
import { Emitter } from "./CoreEvents";
import { getConfigurationValue, setConfigurationValue } from "./ConfigurationService";
import type { IconThemeContribution, IconContribution, IconThemeMappings } from "./types";

interface RegisteredIconTheme extends IconThemeContribution {
  pluginId: string;
}

interface RegisteredIcon extends IconContribution {
  pluginId: string;
}

class IconRegistryImpl extends RegistryBase {
  private themes = new Map<string, RegisteredIconTheme>();
  private pluginThemeIds = new Map<string, string[]>();
  private icons = new Map<string, RegisteredIcon>();
  private pluginIconIds = new Map<string, string[]>();
  private _currentId: string | null = null;
  private _mappings = new Map<string, IconThemeMappings>();
  readonly onDidChangeCurrent = new Emitter<string | null>();

  constructor() {
    super();
    // 从配置恢复当前图标主题
    this._currentId = getConfigurationValue<string>("workbench.iconTheme") ?? null;
  }

  /** 注册插件贡献的图标主题。同名 ID 后注册者覆盖（warn）。 */
  register(contribution: IconThemeContribution, pluginId: string): void {
    const theme: RegisteredIconTheme = { ...contribution, pluginId };
    if (this.themes.has(theme.id)) {
      console.warn(
        `[IconRegistry] 图标主题 "${theme.id}" 重复注册——后注册者 "${pluginId}" 覆盖`
      );
    }
    this.themes.set(theme.id, theme);
    const ids = this.pluginThemeIds.get(pluginId) ?? [];
    ids.push(theme.id);
    this.pluginThemeIds.set(pluginId, ids);
    this.markPlugin(pluginId);
  }

  /** 按 ID 查找图标主题 */
  get(themeId: string): RegisteredIconTheme | undefined {
    return this.themes.get(themeId);
  }

  /** 所有已注册图标主题 */
  getAll(): RegisteredIconTheme[] {
    return Array.from(this.themes.values());
  }

  /** 是否有此图标主题 */
  has(themeId: string): boolean {
    return this.themes.has(themeId);
  }

  /** 获取当前使用的图标主题 ID——null = 默认 */
  getCurrent(): string | null {
    return this._currentId;
  }

  /** 设置当前图标主题——null = 恢复默认。持久化到 ConfigurationService。 */
  setCurrent(themeId: string | null): void {
    if (this._currentId === themeId) return;
    this._currentId = themeId;
    setConfigurationValue("workbench.iconTheme", themeId); // fire-and-forget 持久化
    this.onDidChangeCurrent.fire(themeId);
  }

  /** 设置图标主题的映射表——loader 加载 JSON 后调用 */
  setMappings(themeId: string, mappings: IconThemeMappings): void {
    this._mappings.set(themeId, mappings);
  }

  /** 获取当前图标主题的映射表——null = 用默认 */
  getCurrentMappings(): IconThemeMappings | null {
    if (!this._currentId) return null;
    return this._mappings.get(this._currentId) ?? null;
  }

  /* ── 共享图标（contributes.icons） ── */

  /** 注册插件贡献的共享图标。同名 ID 后注册者覆盖（warn）。 */
  registerIcon(iconId: string, contribution: IconContribution, pluginId: string): void {
    const icon: RegisteredIcon = { ...contribution, pluginId };
    if (this.icons.has(iconId)) {
      console.warn(
        `[IconRegistry] 共享图标 "${iconId}" 重复注册——后注册者 "${pluginId}" 覆盖`
      );
    }
    this.icons.set(iconId, icon);
    const ids = this.pluginIconIds.get(pluginId) ?? [];
    ids.push(iconId);
    this.pluginIconIds.set(pluginId, ids);
    this.markPlugin(pluginId);
  }

  /** 按 ID 查找共享图标 */
  getIcon(iconId: string): RegisteredIcon | undefined {
    return this.icons.get(iconId);
  }

  /** 是否有此共享图标 */
  hasIcon(iconId: string): boolean {
    return this.icons.has(iconId);
  }

  /** 插件卸载时自动清理——由 RegistryBase 调用 */
  protected unregisterAll(pluginId: string): void {
    const ids = this.pluginThemeIds.get(pluginId);
    let resetCurrent = false;
    if (ids) {
      for (const id of ids) {
        if (id === this._currentId) resetCurrent = true;
        this.themes.delete(id);
        this._mappings.delete(id);
      }
      this.pluginThemeIds.delete(pluginId);
    }
    const iconIds = this.pluginIconIds.get(pluginId);
    if (iconIds) {
      for (const id of iconIds) this.icons.delete(id);
      this.pluginIconIds.delete(pluginId);
    }
    // 当前主题被卸载→恢复默认
    if (resetCurrent) this.setCurrent(null);
  }
}

export const IconRegistry = new IconRegistryImpl();
