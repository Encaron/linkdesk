/**
 * 主题登记本——所有可用主题的唯一真相源。
 *
 * 三层退路（对标 VS Code）：
 *   第 1 层：settings.json → app.theme（用户选择的首选主题 ID）
 *   第 2 层：插件 contributes.themes 注册到本登记本
 *   第 3 层：index.css :root 硬兜底——本登记本找不到 → 回退到 CSS 默认值
 *
 * ThemeRegistry 只管登记和查询。加载 JSON、写 CSS 变量是 ThemeEngine 的事。
 * 架构：圆形大厅的"主题本"——插件往本子上登记自己提供的主题，谁都可以翻。
 */

import type { ThemeContribution } from "../../api/types";
import { findTheme } from "../../services/ui/ThemeEngine";
import { trackRegistration } from "../registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚
import type { ThemeRecipe, ThemeAppearance, ThemeColorway } from "../../types/theme";

interface RegisteredTheme extends ThemeContribution {
  pluginId: string;
}

const themes = new Map<string, RegisteredTheme>();
const pluginThemeIds = new Map<string, string[]>();

/* ── E5.8#50.15：Recipe 存储（05 schema 数据层）——主题 JSON 解析后的配方，登记/查询单真源。
   与 manifest 元数据 themes Map 并存：themes = 清单指针（id/label/uiTheme/path，parseContributions 注册）；
   recipes = 加载后的完整配方（appearance + colorways，loadThemeContributionData 注册）。 */

const recipes = new Map<string, ThemeRecipe>();
const pluginRecipeIds = new Map<string, string[]>();
/** recipeId → 提供方插件 id（#50.17 资产字体归属解析——asset 相对路径需知插件域；#50.19 主题组归属复用） */
const recipeOwners = new Map<string, string>();

/**
 * E5.8#50.15：主题 JSON → Recipe（05 schema 解析，纯函数）。
 * 只读新格式 `colorways[]`（决策 F：引擎只读新格式）；旧平铺 colors 在解析边界包装成 Recipe
 * （单配色 + appearance 取自顶层 surface/background）——过渡兼容，主题文件迁移（#50.25）后此包装退役。
 * 新格式必备：id/name/type/colorways[]；appearance 各域稀疏，缺的继承 :root 壳默认。
 */
export function parseThemeRecipe(data: Record<string, unknown>, fallback: ThemeContribution): ThemeRecipe | null {
  if (!data || typeof data !== "object") return null;

  const type = isLightDark(data.type) ? data.type : fallback.uiTheme === "light" ? "light" : "dark";
  const colorways = parseColorways(data.colorways, data, fallback);
  if (!colorways.length) return null;

  const appearance: ThemeAppearance | undefined = parseAppearance(data.appearance, data);
  const recipe: ThemeRecipe = {
    id: (data.id as string) || fallback.id,
    name: (data.name as string) || fallback.label,
    type,
    ...(appearance ? { appearance } : {}),
    colorways,
  };
  return recipe;
}

/** 解析 colorways[]——新格式数组直接读；旧格式平铺 colors 包装成单配色 */
function parseColorways(
  raw: unknown,
  data: Record<string, unknown>,
  fallback: ThemeContribution
): ThemeColorway[] {
  if (Array.isArray(raw)) {
    const list: ThemeColorway[] = [];
    for (const cw of raw) {
      if (!cw || typeof cw !== "object") continue;
      const colors = (cw as Record<string, unknown>).colors;
      if (!colors || typeof colors !== "object") continue;
      list.push({
        id: String((cw as Record<string, unknown>).id ?? ""),
        name: String((cw as Record<string, unknown>).name ?? (cw as Record<string, unknown>).id ?? ""),
        colors: toColorMap(colors),
      });
    }
    return list;
  }
  // 旧格式：顶层 colors（平铺）→ 单配色包装（过渡兼容，决策 F 主题文件迁移后不走此路）
  const flatColors = toColorMap(data.colors);
  if (!Object.keys(flatColors).length) return [];
  return [{ id: fallback.id, name: fallback.label, colors: flatColors }];
}

