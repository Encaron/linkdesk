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
 * 自动注销：继承 RegistryBase——插件卸载时 tracker 逆序回滚每个 per-entry disposer
 *（E5.8#10：register/registerIcon 逐条 track，卸载无需 lifecycle.ts 手动清理）。
 */

import { RegistryBase } from "../../registry/RegistryBase";
import type { IconThemeContribution, IconContribution, IconThemeMappings } from "../../api/types";

interface RegisteredIconTheme extends IconThemeContribution {
  pluginId: string;
}

interface RegisteredIcon extends IconContribution {
  pluginId: string;
}

class IconRegistryImpl extends RegistryBase {
  private themes = new Map<string, RegisteredIconTheme>();
  /** E5.8#133.1：主题 ID → 加载好的 mappings（loadIconThemeContributionData 写入）——登记 + 数据两步 */
  private mappingsByTheme = new Map<string, IconThemeMappings>();
  private pluginThemeIds = new Map<string, string[]>();
  private icons = new Map<string, RegisteredIcon>();
  private pluginIconIds = new Map<string, string[]>();

  constructor() {
    super();
  }

  /** 注册插件贡献的图标主题。同名 ID 后注册者覆盖（warn）。
   *  E5.8#10：per-entry track——返 disposer（仅当仍是当前占位者才删，防覆盖误删）。 */
  register(contribution: IconThemeContribution, pluginId: string): () => void {
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
    return this.track(pluginId, () => {
      if (this.themes.get(theme.id) === theme) {
        this.themes.delete(theme.id);
        // E5.8#133.1：映射随登记卸载——卸载回退保底时无残留（#133.5 验收点）
        this.mappingsByTheme.delete(theme.id);
      }
      const owned = this.pluginThemeIds.get(pluginId);
      if (owned) {
        const kept = owned.filter((id) => id !== theme.id);
        if (kept.length !== owned.length) {
          if (kept.length === 0) this.pluginThemeIds.delete(pluginId);
          else this.pluginThemeIds.set(pluginId, kept);
        }
      }
    });
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

  /* ── 映射数据（E5.8#133.1：登记元数据与加载数据两步——loadIconThemeContributionData 写入） ── */

  /** 关联加载好的 mappings（含 imagePath 已解析 linkdesk:// 绝对 URL） */
  setMappings(themeId: string, mappings: IconThemeMappings): void {
    this.mappingsByTheme.set(themeId, mappings);
  }

  /** 取 mappings——未加载/已卸载 → undefined（消费方回退 codicon 保底） */
  getMappings(themeId: string): IconThemeMappings | undefined {
    return this.mappingsByTheme.get(themeId);
  }

  /* ── 共享图标（contributes.icons） ── */

  /** 注册插件贡献的共享图标。同名 ID 后注册者覆盖（warn）。
   *  E5.8#10：per-entry track——返 disposer（仅当仍是当前占位者才删，防覆盖误删）。 */
  registerIcon(iconId: string, contribution: IconContribution, pluginId: string): () => void {
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
    return this.track(pluginId, () => {
      if (this.icons.get(iconId) === icon) {
        this.icons.delete(iconId);
      }
      const owned = this.pluginIconIds.get(pluginId);
      if (owned) {
        const kept = owned.filter((id) => id !== iconId);
        if (kept.length !== owned.length) {
          if (kept.length === 0) this.pluginIconIds.delete(pluginId);
          else this.pluginIconIds.set(pluginId, kept);
        }
      }
    });
  }

  /** 按 ID 查找共享图标 */
  getIcon(iconId: string): RegisteredIcon | undefined {
    return this.icons.get(iconId);
  }

  /** 是否有此共享图标 */
  hasIcon(iconId: string): boolean {
    return this.icons.has(iconId);
  }

}

export const IconRegistry = new IconRegistryImpl();
