/**
 * linkdesk-api 外观域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9b）。
 * theme + language 二命名空间面 verbatim。
 * 依赖方向：appearance → ./types（LinkDeskTheme/LinkDeskLanguage）；被聚合器交叉组装。
 */

import type { LinkDeskTheme, LinkDeskLanguage } from "./types";

/** 主题 + 语言命名空间面——对标 VS Code 外观面 */
export interface AppearanceAPI {
  theme: {
    /** 获取当前主题 ID */
    getCurrent(): Promise<string>;
    /** 获取所有可用主题列表 */
    getAvailable(): Promise<LinkDeskTheme[]>;
    /** 应用主题 */
    apply(themeId: string): Promise<void>;
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
}
