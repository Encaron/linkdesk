/**
 * linkdesk-api 外观域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9b）。
 * theme + language + appearance 三命名空间面。
 * 依赖方向：appearance → ./types（LinkDeskTheme/LinkDeskLanguage）；被聚合器交叉组装。
 */

import type { LinkDeskTheme, LinkDeskLanguage, RecipeMeta } from "./types";

/** 主题 + 语言 + 外观资产命名空间面——对标 VS Code 外观面 */
export interface AppearanceAPI {
  theme: {
    /** 获取当前主题 ID */
    getCurrent(): Promise<string>;
    /** 获取所有可用主题列表 */
    getAvailable(): Promise<LinkDeskTheme[]>;
    /** 应用主题 */
    apply(themeId: string): Promise<void>;
    // ── E5.8#50.18：配方/配色 06 §2 六方法——列表走 API（数据），选中走配置（持久化 app.*）──
    /** 全部可用配方（含各配色变体 + 预览色）——ThemePicker 卡片 / 配色与混搭动态 SelectBox 数据源 */
    listRecipes(): Promise<RecipeMeta[]>;
    /** 当前活动配方/配色——合并配置计算（getActiveRecipe + app.theme/app.themeColor 回退） */
    getActive(): Promise<{ recipeId: string; colorwayId: string } | null>;
    /** 当前生效 token 集（合并后）——appearanceMode→custom 播种、混搭预览 */
    getEffectiveTokens(): Promise<Record<string, string>>;
    /** 应用配方——落 app.theme（配色随配方自动跟随） */
    setRecipe(recipeId: string): Promise<void>;
    /** 应用配色变体——落 app.themeColor */
    setColorway(colorwayId: string): Promise<void>;
    /** 复位外观——清设置层外观覆盖（回主题基线） */
    resetAppearance(): Promise<void>;
  };

  language: {
    /** 获取当前语言 ID */
    getCurrent(): Promise<string>;
    /** 获取所有可用语言列表 */
    getAvailable(): Promise<LinkDeskLanguage[]>;
    /** 切换语言 */
    set(langId: string): Promise<void>;
    /** 获取初始语言数据（WebView 加载时壳已推送） */
    getInitial(): { lang: string; resources: Record<string, unknown> } | null;
    /** 订阅语言变更——返回 unsubscribe */
    onChange(cb: (data: { lang: string; resources: Record<string, unknown> }) => void): () => void;
  };

  /** E5.8#50.11：外观资产——本地选图拷贝入库（受控来源——用户任选路径不能 file:// 直读） */
  appearance: {
    /** 导入图片到 userData/appearance/（重名去重）——返回受控路径，供 app.backgroundImage 持久化 */
    importImage(sourcePath: string): Promise<string>;
  };
}
