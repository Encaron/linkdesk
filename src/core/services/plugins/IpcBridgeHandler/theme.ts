/**
 * IpcBridgeHandler 主题域——E5.8#50.18 配方/配色 API（06 §2 六方法）+ E5.8#88 复位对称（C3，八方法）。
 * 查询（listRecipes/getActive/getEffectiveTokens/getBaselineSeeds）走 ThemeRegistry/ThemeEngine——壳侧权威
 * （ThemeRegistry 在壳渲染进程登记配方，主进程无 recipe 实例——实现偏离 06 §5「主进程 ThemeRegistry」
 * 的定稿，路由经既有 plugins:call 代理 → 壳，见 #50.18 回勾记录）；
 * 应用（setRecipe/setColorway/resetAppearance/resetMix）落配置（app.*，持久化 + onApply 全窗重推 theme:changed）。
 * 依赖方向：theme → ThemeRegistry/ThemeEngine/ConfigurationService + linkdesk-api/types（RecipeMeta）；被聚合器委派。
 */

import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { recipeDomains, getActiveRecipe, getEffectiveTokens, normalizeThemeValue, deriveAppearanceSeedMap, getThemeBaseTokens, MIX_SOURCE_KEYS } from "../../ui/ThemeEngine";
import { getConfigurationValue, setConfigurationValue, resetConfigurationValueBatch } from "../../configuration/ConfigurationService";
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

/** theme.* 八方法处理器——列表走 API（数据），选中走配置（持久化，06 §1 分工铁律） */
export async function handleThemeMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case "theme.listRecipes":
      return ThemeRegistry.getRecipes().map(toRecipeMeta);
    case "theme.getActive": {
      // ① 引擎活动配方（applyRecipe 已提交）
      const active = getActiveRecipe();
      if (active?.recipeId) return active;
      // ② 配置回退——app.theme 是已注册配方 → 报配置值（applyRecipe 未提交、配置已设的场景）。
      //    E5.8#50.21：读时归一化——旧值 "Dark"/"Light" → "dark"/"light"
      const recipeId = normalizeThemeValue(getConfigurationValue<string>("app.theme"));
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
      // E5.8#88 C3 复位对称——对齐壳命令（settingsCommands theme.resetAppearance）：app.appearanceMode→followTheme
      // 单一写入点，onApply（startup）级联清 9 覆盖 + 6 域来源 + 强调色回主题基线（E5.8#90 合并）。
      // 原来直接批量复位键却留 appearanceMode=custom——不对称：逐键清空后壳 UI 仍判「custom 覆盖中」，徽标/播种态脱节。
      await setConfigurationValue("app.appearanceMode", "followTheme", "user");
      break;
    case "theme.resetMix":
      // E5.8#90 复位对称——对齐壳命令（settingsCommands theme.resetMix）：批复位 6 来源键回跟随主题
      // （保持自定义模式；域来源 onApply 重合并回主题基线）。app.mixMode 键已删（三枚举归一外观主开关）。
      await resetConfigurationValueBatch(MIX_SOURCE_KEYS, "user");
      break;
    case "theme.getBaselineSeeds":
      // E5.8#88：外观覆盖键 → 主题/混搭基准种子值全集（设置页「已修改」徽标基准；无活动配方 = 基准不可算 → null）。
      // 无覆盖纯基线（getThemeBaseTokens）——含覆盖的 getEffectiveTokens 会把用户改值误判为「未改」。
      return getActiveRecipe() ? deriveAppearanceSeedMap(getThemeBaseTokens()) : null;
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
