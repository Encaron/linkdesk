/**
 * IpcBridgeHandler 主题域——E5.8#50.18 配方/配色 API（06 §2 六方法）。
 * 查询（listRecipes/getActive/getEffectiveTokens）走 ThemeRegistry/ThemeEngine——壳侧权威
 * （ThemeRegistry 在壳渲染进程登记配方，主进程无 recipe 实例——实现偏离 06 §5「主进程 ThemeRegistry」
 * 的定稿，路由经既有 plugins:call 代理 → 壳，见 #50.18 回勾记录）；
 * 应用（setRecipe/setColorway/resetAppearance）落配置（app.*，持久化 + onApply 全窗重推 theme:changed）。
 * 依赖方向：theme → ThemeRegistry/ThemeEngine/ConfigurationService + linkdesk-api/types（RecipeMeta）；被聚合器委派。
 */

import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { recipeDomains, getActiveRecipe, getEffectiveTokens } from "../../ui/ThemeEngine";
import {
  getConfigurationValue, setConfigurationValue, resetConfigurationValue,
} from "../../configuration/ConfigurationService";
import type { RecipeMeta, ColorwayMeta } from "../../../api/linkdesk-api/types";
import type { ThemeRecipe } from "../../../types/theme";

/** 配方 → RecipeMeta——预览色取该配色 accent/bg-window（缺该 token → 空串，卡片徽标兜底） */
function toRecipeMeta(recipe: ThemeRecipe): RecipeMeta {
  const colorways: ColorwayMeta[] = recipe.colorways.map((cw) => ({
    id: cw.id,
    name: cw.name,
    preview: {
      accent: cw.colors?.accent ?? "",
      bgWindow: cw.colors?.["bg-window"] ?? "",
    },
  }));
  return {
    id: recipe.id,
    name: recipe.name,
    type: recipe.type,
    colorways,
    domains: recipeDomains(recipe),
  };
}

/** 设置层外观覆盖配置全集——resetAppearance 逐 key 回退（neutral 默认值 = 不覆盖主题基线） */
const APPEARANCE_OVERRIDE_KEYS = [
  "app.glassBlur",
  "app.glassOpacity",
  "app.glassTint",
  "app.backgroundImage",
  "app.surfaceRadius",
] as const;

async function resetAppearanceOverrides(): Promise<void> {
  for (const key of APPEARANCE_OVERRIDE_KEYS) {
    await resetConfigurationValue(key, "user");
  }
}

/** theme.* 六方法处理器——列表走 API（数据），选中走配置（持久化，06 §1 分工铁律） */
export async function handleThemeMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case "theme.listRecipes":
      return ThemeRegistry.getRecipes().map(toRecipeMeta);
    case "theme.getActive": {
      // ① 引擎活动配方（applyRecipe 已提交）
      const active = getActiveRecipe();
      if (active?.recipeId) return active;
      // ② 配置回退——app.theme 是已注册配方 → 报配置值（applyRecipe 未提交、配置已设的场景）
      const recipeId = getConfigurationValue<string>("app.theme");
      const recipe = recipeId ? ThemeRegistry.getRecipe(recipeId) : undefined;
      if (recipe) {
        return {
          recipeId,
          colorwayId: getConfigurationValue<string>("app.themeColor") ?? recipe.colorways[0]?.id ?? "",
        };
      }
      return null;
    }
    case "theme.getEffectiveTokens":
      return getEffectiveTokens();
    case "theme.setRecipe": {
      const [recipeId] = args as [string];
      await setConfigurationValue("app.theme", recipeId, "user");
      break;
    }
    case "theme.setColorway": {
      const [colorwayId] = args as [string];
      await setConfigurationValue("app.themeColor", colorwayId, "user");
      break;
    }
    case "theme.resetAppearance":
      // 清设置层外观覆盖——glass 零值 / bg 空 / radius 1（neutral = 主题基线）
      await resetAppearanceOverrides();
      break;
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
