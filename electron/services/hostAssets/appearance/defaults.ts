/**
 * 宿主资产域 · appearance —— 起始目录 / 过滤器 / 扩展名白名单的**唯一语义源**。
 *
 * 判据（语义归属律，2026-11-24）：一个行为的默认值由能力所有者声明，UI 插件只做呈现与触发。
 * 背景图选择过去由设置插件传 `defaultPathKind:"appearance"`、壳再翻成路径——语义被劈成两半，
 * 换掉设置插件起始目录就丢。本文件把「从哪选 / 允许什么扩展名」收进主进程：
 *   · `appearance.pickImage`（选图＋入库一步）与旧 `dialog.open({defaultPathKind:"appearance"})`
 *     兼容映射都读这里；
 *   · 插件⛔ 不传目录、不传域字符串，只传 schema 声明的 `{domain,target}`。
 *
 * 纯函数（只依赖 path.join）——主进程与测试同一口径，不碰 Electron API。
 */

import path from "node:path";

/** 域注册键——schema `assetDomain` 的取值（契约 `appearance.pickImage({domain})`）。 */
export const APPEARANCE_DOMAIN = "appearance";

/** 扩展名白名单——唯一清单（选图过滤器与入库校验同源）。 */
export const APPEARANCE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

export interface AppearanceDefaults {
  /** 域根目录（绝对路径）——`<userData>/appearance`（受控资产缓存） */
  dir: string;
  /** 系统选择框标题（主进程文案——与既有 `dialog.open` 缺省标题同风格） */
  title: string;
  /** 扩展名白名单（不含点） */
  extensions: string[];
  /** 系统选择框过滤器 */
  filters: Array<{ name: string; extensions: string[] }>;
}

/**
 * 生成 appearance 域的默认值。
 * @param appDataDir 主进程解析的 userData（`fileService.appDataDir()`）
 */
export function getAppearanceDefaults(appDataDir: string): AppearanceDefaults {
  const extensions = [...APPEARANCE_EXTENSIONS];
  return {
    dir: path.join(appDataDir, APPEARANCE_DOMAIN),
    title: "选择图片",
    extensions,
    filters: [{ name: "图片", extensions: [...extensions] }],
  };
}
