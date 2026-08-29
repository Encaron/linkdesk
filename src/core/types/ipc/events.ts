/**
 * 壳→池事件中继载荷契约——E5.7#97。
 *
 * 以下载荷全部走同一中继管道（壳 emit → 主进程 IpcBridge.broadcast → plugin:push 分发
 * → 池 events.on），此前每端各自写裸字面量 + `as any` 拆包。union literal 一处定义，
 * 壳 emit 侧 / 池 preload 订阅侧 import type——字段名改动 tsc 双端报错。
 */

import type { ThemeDomain } from "../theme";

/** 配置变更——config:changed / plugin:push(config.changed) 载荷 */
export interface ConfigurationChangedPayload {
  key: string;
  value: unknown;
}

/** @font-face 规格（E5.8#50.17 资产字体）——壳注册后广播给池复刻（池是独立文档，@font-face 不跨文档继承） */
export interface FontFaceSpec {
  /** 注册的族名（引擎派生 `__ld_{pluginId}_{stem}`）——font-family 写这个，两步机制第一链 */
  family: string;
  /** 字体资产 URL（linkdesk://{pluginId}/{path} 或作者写的绝对 URL） */
  url: string;
  /** src format 提示（woff2/woff/ttf/otf 按扩展名推断） */
  format?: string;
}

/** 主题切换——theme:changed 载荷（themeType + CSS 变量表 + 资产字族复刻表）。
 *  E5.8#50.18：追加 recipeId/colorwayId/domains——applyRecipe 提交才带；
 *  flat applyTheme（旧格式桥）缺省——既有消费者（pool events.ts 读 themeType/variables/fontFaces）零改动。 */
export interface ThemeChangedPayload {
  themeType: string;
  variables: Record<string, string>;
  /** 当前配方涉及的全部 @font-face——池侧复刻注入；配方无资产字体 → 缺省（池清空上次注入） */
  fontFaces?: FontFaceSpec[];
  /** 当前活动配方 id——applyRecipe 提交带；flat applyTheme 态缺省 */
  recipeId?: string;
  /** 当前活动配色变体 id——applyRecipe 提交带；flat applyTheme 态缺省 */
  colorwayId?: string;
  /** 当前生效域列表——细粒度消费（混搭预览按域刷新，06 §6.2）；flat applyTheme 态 = 全六域 */
  domains?: ThemeDomain[];
}

/** 强调色变更——accent:changed 载荷（仅 CSS 变量表） */
export interface AccentChangedPayload {
  variables: Record<string, string>;
}

/** 插件状态变更——plugin-state:changed 载荷（跨 WebView 状态同步原语） */
export interface PluginStateChangedPayload {
  pluginId: string;
  key: string;
  value: unknown;
}

/** 标签页激活——tab:activated 载荷 */
export interface TabActivatedPayload {
  tabId: string;
  pluginId: string;
  filePath?: string;
}

/** 工作区激活变更——workspace:activeChanged 载荷 */
export interface WorkspaceActiveChangedPayload {
  uri: string;
}

/** 设置页导航——settings:requestGroup 载荷 */
export interface SettingsRequestGroupPayload {
  pluginId: string;
}

/** 设置页滚动定位——settings:scrollTo 载荷 */
export interface SettingsScrollToPayload {
  key: string;
}

/** 设置页切快捷键 tab——settings:requestOpenKeybindings 载荷（E5.8#41.14 契约通道替代错配 window 事件死路由） */
export interface SettingsOpenKeybindingsPayload {
  /** 搜索框预填命令名（"打开快捷键设置"命令 opts.query） */
  query?: string;
}

/** plugin:push 中继信封——主进程 broadcast 包装（channel + 载荷）。
 *  原为 electron/event-system.ts 本地 PluginPushData——E5.7#97 归口此处。 */
export interface PluginPushEnvelope {
  channel: string;
  payload: unknown;
  source?: string;
}
