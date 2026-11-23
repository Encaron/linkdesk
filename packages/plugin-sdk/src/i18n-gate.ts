/**
 * 作者侧 i18n 完整性门禁——**manifest 声明面**的硬检查。
 *
 * 与运行时同一份字段表（`display-text.ts`）：声明了哪些语言，`plugin.json` 里每条显示文本
 * 就必须在每种语言字典里有一条译文。缺一条 = `lint`/`publish` 红，而不是等用户在英文界面里
 * 看到中文再回来找。
 *
 * 边界：
 *   · 没声明 `contributes.i18n` / `contributes.languages` ⇒ 不检查（单语言作者自由）；
 *   · 源码 `t()` 的 key 覆盖仍由 own-dict-coverage（黄灯，可能住应用级字典）；
 *   · 主题数据文件里的名字仍由 own-dict-coverage（红）。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  missingDisplayTranslations,
  type MissingDisplayTranslation,
} from "./display-text.js";
import { readPluginManifest } from "./validate.js";

export interface ManifestI18nCheck {
  /** 声明语言 → 字典对象（读失败的语言不在表内，问题在 problems） */
  dicts: Record<string, Record<string, unknown>>;
  missing: MissingDisplayTranslation[];
  problems: string[];
}

interface ManifestShape {
  contributes?: {
    i18n?: Record<string, unknown>;
    languages?: Array<{ id?: string; path?: string }>;
  };
  i18n?: Record<string, unknown>;
}

function declaredDicts(manifest: unknown): Array<{ lang: string; rel: string }> {
  const m = (manifest ?? {}) as ManifestShape;
  const out: Array<{ lang: string; rel: string }> = [];
  const add = (lang: string, rel: unknown) => {
    if (typeof rel === "string" && rel.trim()) out.push({ lang, rel });
  };
  for (const [lang, rel] of Object.entries(m.contributes?.i18n ?? m.i18n ?? {})) add(lang, rel);
  for (const l of m.contributes?.languages ?? []) {
    if (l && typeof l.path === "string" && l.path.trim()) add(String(l.id ?? ""), l.path);
  }
  return out;
}

/** 读工程根的 plugin.json 与它声明的全部字典，返回缺失译文清单。 */
export function checkManifestI18n(root: string): ManifestI18nCheck {
  const manifestPath = join(root, "plugin.json");
  const manifest = readPluginManifest(manifestPath);
  const dicts: Record<string, Record<string, unknown>> = {};
  const problems: string[] = [];
  for (const { lang, rel } of declaredDicts(manifest)) {
    const abs = join(root, ...rel.split("/"));
    if (!existsSync(abs)) {
      problems.push(`${rel}（${lang} 声明但读不到）`);
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(abs, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        problems.push(`${rel} 不是「key → 文案」对象`);
        continue;
      }
      dicts[lang] = { ...(dicts[lang] ?? {}), ...(parsed as Record<string, unknown>) };
    } catch (e) {
      problems.push(`${rel} 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {
    dicts,
    missing: problems.length ? [] : missingDisplayTranslations(manifest, dicts),
    problems,
  };
}

/** 人读一行：`contributes.commands[3].description`（缺 en）。 */
export function formatMissingTranslation(m: MissingDisplayTranslation): string {
  return `${m.label}  缺 ${m.lang}`;
}
