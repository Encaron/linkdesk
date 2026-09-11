/**
 * sourceUrl — 市场**源 URL** 的归一与还原（用户填的地址 → 可 fetch 直链；条目 → 插件自己的主页）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：types → 本文件（叶，无人依赖本文件以外的内部符号）。
 */

import type { CatalogEntry } from "./types";

/** 官方默认源（mockup/01 §6.2 定死：encaron/linkdesk-marketplace）——恒拉取、UI「内置」锁 */
export const OFFICIAL_SOURCE_URL =
  "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/main/marketplace.json";

/** GitHub 仓库主页 URL（https://github.com/owner/repo）→ raw marketplace.json 直链（HEAD 免猜分支） */
export function repoUrlToRawUrl(repoUrl: string): string | null {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/.exec(repoUrl.trim());
  if (!m) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/marketplace.json`;
}

/** 已是 raw.githubusercontent 的 marketplace.json 直链？ */
export function isRawMarketplaceUrl(url: string): boolean {
  return /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/.*marketplace\.json$/.test(url.trim());
}

/** 把用户提供的源 URL 归一为可 fetch 的 marketplace.json 直链——仓库主页 URL 或已直链都收 */
export function normalizeSourceUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (isRawMarketplaceUrl(raw)) return raw;
  return repoUrlToRawUrl(raw);
}

/** 从 URL 里认 github.com `owner/repo` 主页——只认两个已知形态：`github.com/…`（downloadUrl 的
 *  releases/download 段、作者填的主页）与 `raw.githubusercontent.com/…`（readmeUrl）。
 *  其余主机一律不猜（推不出 = 调用方不渲染，诚实不伪链——E6#77 甲）。 */
function githubRepoHome(url?: string): string | undefined {
  if (!url) return undefined;
  const s = url.trim();
  const m =
    /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)/i.exec(s) ??
    /^https?:\/\/raw\.githubusercontent\.com\/([^/?#]+)\/([^/?#]+)/i.exec(s);
  if (!m) return undefined;
  const repo = m[2].replace(/\.git$/i, "");
  if (!repo) return undefined;
  return `https://github.com/${m[1]}/${repo}`;
}

/** 作者声明的 repository → 主页 URL——完整 http(s) URL 才收（不猜相对/简写形态）；github.com 形态
 *  归一为主页 URL，其余主机原样留（自有官网 / Gitee / CDN 分发页都是合法答案，见 E6#77 乙） */
function declaredRepoHome(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return undefined;
  return githubRepoHome(s) ?? s.replace(/\/+$/, "");
}

/**
 * 插件**自己的**仓库主页（E6#77）——用于详情页资源组「仓库 / 问题」。
 *
 * 🔴 与 `entry.sourceName` 不是一回事：`sourceName` 是「这条是从哪个**市场源**列出来的」（合并注入），
 * 官方汇总目录里所有插件共用同一个货架名。此前详情页拿 sourceName 拼「仓库」链接 ⇒ 全体插件跳到
 * 商店自己那个仓库（用户 2026-09-11 实机发现：hello-linkdesk 的「仓库」跳到 linkdesk-marketplace）。
 *
 * 判序：**乙**（作者显式 `repository`）优先 → **甲**（`downloadUrl` / `readmeUrl` 里推 github owner/repo）
 * → 都推不出返回 undefined（调用方**不渲染该行**——宁可不显示，不指错路）。
 */
export function pluginRepoUrl(
  entry?: Pick<CatalogEntry, "repository" | "downloadUrl" | "readmeUrl">,
): string | undefined {
  if (!entry) return undefined;
  return (
    declaredRepoHome(entry.repository) ??
    githubRepoHome(entry.downloadUrl) ??
    githubRepoHome(entry.readmeUrl)
  );
}

/** 来源标注名：从 raw URL 抽 owner/repo（无 github raw 形态 → 回退 host+路径前两段） */
export function sourceNameOfUrl(rawUrl: string): string {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)/.exec(rawUrl);
  if (m) return `${m[1]}/${m[2]}`;
  const h = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)/.exec(rawUrl);
  return h ? `${h[1]}/${h[2]}/${h[3]}` : rawUrl;
}
