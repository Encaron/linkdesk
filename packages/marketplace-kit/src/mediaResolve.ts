/**
 * mediaResolve — 作者侧 `marketplace-kit media:resolve` 的纯实现（批次 D5）。
 *
 * 与市场渲染同一条规则（17 §3.2）：海报 → cover → 静帧、去重、上限 3；视频至多 1 段且排第一。
 * ⚠️ 规则只有一份正典（市场插件 `views/store/cards/mediaModel.ts`）——本件是**作者 dry-run 镜像**：
 * 改规则必须两处同笔（两套测试钉同一组用例），⛔ 只在一边改。
 *
 * URL 判据不在本件重复：直接消费 `validateMarketplace` 的媒体错误（`screenshot-*`），
 * 保证「dry-run 报的」＝「发布校验报的」＝「市场渲染丢帧的口径」。
 */

import { validateMarketplace, type ValidateIssue } from "./validate.js";

export const MEDIA_MAX_FRAMES = 3;
const HTTPS_URL = /^https:\/\/[^\s]+$/i;

export type MediaKind = "video" | "image" | "generated";

export interface ResolvedMedia {
  id: string;
  kind: MediaKind;
  frames: string[];
  video: { url: string; poster?: string } | null;
}

export interface MediaResolveResult {
  entries: ResolvedMedia[];
  errors: ValidateIssue[];
  warnings: ValidateIssue[];
}

function mediaOfEntry(raw: unknown): ResolvedMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as { id?: unknown; screenshots?: unknown; cover?: unknown };
  if (typeof e.id !== "string" || !e.id) return null;
  const shots = Array.isArray(e.screenshots) ? e.screenshots : [];
  const stills: string[] = [];
  let video: { url: string; poster?: string } | null = null;
  for (const item of shots) {
    if (typeof item === "string") {
      if (HTTPS_URL.test(item.trim())) stills.push(item.trim());
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const v = item as { type?: unknown; url?: unknown; poster?: unknown };
    if (v.type !== "video" || typeof v.url !== "string" || video) continue;
    if (!HTTPS_URL.test(v.url.trim())) continue;
    const poster =
      typeof v.poster === "string" && HTTPS_URL.test(v.poster.trim()) ? v.poster.trim() : undefined;
    video = poster ? { url: v.url.trim(), poster } : { url: v.url.trim() };
  }
  const cover =
    typeof e.cover === "string" && HTTPS_URL.test(e.cover.trim()) ? e.cover.trim() : null;
  const frames = [...new Set([video?.poster, cover, ...stills].filter((f): f is string => !!f))].slice(
    0,
    MEDIA_MAX_FRAMES,
  );
  const kind: MediaKind = video ? "video" : frames.length ? "image" : "generated";
  return { id: e.id, kind, frames, video };
}

/** 选帧 dry-run（可只解析一个 id）——errors 非空 ⇒ CLI 退出码 1 */
export function mediaResolve(data: unknown, id?: string): MediaResolveResult {
  const validation = validateMarketplace(data);
  const mediaIssues = (list: ValidateIssue[]): ValidateIssue[] =>
    list.filter((i) => i.code.startsWith("screenshot-"));
  const errors = mediaIssues(validation.errors);
  const warnings = mediaIssues(validation.warnings);

  const plugins =
    data && typeof data === "object" && Array.isArray((data as { plugins?: unknown }).plugins)
      ? ((data as { plugins: unknown[] }).plugins)
      : [];
  const entries = plugins
    .map(mediaOfEntry)
    .filter((m): m is ResolvedMedia => !!m && (!id || m.id === id));
  if (id && entries.length === 0 && errors.length === 0) {
    errors.push({
      code: "screenshot-entry-missing",
      severity: "error",
      path: `plugins[${id}]`,
      message: `文件 marketplace.json：plugins[${id}] → 期望：目录里存在该 id → 示例：先在 plugins[] 里上架该插件`,
    });
  }
  return { entries, errors, warnings };
}

/** CLI 文本渲染（AI 可读；`--json` 走 JSON.stringify(result)） */
export function formatMediaResolve(result: MediaResolveResult): string {
  const lines: string[] = [];
  for (const m of result.entries) {
    const video = m.video
      ? ` video=${m.video.url}${m.video.poster ? ` poster=${m.video.poster}` : "（缺海报）"}` : "";
    lines.push(`[${m.id}] kind=${m.kind} frames=${m.frames.length}${video}`);
    m.frames.forEach((f, i) => lines.push(`  frame[${i}] ${f}`));
  }
  for (const w of result.warnings) lines.push(`⚠ [${w.code}] ${w.path}: ${w.message}`);
  for (const e of result.errors) lines.push(`✗ [${e.code}] ${e.path}: ${e.message}`);
  return lines.join("\n") || "（没有可解析的条目）";
}
