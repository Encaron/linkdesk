/**
 * 宿主资产域 —— 类型与驱动契约。
 *
 * 语义归属律（2026-11-24）：受控资产（背景图/图标/字体…）的「从哪选 / 允许什么 / 拷到哪」
 * 由宿主声明与执行；UI 插件只传 schema 里的 `{domain,target}`。
 *
 * 新增一个资产域 = 在 `index.ts` 注册表加一条驱动；插件零改动（域名单一来源 = 配置 schema 的
 * `assetDomain`）。本层不认任何具体插件、不写路径字面量。
 */

import type { BrowserWindow } from "electron";

/** 一个资产域的缺省值（起始目录 / 过滤器 / 扩展名白名单）——由域驱动生成 */
export interface AssetDomainDefaults {
  /** 域根目录（绝对路径，主进程解析） */
  dir: string;
  /** 系统选择框标题（主进程文案） */
  title: string;
  /** 扩展名白名单（不含点） */
  extensions: string[];
  /** 系统选择框过滤器 */
  filters: Array<{ name: string; extensions: string[] }>;
}

/** 入库结果——受控协议 URL ＋ 去重后的文件名 */
interface ImportedAsset {
  url: string;
  name: string;
}

/** 选图结果——取消不是错误 */
export type AssetPickResult =
  | { picked: true; url: string; name: string }
  | { picked: false };

/**
 * 资产域驱动——每个域实现同一组动作（判据：动作归壳，UI 只触发）。
 * `target` 只决定 UI 写回哪个配置键；是否影响目录/过滤器由域自己决定（当前同域同目录）。
 */
export interface HostAssetDriver {
  defaults(appDataDir: string): AssetDomainDefaults;
  importImage(sourcePath: string, defaults: AssetDomainDefaults): Promise<ImportedAsset>;
  openDirectory(defaults: AssetDomainDefaults): Promise<void>;
  pick(
    defaults: AssetDomainDefaults,
    target: string,
    hostWindow?: BrowserWindow,
  ): Promise<AssetPickResult>;
}
