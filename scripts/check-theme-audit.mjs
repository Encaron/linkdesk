/**
 * 机械检查：主题数据防回潮——`toggle-knob-on` 不得与 `accent` 同色。
 *
 * E5.8#144（2026-08-27 用户拍板加 audit）：toggle 开关 ON 态「轨道=旋钮」同色整团淹掉——
 * 根因之一 = 主题数据把 toggle-knob-on 设成与 accent 同值（4 主题全中）。机制 fallback 兜底
 * 「当前」（index.css:216 fallback → text-on-accent），本脚本兜底「未来」——主题作者再写同值
 * 被 `npm run check` 拦下（与 #130 CSS 消费面审计门禁同族）。
 *
 * 用法：node scripts/check-theme-audit.mjs
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 规则：扫描 plugins 下各插件 themes 目录的 JSON，对每个主题每个 colorway：若 colors 同时含
 * `toggle-knob-on` 与 `accent`，二者必须不同色。缺 toggle-knob-on 的主题（走 fallback
 * → text-on-accent）天然合规，跳过。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 收集 plugins/ 下所有 themes/*.json（排除 node_modules） */
function collectThemeFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectThemeFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".json") &&
      entry.name !== "plugin.json" &&
      entry.name !== "package.json"
    ) {
      // 只收 themes/ 目录下的主题定义（plugin.json/package.json 混在同目录时排除）
      if (dir.split(/[\\/]/).includes("themes")) files.push(full);
    }
  }
  return files;
}

/** 定位 colors 对象内某键的起始行号（1-based） */
function keyLine(raw, key) {
  const idx = raw.indexOf(`"${key}"`);
  if (idx === -1) return 0;
  return raw.slice(0, idx).split("\n").length;
}

function main() {
  const pluginsDir = resolve(ROOT, "plugins");
  const themeFiles = collectThemeFiles(pluginsDir);

  let totalViolations = 0;

  for (const file of themeFiles) {
    const raw = readFileSync(file, "utf-8");
    let theme;
    try {
      theme = JSON.parse(raw);
    } catch (e) {
      // 非主题 JSON（schema 等）——跳过；解析失败留给其他门禁
      continue;
    }
    const colorways = Array.isArray(theme?.colorways) ? theme.colorways : [];
    for (const [i, cw] of colorways.entries()) {
      const colors = cw?.colors ?? {};
      const accent = colors.accent;
      const knobOn = colors["toggle-knob-on"];
      // 缺 toggle-knob-on（走 fallback → text-on-accent）天然合规
      if (accent === undefined || knobOn === undefined) continue;
      if (knobOn !== accent) continue;

      const rel = relative(ROOT, file).replace(/\\/g, "/");
      const line = keyLine(raw, "toggle-knob-on") || 0;
      console.error(
        `  ${rel}:${line}  ⚠  colorway「${cw.id ?? i}」toggle-knob-on(${knobOn}) 与 accent(${accent}) 同色——` +
          `ON 态轨道=旋钮整团糊（E5.8#144）。应改为 text-on-accent 值或删键走 fallback。`
      );
      totalViolations++;
    }
  }

  if (totalViolations > 0) {
    console.error(`\n❌ ${totalViolations} 处 toggle-knob-on=accent 同色违规——请修主题数据。`);
    process.exit(1);
  }

  console.log("✅ 全部主题 toggle-knob-on ≠ accent（ON 态旋钮与轨道可区分）。");
}

main();
