/**
 * installConfirmPayload——E6#71c 安装确认卡载荷构造（纯函数，单测友好）。
 *
 * 数据流：DetailView 点「安装」→ 门禁放行 → installConfirmPayload(entry, installVer) 构造载荷 →
 * linkdesk.dialog.confirmContent({ pluginId:"marketplace", viewId:"marketplace-install-confirm", payload })
 * → 壳解析声明视图 renderPath → 池 DialogHost content 槽挂载 ConfirmInstall 视图 → 视图经
 * dialogHost.current()?.content?.payload 读本载荷渲染确认卡。
 *
 * 载荷只带原始数据（结构克隆过 IPC——不透明，壳不解释）；展示串（大小 KB/MB、v 前缀、官方徽标）
 * 在视图内本地派生——富内容排版仍在市场 bundle 内（§四·三「排版/按钮市场自由画」）。
 *
 * E6#71k：卡片不再「每插件一张」而是「每来源一张」——`trustGrant` 携带本次确认的信任语义
 * （remember / never），卡片语义 = 「安装来自 <来源> 的插件，并信任此来源？」。卡本身不删（见 18 §五 J）。
 */

import type { CatalogEntry } from "./marketCatalog";

/** 目录条目 author 兼容 {name,url} / string 两种形态——抽展示名 */
export function authorLabel(a: CatalogEntry["author"]): string | undefined {
  if (typeof a === "string") return a || undefined;
  return a?.name || undefined;
}

/** 来源名（owner/repo 或 host/owner/repo）→ 仓库主页 URL——零新字段零服务器（04 §三） */
export function repoHomeUrl(sourceName?: string): string | undefined {
  if (!sourceName) return undefined;
  const parts = sourceName.split("/");
  if (parts.length === 2) return `https://github.com/${sourceName}`; // github raw 形态 sourceNameOfUrl
  if (parts.length >= 3) return `https://${sourceName}`; // host/owner/repo（gitee 等）
  return undefined;
}

/** 字节可读化——KB/MB 通用单位零 i18n（诚实：来自目录 size，未装 = 包大小） */
export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 1024 * 10 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 安装确认载荷——ConfirmInstall 视图渲染所需目录字段子集（结构克隆安全：纯原始数据零函数零闭包） */
export interface InstallConfirmPayload {
  /** 插件显示名（未装 = 目录原始名，非 i18n 键——作者数据按原文展示） */
  name: string;
  /** 发布者展示名（authorLabel 解析后 string） */
  publisher?: string;
  /** 胜出条目来自官方默认源 → 官方发布徽标（entry.official 合并注入，UI 零再判） */
  official?: boolean;
  /** 来源仓库名（owner/repo） */
  sourceName?: string;
  /** 来源仓库主页 URL（repoHomeUrl 派生，可空——无源行诚实不伪链） */
  repoUrl?: string;
  description?: string;
  /** 目标安装版本（无 v 前缀——视图加 v 展示；版本下拉所选/默认最新） */
  version?: string;
  /** 包大小字节——视图本地 fmtSize 派生 */
  size?: number;
  license?: string;
  /**
   * E6#71k 信任语义（仅「信任门判定要弹卡」时携带；官方源 / 已信任来源不弹卡 → 恒无此字段）。
   * `"remember"` = 确认后记住该来源、此后同源不再询问；`"never"` = http 明文源不可记忆，
   * 每次安装都会询问（08-信任与安全 §四.2）。视图据此选一句告知文案——不接收成品文本（硬约束 2）。
   */
  trustGrant?: "remember" | "never";
}

/**
 * 构造安装确认载荷——字段 = 目录条目子集 + 实际目标版本。
 * 安装门禁只对未装放行 → name/publisher/desc/repoUrl 取未装 catalog 原数据即可
 * （与确认卡旧 JSX authorText/nameText 未装分支同源：authorLabel(entry.author) / entry.name）。
 */
export function installConfirmPayload(
  entry: CatalogEntry,
  installVer?: string,
  trustGrant?: "remember" | "never",
): InstallConfirmPayload {
  const sourceName = entry.sourceName;
  return {
    name: entry.name,
    description: entry.description,
    publisher: authorLabel(entry.author),
    official: entry.official,
    sourceName,
    repoUrl: repoHomeUrl(sourceName),
    version: installVer ?? entry.version,
    size: entry.size,
    license: entry.license,
    trustGrant,
  };
}
