/**
 * linkdesk-api licenses domain — R4-1.3（I21/#24 壳侧·正典 09 §三·补3）.
 * 许可验签与权益命名空间——**裁决层住壳**（05 §三·4 三层模型的墙）：权益记录住壳侧存储
 * （主进程 owner = electron/services/license-store-service.ts → {userData}/licenses.json），
 * Ed25519 离线验签（node:crypto，主进程 license-verify-service），市场被整体替换也绕不过。
 *
 * 购买流（09 §三·补3）：详情页「获取许可」→ 外链作者销售页 → 用户粘贴密钥 → 本 API 验签
 * （无需联网）→ valid=true 即壳写权益 → 安装门（与 minAppVersionGate 同位模式）放行。
 *
 * 依赖方向：licenses → ./types（LicenseVerifyResult/LicenseEntitlement）；跨域组合于聚合器。
 * 形状纪律：本域 interface 的成员 = `licenses` 命名空间（PluginsAPI 的 plugins/pluginManager 同款——
 * 聚合器交集成 LinkDeskAPI，成员键即 window.linkdesk 顶层命名空间）。
 */

import type { LicenseEntitlement, LicenseVerifyResult } from "./types";

/** Licenses namespace surfaces — 壳 preload 直答主进程；池插件经 plugins:call 代理同面 */
export interface LicensesAPI {
  licenses: {
    /**
     * 验签并入库——key = 作者 kit 签发的许可密钥；publicKey = 目录作者块 `authors/<id>.json` 的
     * `publicKey` 字段（市场插件已拉取作者块——壳无目录上下文，公钥经调用随行；这是 09 `verify(key)`
     * 一参速记的实现展开，理由：壳不拉目录，公钥只能由唯一读者——市场——喂入）。
     * valid=true 时壳侧已写权益（幂等：重复验同密钥 = 刷新 verifiedAt）。
     */
    verify(key: string, publicKey: string): Promise<LicenseVerifyResult>;
    /** 全量权益——市场「已购未安装」分区与临期/过期徽标的数据源（⛔ v1 不做集中管理列表 UI——用户拍板） */
    list(): Promise<LicenseEntitlement[]>;
    /** 移除某插件的权益记录（用户主动清除；安装门随即重新拦） */
    remove(pluginId: string): Promise<void>;
  };
}
