/**
 * check-css-hardcode.mjs 移植（E6#54d）——非 token 颜色字面量门禁。
 *
 * 与壳版本差异（07 §六·规则载体双轨 + 面向第三方工程）：
 *   - root 相对扫描（任意插件工程），不写死壳目录；
 *   - 豁免只留通用类别：token 定义行（--name: 字面量）/ 测试 mock / i18n·主题·取色器数据目录
 *     / 内容画布文件级 eslint-disable（07 §七·2 视图级豁免）；
 *   - ts/tsx 只扫 rgb()/hsl()（hex 由 eslint linkdesk/no-hardcoded-hex 规则拦——避免同 hex
 *     双报噪音）；.css 全扫（hex + rgb/hsl——eslint 到不了 .css）。
 *   - 纯函数返回违规数组（不 process.exit）——知情绕行由 buildDisableIndex 裁决。
 */
import { collectFiles, relPath, readSource, stripComments, stripLineComments, isTestOrMockRel, type CheckViolation } from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

const DATA_DIR_RE = /(^|\/)(i18n|themes?|color-picker)\//;
const EXT_CSS = [".css"];
const EXT_CODE = [".ts", ".tsx"];

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_RE = /rgba?\(|hsla?\(/g;
/** 定义上下文：本行属 `--name: <字面量>` 自定义属性（token 单一权威，非消费） */
const DEF_RE = /--[\w-]+\s*:\s*(?!var\()/;

/** rgb()/hsl() 参数含动态模板（${/var(/calc(/color-mix(/#hex）→ 非硬编码字面量 */
function isDynamicFunc(line: string, index: number): boolean {
  const open = line.lastIndexOf("(", index);
  const close = line.indexOf(")", index);
  const body = line.slice(open + 1, close < 0 ? undefined : close);
  return /(\$\{|\bvar\(|calc\(|\bcolor-mix\(|#[0-9a-fA-F]{3,})/.test(body);
}

export function runCssHardcodeCheck(root: string): CheckViolation[] {
  const violations: CheckViolation[] = [];
  const push = (rel: string, line: number, message: string, disabled: ReturnType<typeof buildDisableIndex>): void => {
    // 知情绕行 = 静默豁免（对齐 eslint 原生 suppress 语义——disable 声明后不亮灯；内容画布
    // 文件级一次声明即整体安静）。disable 注释本身 = 市场偏离收集器的机器可读标记，无需 echo。
    if (isDisabled(disabled, line, CHECK_IDS.cssHardcode)) return;
    violations.push({ file: rel, line, message });
  };

  for (const css of collectFiles(root, EXT_CSS)) {
    const rel = relPath(root, css);
    if (isTestOrMockRel(rel)) continue;
    if (DATA_DIR_RE.test(rel)) continue;
    const src = readSource(css);
    const disabled = buildDisableIndex(src, [CHECK_IDS.cssHardcode]);
    // 去块注释再行注释（保行号）；行注释靠 (^|[^:]) 守卫防 https:// 误伤
    const cleaned = stripLineComments(stripComments(src));
    cleaned.split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      if (DEF_RE.test(line)) return; // token 定义行豁免
      const hits: { color: string; index: number }[] = [];
      for (const m of line.matchAll(HEX_RE)) hits.push({ color: m[0], index: m.index });
      for (const m of line.matchAll(RGB_RE)) {
        if (!isDynamicFunc(line, m.index)) {
          hits.push({ color: m[0] === "rgb(" || m[0] === "rgba(" ? "rgb()" : "hsl()", index: m.index });
        }
      }
      for (const h of hits) {
        push(
          rel,
          i + 1,
          `${line.trim().slice(0, 100)}  ← 硬编码 ${h.color}（应走 CSS 变量 var(--text-*/--bg-*/--accent-*/--surface-*)）`,
          disabled
        );
      }
    });
  }

  for (const code of collectFiles(root, EXT_CODE)) {
    const rel = relPath(root, code);
    if (isTestOrMockRel(rel)) continue;
    if (DATA_DIR_RE.test(rel)) continue;
    const src = readSource(code);
    const disabled = buildDisableIndex(src, [CHECK_IDS.cssHardcode]);
    // ts/tsx：hex 由 eslint linkdesk/no-hardcoded-hex 规则拦，这里只补 rgb()/hsl()——强化版 hex 门禁
    const cleaned = stripLineComments(stripComments(src));
    cleaned.split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      for (const m of line.matchAll(RGB_RE)) {
        if (isDynamicFunc(line, m.index)) continue;
        push(
          rel,
          i + 1,
          `${line.trim().slice(0, 100)}  ← 硬编码 ${m[0] === "rgb(" || m[0] === "rgba(" ? "rgb()" : "hsl()"}（应走 CSS 变量）`,
          disabled
        );
      }
    });
  }

  return violations;
}
