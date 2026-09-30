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
import type { FontFaceSpec } from "../../types/ipc/events";
import {
  judgeAppearanceId,
  logAppearanceIdRejection,
  NOOP_DISPOSE,
} from "./appearanceOwnership"; // E6#111f／1.36：外观 id 归属仲裁（出口 = logAppearanceIdRejection）

interface RegisteredIconTheme extends IconThemeContribution {
  pluginId: string;
}

interface RegisteredIcon extends IconContribution {
  pluginId: string;
}

/** 图标主题自定义字体资产（E5.8#133.4）——mappings JSON 可选 font 段加载产物，随主题广播进池 */
interface IconThemeFontAssets {
  /** @font-face 规格（池复刻注入；缺省 = 无自定义字体） */
  fontFaces?: FontFaceSpec[];
  /** glyph 类 CSS 原文（池注入 `<style>`；缺省 = 无 glyph 类） */
  glyphCss?: string;
}

class IconRegistryImpl extends RegistryBase {
  private themes = new Map<string, RegisteredIconTheme>();
  /** E5.8#133.1：主题 ID → 加载好的 mappings（loadIconThemeContributionData 写入）——登记 + 数据两步 */
  private mappingsByTheme = new Map<string, IconThemeMappings>();
  /** E5.8#133.4：主题 ID → 自定义字体资产（@font-face + glyph CSS，广播进池） */
  private fontAssetsByTheme = new Map<string, IconThemeFontAssets>();
  private pluginThemeIds = new Map<string, string[]>();
  private icons = new Map<string, RegisteredIcon>();
  private pluginIconIds = new Map<string, string[]>();

  constructor() {
    super();
  }

  /** 注册插件贡献的图标主题。同名 ID —— 🔴 **E6#111f／1.36 起改为归属仲裁**（判据②顶替宿主兜底
   *  `default` / ③跨插件同 id ⇒ 拒 ＋ `console.error`；同插件重注册不变）。
   *  E5.8#10：per-entry track——返 disposer（仅当仍是当前占位者才删，防覆盖误删）。 */
  register(contribution: IconThemeContribution, pluginId: string): () => void {
    const theme: RegisteredIconTheme = { ...contribution, pluginId };
    const verdict = judgeAppearanceId({
      space: "iconTheme",
      id: theme.id,
      pluginId,
      prevOwner: this.themes.get(theme.id)?.pluginId,
      occupied: this.themes.has(theme.id),
    });
    if (!verdict.accept) {
      logAppearanceIdRejection("[IconRegistry]", verdict);
      return NOOP_DISPOSE;
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
        // E5.8#133.4：自定义字体资产随映射一并卸载——池内 @font-face/glyph CSS 由下次广播清空（回退保底）
        this.fontAssetsByTheme.delete(theme.id);
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

  /** `app.iconTheme` 枚举条目（id ＋ 显示名）——壳侧装配的唯一数据源（见文件末 `iconThemeEnumOptions`） */
  getEnumEntries(): Array<{ id: string; label: string }> {
    // label 在类型上必填，第三方手写 manifest 可能缺 —— 缺则退 id（宁可显示 id，不可显示 undefined）
    return this.getAll().map((it) => ({ id: it.id, label: it.label || it.id }));
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

  /* ── 自定义字体资产（E5.8#133.4） ── */

  /** 关联加载好的自定义字体资产（loadIconThemeContributionData 写入；无 font 段则不写） */
  setFontAssets(themeId: string, assets: IconThemeFontAssets): void {
    this.fontAssetsByTheme.set(themeId, assets);
  }

  /** 取自定义字体资产——未声明/已卸载 → undefined（广播缺省，池清空上次注入） */
  getFontAssets(themeId: string): IconThemeFontAssets | undefined {
    return this.fontAssetsByTheme.get(themeId);
  }

  /* ── 共享图标（contributes.icons） ── */

  /** 注册插件贡献的共享图标。同名 ID —— 🔴 **E6#111f／1.36 起改为归属仲裁**（③跨插件同 id ⇒ 拒 ＋
   *  `console.error`；🔴 宿主**没有**兜底共享图标 ⇒ 本空间保留面恒空，只剩这一条判据）。
   *  E5.8#10：per-entry track——返 disposer（仅当仍是当前占位者才删，防覆盖误删）。 */
  registerIcon(iconId: string, contribution: IconContribution, pluginId: string): () => void {
    const icon: RegisteredIcon = { ...contribution, pluginId };
    const verdict = judgeAppearanceId({
      space: "sharedIcon",
      id: iconId,
      pluginId,
      prevOwner: this.icons.get(iconId)?.pluginId,
      occupied: this.icons.has(iconId),
    });
    if (!verdict.accept) {
      logAppearanceIdRejection("[IconRegistry]", verdict);
      return NOOP_DISPOSE;
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

/** `app.iconTheme` 保底项——壳自己的哨兵值（codicon 图标集）。值写死在配置声明处；**名字归壳**：
 *  中文原文住本文件，英文译名住语言包仓（lang-defaults，E6#161「谁的仓谁译文」）。 */
export const ICON_THEME_FALLBACK_ID = "default";
/** 保底项的显示名（中文原文）——只在本文件装配进 `iconThemeEnumOptions`，故不导出（knip 视角无外部消费方）。 */
const ICON_THEME_FALLBACK_LABEL = "内置图标集";

/**
 * `app.iconTheme` 枚举 ＋ 显示名（一一对应，2026-10-01 接线）。
 *
 * 为什么要名字这一栏：设置页枚举项的显示规则是 `t(enumDescriptions[i] ?? enum[i])`（settings 仓
 * `renderControl.tsx`），而此前只推 id ⇒ 下拉里是裸 id（`theme-iconset-pastel.ld-iconset-pastel`），
 * 插件在 `contributes.iconThemes[].label` 声明的名字**零消费方**。
 *
 * 壳侧两处同用这一份——`App/config/appearance.ts` 的静态声明 · `pluginLoader/contributions.ts`
 * `syncIconThemeEnum()` 的装/卸动态刷新。⛔ 不各拼一次（防两处漂移）。
 *
 * ⚠️ `descriptions` 是**源码串**：保底项住本文件，插件项取 `contributes.iconThemes[].label`（中文原文）
 * ——显示期由设置页 `t()` 解析成当前语言，与主题/配色名同一条口径（E6#165）；译名住**声明方本仓**字典。
 */
export function iconThemeEnumOptions(): { values: string[]; descriptions: string[] } {
  const entries = IconRegistry.getEnumEntries();
  return {
    values: [ICON_THEME_FALLBACK_ID, ...entries.map((e) => e.id)],
    descriptions: [ICON_THEME_FALLBACK_LABEL, ...entries.map((e) => e.label)],
  };
}