/** 解析 appearance 域——新格式 appearance 对象；旧格式顶层 surface/background 收进 glass/background */
function parseAppearance(raw: unknown, data: Record<string, unknown>): ThemeAppearance | undefined {
  if (raw && typeof raw === "object") {
    const a = raw as Record<string, unknown>;
    const appearance: ThemeAppearance = {};
    if (a.radius && typeof a.radius === "object") appearance.radius = a.radius as ThemeAppearance["radius"];
    if (a.glass && typeof a.glass === "object") appearance.glass = a.glass as ThemeAppearance["glass"];
    if (a.font && typeof a.font === "object") appearance.font = a.font as ThemeAppearance["font"];
    if (a.background && typeof a.background === "object") appearance.background = a.background as ThemeAppearance["background"];
    if (a.surface && typeof a.surface === "object") appearance.surface = a.surface as ThemeAppearance["surface"];
    if (Object.keys(appearance).length) return appearance;
    return undefined;
  }
  // 旧格式顶层 surface/background（#50.6 质感字段）→ appearance.glass/background（桥接现有机制）
  const appearance: ThemeAppearance = {};
  if (data.surface && typeof data.surface === "object") appearance.glass = data.surface as ThemeAppearance["glass"];
  if (data.background && typeof data.background === "object")
    appearance.background = data.background as ThemeAppearance["background"];
  return Object.keys(appearance).length ? appearance : undefined;
}

function isLightDark(v: unknown): v is "light" | "dark" {
  return v === "light" || v === "dark";
}

/** 过滤非字符串值进颜色 map（E5.7#98 免 as any 同款运行时过滤） */
function toColorMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") map[k] = v;
  }
  return map;
}

