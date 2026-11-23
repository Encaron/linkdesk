/**
 * 宿主资产域注册表 —— `domain → 驱动`。
 *
 * 判据（语义归属律）：插件的配置 schema 声明 `assetDomain`，UI 把该值原样传给宿主动作；
 * 新增域 = 本表加一条驱动，插件零改动。⛔ 不在调用点写死域名字符串的分支（`if (domain==="appearance")`）。
 */

import { APPEARANCE_DOMAIN, appearanceDriver } from "./appearance";
import type { HostAssetDriver } from "./types";

/** 域表——键 = schema `assetDomain` 的合法取值 */
const DRIVERS: Readonly<Record<string, HostAssetDriver>> = {
  [APPEARANCE_DOMAIN]: appearanceDriver,
};

/** 已注册的资产域键 */
export function hostAssetDomains(): string[] {
  return Object.keys(DRIVERS);
}

/** 域是否已注册 */
export function isHostAssetDomain(domain: string): boolean {
  return Object.prototype.hasOwnProperty.call(DRIVERS, domain);
}

/** 取域驱动（未注册 ⇒ null，由调用方 fail-loud） */
function getHostAssetDriver(domain: string): HostAssetDriver | null {
  return isHostAssetDomain(domain) ? DRIVERS[domain] : null;
}

/** 校验并解析 `appearance.pickImage` 的入参——域必须已注册、target 必填 */
export function resolveHostAssetPick(options: unknown): {
  driver: HostAssetDriver;
  domain: string;
  target: string;
} {
  const o = options as { domain?: unknown; target?: unknown } | null | undefined;
  if (!o || typeof o !== "object") {
    throw new Error("pickImage: 参数缺失");
  }
  const domain = typeof o.domain === "string" ? o.domain : "";
  const target = typeof o.target === "string" ? o.target : "";
  const driver = getHostAssetDriver(domain);
  if (!driver) {
    throw new Error(`pickImage: 未注册的资产域——${domain || "(空)"}`);
  }
  if (!target.trim()) {
    throw new Error("pickImage: target 必填");
  }
  return { driver, domain, target };
}
