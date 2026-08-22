/**
 * LangDefRegistry——编程语言定义登记本。
 *
 * E4V#40s5a：对标 FileAssociationService——同一个模式。
 * 插件 plugin.json 声明 contributes.langDefs → loader 自动注册到这里。
 * EditorView 打开文件时查本表找 LSP 配置。
 *
 * 🔥 大厅桌子——核心只知道"有人注册了语言定义"，不知道语言是什么。
 *    三条准入标准全满足：多提供方、多消费方、桌子不知道内容。
 */
import type { LangDefContribution } from "../../api/types";
import { trackRegistration } from "../registrationTracker";

/** extension（小写，带点） → LangDefContribution */
const _extMap = new Map<string, LangDefContribution>();

/** pluginId → Set<extension>——卸载时快速清除 */
const _pluginExts = new Map<string, Set<string>>();

/* ── 注册 ── */

export function registerLangDef(pluginId: string, def: LangDefContribution): () => void {
  // E5.5#7 Bug B fix：标记注册来源——用于跨 WebView IPC 同步。
  def._pluginId = pluginId;
  const added: string[] = [];
  for (const rawExt of def.extensions) {
    const ext = normalizeLangExt(rawExt);
    if (!ext) continue;
    if (_extMap.has(ext)) {
      console.warn(
        `[LangDefRegistry] ".${ext}" 已有注册，${pluginId} 覆盖`,
      );
    }
    _extMap.set(ext, def);
    added.push(ext);
    const exts = _pluginExts.get(pluginId) ?? new Set();
    exts.add(ext);
    _pluginExts.set(pluginId, exts);
  }
  // E5.8#10：引用级删除——只删自己这条，不误删后来注册者覆盖的条目。
  // 反向索引仅在实删时移除——被覆盖的 ext 仍属本插件（经第二份 def），须保留。
  return trackRegistration(pluginId, () => {
    for (const ext of added) {
      if (_extMap.get(ext) === def) {
        _extMap.delete(ext);
        const exts = _pluginExts.get(pluginId);
        if (exts) {
          exts.delete(ext);
          if (exts.size === 0) _pluginExts.delete(pluginId);
        }
      }
    }
  });
}

/* ── 查询 ── */

export function getLangDef(extension: string): LangDefContribution | undefined {
  const ext = normalizeLangExt(extension);
  return ext ? _extMap.get(ext) : undefined;
}

export function hasLspFor(extension: string): boolean {
  const def = getLangDef(extension);
  return !!def?.lsp;
}

export function getAllLangDefs(): Map<string, LangDefContribution> {
  return new Map(_extMap);
}

export function clearLangDefs(): void {
  _extMap.clear();
  _pluginExts.clear();
}

/* ── 工具 ── */

function normalizeLangExt(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (!s) return "";
  if (!s.startsWith(".")) s = "." + s;
  return s;
}