export const ThemeRegistry = {
  /** 注册插件贡献的主题。同名 ID 后注册者覆盖（warn）。
   *  E5.8#10 返 disposer：删"这一条"——仅当仍是当前占位者（防删后注册者的覆盖）；
   *  同步从插件 id 列表摘除自身。 */
  register(contribution: ThemeContribution, pluginId: string): () => void {
    const theme: RegisteredTheme = { ...contribution, pluginId };
    if (themes.has(theme.id)) {
      console.warn(
        `[ThemeRegistry] 主题 "${theme.id}" 重复注册——后注册者 "${pluginId}" 覆盖`
      );
    }
    themes.set(theme.id, theme);
    const ids = pluginThemeIds.get(pluginId) ?? [];
    ids.push(theme.id);
    pluginThemeIds.set(pluginId, ids);

    return trackRegistration(pluginId, () => {
      if (themes.get(theme.id) === theme) {
        themes.delete(theme.id);
      }
      const owned = pluginThemeIds.get(pluginId);
      if (owned) {
        const kept = owned.filter((id) => id !== theme.id);
        if (kept.length !== owned.length) {
          if (kept.length === 0) pluginThemeIds.delete(pluginId);
          else pluginThemeIds.set(pluginId, kept);
        }
      }
    });
  },

  /** 注销单个主题 */
  unregister(themeId: string): void {
    themes.delete(themeId);
  },

  /**
   * 三层退路查找。
   * 找到 → 返回 RegisteredTheme（第 1/2 层命中）
   * undefined → 调用方应回退到第 3 层 index.css :root 硬兜底
   *
   * 单真源：ThemeRegistry 自己的登记本未命中 → fallback 到 ThemeEngine（旧格式主题）。
   * 消除双写——不再要求旧格式 manifest.themes/manifest.file 也调 ThemeRegistry.register()。
   */
  get(themeId: string): RegisteredTheme | undefined {
    const registered = themes.get(themeId);
    if (registered) return registered;
    // Fallback：旧格式主题只在 ThemeEngine 中有登记
    const theme = findTheme(themeId);
    if (theme?.pluginId) {
      return {
        id: theme.name,
        label: theme.name,
        uiTheme: theme.type,
        path: "",
        pluginId: theme.pluginId,
      };
    }
    return undefined;
  },

  /** 所有已注册主题 */
  getAll(): RegisteredTheme[] {
    return Array.from(themes.values());
  },

  /** 是否有此主题 */
  has(themeId: string): boolean {
    return themes.has(themeId);
  },

  /* ── E5.8#50.15：Recipe 登记/查询（05 schema 数据层） ── */

  /** 注册解析后的配方。同名 id 后注册者覆盖——壳兜底（无归属，pluginId 省略）被插件配方覆盖不告警
   *  （registerTheme 同款语义，兜底上位是预期行为）；插件间重复仍告警。
   *  E5.8#10 返 disposer——删"这一条"（仅当仍是当前占位者）；无 pluginId（壳兜底）不追踪，返裸 disposer。 */
  registerRecipe(recipe: ThemeRecipe, pluginId?: string): () => void {
    // E5.8#61 审计#3：记录被覆盖的旧占位者（壳兜底/前插件配方）——disposer 卸载覆盖者时回填。
    //  原实现直接删 → 插件覆盖壳兜底（registerFallbackThemes 的 dark/light）后卸载，兜底会话内丢失
    //  （重启才恢复）；回填旧占位者让 getRecipe/getRecipes 立即恢复可用。
    const prev = recipes.get(recipe.id);
    const prevOwner = recipeOwners.get(recipe.id);
    if (recipes.has(recipe.id)) {
      const existingOwner = recipeOwners.get(recipe.id);
      if (existingOwner) {
        console.warn(`[ThemeRegistry] 配方 "${recipe.id}" 重复注册——后注册者 "${pluginId}" 覆盖`);
      }
    }
    recipes.set(recipe.id, recipe);
    if (pluginId) {
      recipeOwners.set(recipe.id, pluginId);
      const ids = pluginRecipeIds.get(pluginId) ?? [];
      if (!ids.includes(recipe.id)) ids.push(recipe.id);
      pluginRecipeIds.set(pluginId, ids);
    }

    const dispose = (): void => {
      if (recipes.get(recipe.id) === recipe) {
        if (prev) {
          recipes.set(recipe.id, prev);
          if (prevOwner) recipeOwners.set(recipe.id, prevOwner);
          else recipeOwners.delete(recipe.id);
        } else {
          recipes.delete(recipe.id);
          recipeOwners.delete(recipe.id);
        }
      }
      if (pluginId) {
        if (recipeOwners.get(recipe.id) === pluginId) recipeOwners.delete(recipe.id);
        const owned = pluginRecipeIds.get(pluginId);
        if (owned) {
          const kept = owned.filter((id) => id !== recipe.id);
          if (kept.length === 0) pluginRecipeIds.delete(pluginId);
          else pluginRecipeIds.set(pluginId, kept);
        }
      }
    };
    return pluginId ? trackRegistration(pluginId, dispose) : dispose;
  },

  /** 注销单个配方 */
  unregisterRecipe(recipeId: string): void {
    recipes.delete(recipeId);
  },

  /** 按 id 查配方——未注册返回 undefined（调用方回退 :root 兜底） */
  getRecipe(recipeId: string): ThemeRecipe | undefined {
    return recipes.get(recipeId);
  },

  /** 所有已注册配方 */
  getRecipes(): ThemeRecipe[] {
    return Array.from(recipes.values());
  },

  /** 指定插件注册的配方 id */
  getRecipesByPlugin(pluginId: string): string[] {
    return pluginRecipeIds.get(pluginId) ?? [];
  },

  /** 配方提供方插件 id——资产相对路径解析（#50.17）与主题组归属（#50.19）用；未注册返回 undefined */
  getRecipeOwner(recipeId: string): string | undefined {
    return recipeOwners.get(recipeId);
  },
};
