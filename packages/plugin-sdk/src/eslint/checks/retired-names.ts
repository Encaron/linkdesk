/**
 * check-css-namespace 腿·**退役名提示**（E6#119 · 2026-09-19 · 🟡 只提示、⛔ 永不拒绝）。
 *
 * ── 规则一句话 ──
 * 宿主会**退役自己的名字**（账 = `schemas/host-reserved.json` 的 `retired[]`，随包逐字节下发）。
 * 作者源码 / `plugin.json` 里若还在引用已退役的名字，本腿**报点提示**：这个名字哪天退的休、
 * 替身是谁、改完怎么走——照 [00 总纲 §〇d](docs/02-Electron架构/E6_插件生态与发布/插件兼容机械化/00-整理档案.md)
 * 的作者面口径（「N 处引用已失效的名字」＋ 名字清单 ＋ `文件:行` ＋ 两步修法）。
 *
 * ── 🔴 这一条永远不是拒绝墙 ──
 * `retired[]` **不是黑名单**（03 号档禁区①）：退役 ≠ 删除，宿主不因它拒载任何插件，本腿的报点
 * **不进 `violations`**（CI 严格腿看不见它）——只进 `hints`，由 lint 报告以 ℹ 行打印。
 * 升级成拒绝 = 自选 2.0 的活，不在本批（红线：把提示升级成拒绝 ⛔）。
 *
 * ── 匹配口径（如实写射程）──
 * 对每条退役登记，在作者源码（ts/tsx/js/jsx/mjs/cjs/html/css ＋ `plugin.json`）里找该名字的
 * **整词出现**（前后都不是标识符字符——`app.theme` 不得误中 `app.themeColorMode`）。
 * 注释里的出现也报（提示多报一次无害；这是 ℹ 不是红）。非代码面（用户 settings.json 等）不在
 * 作者仓里 ⇒ 天然射程外。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles, isTestOrMockRel, relPath } from "./scan.js";

/** 退役登记条目（`host-reserved.json` `retired[]` 的形状——7 字段，唯一真相源 = `scripts/lib/retired-ledger.mjs`） */
export interface RetiredEntry {
  name: string;
  kind: string;
  since: string;
  why: string;
  replacedBy: string;
  landing: string;
  approvedBy: string;
}

export interface RetiredLedger {
  file: string;
  /** false ⇒ 账没读到（判据空转——报告里必须能看出来，⛔ 不许静默） */
  found: boolean;
  retired: RetiredEntry[];
}

/**
 * 包内宿主保留面账定位（`reserved-classes.ts` 同款路径式 resolve——SDK 副本与壳真源逐字节同步）。
 */
const HOST_RESERVED_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../schemas/host-reserved.json",
);

/** 读退役登记栏（只取 `retired[]`；账缺失/坏 ⇒ found=false，⛔ 不许静默丢） */
export function loadRetiredLedger(file: string = HOST_RESERVED_FILE): RetiredLedger {
  if (!existsSync(file)) return { file, found: false, retired: [] };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { retired?: RetiredEntry[] };
    return { file, found: true, retired: Array.isArray(raw.retired) ? raw.retired : [] };
  } catch {
    return { file, found: false, retired: [] };
  }
}

/** 一处退役名引用的提示（名字 ＋ 哪天退的休 ＋ 替身 ＋ 出处） */
export interface RetiredNameHint {
  /** 退役名 */
  name: string;
  /** 退役生效日（账里的 `since`，写日期不写版本号） */
  since: string;
  /** 替身（账里的 `replacedBy`） */
  replacedBy: string;
  /** 工程相对路径（正斜杠） */
  file: string;
  /** 1-based */
  line: number;
}

export interface RetiredNameReport {
  root: string;
  /** 账的加载实况（found=false ⇒ 本腿空转，报告里必须能看出来） */
  ledger: RetiredLedger;
  /** 扫过的源码文件数（审计读数用） */
  filesScanned: number;
  /** 提示站点（⛔ 不进 violations——本腿永远只是提示） */
  hints: RetiredNameHint[];
}

/** 本腿扫描的扩展名（源码 ＋ plugin.json——退役 configKey 的两个真实引用面） */
const SCAN_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".css", ".json"];
/** .json 排除明显不是引用面的（package / tsconfig）；plugin.json 与 themes/*.json（退役外观 id 的落点）都算 */
const isWantedJson = (rel: string): boolean =>
  !/(^|\/)(package(-lock)?|tsconfig(\..*)?)\.json$/.test(rel);

/** 偏移 → 1-based 行号 */
const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 跑本仓退役名提示（作者侧入口）。🔴 `hints` 永不进 violations——升级成拒绝 = 越界（见文件头）。
 * ⚠️ `ledger` 可注入（单测用）；缺省读随包 `schemas/host-reserved.json` 的 `retired[]`。
 */
export function runRetiredNameHint(root: string, ledger: RetiredLedger = loadRetiredLedger()): RetiredNameReport {
  const absRoot = resolve(root);
  const report: RetiredNameReport = { root: absRoot, ledger, filesScanned: 0, hints: [] };
  if (!ledger.found || ledger.retired.length === 0) return report;

  const patterns = ledger.retired.map((entry) => ({
    entry,
    // 整词：名字前后都不是标识符字符（`app.theme` 不得误中 `app.themeColorMode`）
    re: new RegExp(`(^|[^$\\w])${escapeRe(entry.name)}(?![\\w-])`, "g"),
  }));

  for (const file of collectFiles(absRoot, SCAN_EXTS)) {
    const rel = relPath(absRoot, file);
    if (rel.endsWith(".json") ? !isWantedJson(rel) : isTestOrMockRel(rel)) continue;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // 单个文件读不动 ⇒ 跳过（提示腿不做 fail-closed——它本来就不是门禁）
    }
    report.filesScanned++;
    for (const { entry, re } of patterns) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        report.hints.push({
          name: entry.name,
          since: entry.since,
          replacedBy: entry.replacedBy,
          file: rel,
          line: lineAt(text, m.index ?? 0),
        });
      }
    }
  }
  report.hints.sort((x, y) => x.name.localeCompare(y.name) || x.file.localeCompare(y.file) || x.line - y.line);
  return report;
}
