/**
 * V2Migration — V2 `prefs.json` → V3 配置映射导入。
 *
 * E3g #63：对标 VS Code "导入配置"——老用户升级不丢设置。
 * 映射表驱动——加新映射只加一行。
 *
 * 入口：命令面板 `workbench.action.importV2Settings`
 */

import { pushToast } from "../core/NotificationService";
import { setConfigurationValue } from "../core/ConfigurationService";

/* ── 映射表：V2 key → V3 configuration key ── */

const V2_MAPPING: Record<string, string> = {
  BaudRate: "terminal.baudRate",
  Encoding: "terminal.encoding",
  Theme:    "app.theme",
};

/* ── 公开 API ── */

/** 从 V2 prefs.json 内容中提取可迁移的配置项 */
export function extractV2Settings(v2Json: Record<string, unknown>): Array<{ v2Key: string; v3Key: string; value: unknown }> {
  const results: Array<{ v2Key: string; v3Key: string; value: unknown }> = [];
  for (const [v2Key, v3Key] of Object.entries(V2_MAPPING)) {
    if (v2Key in v2Json) {
      results.push({ v2Key, v3Key, value: v2Json[v2Key] });
    }
  }
  return results;
}

/** 应用提取的配置项——逐 key 写入 ConfigurationService */
export function applyV2Settings(entries: Array<{ v2Key: string; v3Key: string; value: unknown }>): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  for (const { v2Key, v3Key, value } of entries) {
    try {
      setConfigurationValue(v3Key, value);
      imported++;
    } catch (e) {
      console.warn(`[V2Migration] "${v2Key}" → "${v3Key}" 写入失败:`, e);
      skipped++;
    }
  }

  return { imported, skipped };
}

/**
 * 完整导入流程——由命令 handler 调用。
 * 文件读取和 JSON 解析由调用方负责（通过 dialog + filesystem）。
 */
export function importV2Config(rawJson: Record<string, unknown>): void {
  const found = Object.keys(rawJson).filter((k) => k in V2_MAPPING);
  const unknown = Object.keys(rawJson).filter((k) => !(k in V2_MAPPING));

  if (found.length === 0) {
    pushToast({
      message: "V2 配置文件中无可识别配置项",
      source: "v2-migration",
      severity: "warning",
    });
    return;
  }

  const entries = extractV2Settings(rawJson);
  const { imported, skipped } = applyV2Settings(entries);

  const msg = `已导入 ${imported} 项 V2 配置`;
  if (skipped > 0) {
    pushToast({ message: `${msg}（${skipped} 项失败）`, source: "v2-migration", severity: "warning" });
  } else {
    pushToast({ message: msg, source: "v2-migration", severity: "info" });
  }

  if (unknown.length > 0) {
    console.warn(`[V2Migration] 未知 V2 配置项（已跳过）: ${unknown.join(", ")}`);
    pushToast({
      message: `已跳过 ${unknown.length} 个未知 V2 配置项: ${unknown.join(", ")}`,
      source: "v2-migration",
      severity: "info",
    });
  }
}
