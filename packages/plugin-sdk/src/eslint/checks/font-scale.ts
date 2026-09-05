/**
 * check-font-scale-audit.mjs 移植（E6#54d）——字号度量防回潮（面向第三方插件工程）。
 *
 * 壳版本差异（07 §六·规则载体双轨 + 第三方无壳 DOM 概念）：
 *   - root 相对扫描（任意插件工程）；含 .tsx/.jsx 行内 `style={{ fontSize: NN }}`；
 *   - 壳「独立显示图标 WHITELIST 注册表」**不移植**——那是壳专属 CSS 选择器清单，对第三方
 *     工程是死代码。图标等确有意的裸 px 字号 → 该行 eslint-disable linkdesk/no-hardcoded-font-size
 *     -- 理由（07 §七·2 知情绕行），不再发明第二套白名单语法；
 *   - 豁免只留通用类别：token 定义不适用（font-size 无定义/消费分界，见下）/ 测试 mock /
 *     i18n·主题·取色器数据目录 / 内容画布文件级 disable。
 *   - 纯函数返回违规数组（不 process.exit）——知情绕行由 buildDisableIndex 裁决。
 *
 * 语义（档案 §七）：`font-size: NNpx` / `line-height: NNpx` 裸 px 一律拦（须走插件的
 * 字号 token / --ui-scale 生态）；unitless / calc / var() / % 放行。1-6px 微调豁免不适用
 * 字号（字号无微调豁免——壳原版也无，字号哪怕 12px 也须 token）。
 */
import { collectFiles, relPath, readSource, stripComments, stripLineComments, countNewlines, isTestOrMockRel, type CheckViolation } from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

const DATA_DIR_RE = /(^|\/)(i18n|themes?|color-picker)\//;
const EXT_CSS = [".css"];
const EXT_JSX = [".tsx", ".jsx"];
const PX_ONLY_RE = /^\d+(\.\d+)?px$/;
/** tsx 行内 `style={{ fontSize: NN }}`（px 数字字面量）——多行 style 对象亦覆盖 */
const INLINE_FONT_SIZE_RE = /style\s*[:=]\s*\{[\s\S]*?fontSize\s*:\s*(\d+(?:\.\d+)?)/g;

interface CssRule {
  selector: string; // 递归收集的每个 CSS 规则块
  inner: string; // 块体（可再含嵌套块）
  line: number; // 0-based 绝对行号
}

/** 递归收集 CSS 规则块（含 @media 等内层嵌套块）；从去注释文本解析 → 行号不漂移 */
function collectBlocks(text: string, baseLine: number, out: CssRule[]): void {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const open = text.indexOf("{", i);
    if (open === -1) break;
    const prevSemi = text.lastIndexOf(";", open);
    const prevClose = text.lastIndexOf("}", open);
    const selStart = Math.max(prevSemi, prevClose) + 1;
    const selector = text.slice(selStart, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < n && depth > 0) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    const inner = text.slice(open + 1, j - 1);
    const line = baseLine + countNewlines(text.slice(0, open));
    if (selector) out.push({ selector, inner, line });
    collectBlocks(inner, line, out);
    i = j;
  }
}

const HINT =
  "字号必须 var(--font-size-*) / 行高 unitless 或 calc(*var(--ui-scale))（LinkDesk 度量体系门禁）；" +
  "确属独立显示图标 → eslint-disable-next-line linkdesk/no-hardcoded-font-size -- 理由";

function auditCssFile(abs: string, rel: string, violations: CheckViolation[], disabled: ReturnType<typeof buildDisableIndex>): void {
  const src = readSource(abs);
  const cleaned = stripComments(src);
  const rules: CssRule[] = [];
  collectBlocks(cleaned, 0, rules);
  for (const rule of rules) {
    // 只扫本层声明（首个 `{` 之前）——嵌套块由递归单独处理，避免双报
    const nested = rule.inner.indexOf("{");
    const declText = nested === -1 ? rule.inner : rule.inner.slice(0, nested);
    for (const part of declText.split(";")) {
      const decl = part.trim();
      if (!decl) continue;
      const colon = decl.indexOf(":");
      if (colon === -1) continue;
      const property = decl.slice(0, colon).trim().toLowerCase();
      if (property !== "font-size" && property !== "line-height") continue;
      const value = decl.slice(colon + 1).trim().replace(/!important\s*$/, "").trim();
      if (!PX_ONLY_RE.test(value)) continue; // 非裸 px（token/calc/unitless）放行
      const declIdx = declText.indexOf(decl);
      const line1 = rule.line + countNewlines(declText.slice(0, declIdx)) + 1;
      // 知情绕行 = 静默豁免（对齐 eslint suppress 语义，disable 声明后不亮灯）
      if (isDisabled(disabled, line1, CHECK_IDS.fontScale)) return;
      violations.push({
        file: rel,
        line: line1,
        message: `${value}（selector: ${rule.selector}）← 裸 px 字号/行高——${HINT}`,
      });
    }
  }
}

function auditJsxFile(abs: string, rel: string, violations: CheckViolation[], disabled: ReturnType<typeof buildDisableIndex>): void {
  const src = readSource(abs);
  const cleaned = stripLineComments(stripComments(src)); // 注释伪报排除（行号不漂移）
  let m: RegExpExecArray | null;
  INLINE_FONT_SIZE_RE.lastIndex = 0;
  while ((m = INLINE_FONT_SIZE_RE.exec(cleaned)) !== null) {
    const line1 = countNewlines(cleaned.slice(0, m.index)) + 1;
    if (isDisabled(disabled, line1, CHECK_IDS.fontScale)) continue; // 知情绕行 = 静默豁免
    violations.push({
      file: rel,
      line: line1,
      message: `行内 style fontSize = ${m[1]}px ← 裸 px 字号——${HINT}`,
    });
  }
}

export function runFontScaleCheck(root: string): CheckViolation[] {
  const violations: CheckViolation[] = [];
  for (const css of collectFiles(root, EXT_CSS)) {
    const rel = relPath(root, css);
    if (isTestOrMockRel(rel)) continue;
    if (DATA_DIR_RE.test(rel)) continue;
    auditCssFile(css, rel, violations, buildDisableIndex(readSource(css), [CHECK_IDS.fontScale]));
  }
  for (const jsx of collectFiles(root, EXT_JSX)) {
    const rel = relPath(root, jsx);
    if (isTestOrMockRel(rel)) continue;
    if (DATA_DIR_RE.test(rel)) continue;
    auditJsxFile(jsx, rel, violations, buildDisableIndex(readSource(jsx), [CHECK_IDS.fontScale]));
  }
  return violations;
}
