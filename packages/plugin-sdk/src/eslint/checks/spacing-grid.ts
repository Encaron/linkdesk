/**
 * check-spacing-grid.mjs 移植（E6#54d）——间距 4px 节奏刻度门禁（面向第三方插件工程）。
 *
 * 壳版本差异（07 §六·规则载体双轨）：root 相对扫描（任意插件工程）；豁免只留通用类别
 * （测试 mock / i18n·主题·取色器数据目录 / eslint-disable 知情绕行）。token 定义行天然豁免：
 * `--space-*: NNpx` 的属性名不是 padding/margin/gap，属性前缀正则不会命中（与壳同源语义）。
 *
 * 语义（档案）：CSS 声明行的 padding/margin/gap 值在 4px 节奏刻度上；1-6px = 微调值
 * （图标间距/紧凑内边距有意的精细控制）豁免；>6px 非 4 倍数 = 违规模板。
 * 纯函数返回违规数组（不 process.exit）——知情绕行由 buildDisableIndex 裁决。
 */
import { collectFiles, relPath, readSource, stripComments, stripLineComments, isTestOrMockRel, type CheckViolation } from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

const DATA_DIR_RE = /(^|\/)(i18n|themes?|color-picker)\//;
const EXT_CSS = [".css"];
/** 声明行命中：本行含 padding/margin/gap（含 padding-inline 等逻辑属——前缀 \b 后须紧跟 :，逻辑属被天然排除，与壳同源） */
const DECL_LINE_RE = /\b(padding|margin|gap)\s*:/;
const PX_RE = /\b(\d+)px\b/g;

export function runSpacingGridCheck(root: string): CheckViolation[] {
  const violations: CheckViolation[] = [];
  for (const css of collectFiles(root, EXT_CSS)) {
    const rel = relPath(root, css);
    if (isTestOrMockRel(rel)) continue;
    if (DATA_DIR_RE.test(rel)) continue;
    const src = readSource(css);
    const disabled = buildDisableIndex(src, [CHECK_IDS.spacingGrid]);
    const cleaned = stripLineComments(stripComments(src));
    cleaned.split("\n").forEach((line, i) => {
      if (!DECL_LINE_RE.test(line)) return;
      const line1 = i + 1;
      for (const m of line.matchAll(PX_RE)) {
        const value = parseInt(m[1], 10);
        if (value <= 6) continue; // 微调值（图标间距/紧凑内边距有意的精细控制）
        if (value % 4 === 0) continue; // 4px 节奏合规
        // 知情绕行 = 静默豁免（对齐 eslint suppress 语义，disable 声明后不亮灯）
        if (isDisabled(disabled, line1, CHECK_IDS.spacingGrid)) continue;
        violations.push({
          file: rel,
          line: line1,
          message: `${line.trim().slice(0, 100)}  ← ${value}px 不在 4px 节奏刻度上（padding/margin/gap）——` +
            "归到最近 4px 倍数，或 eslint-disable-next-line linkdesk/no-nonstandard-spacing -- 理由",
        });
      }
    });
  }
  return violations;
}
