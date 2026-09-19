/**
 * check 腿——**`@linkdesk/ui` 样式 import 判红**（E6#123 · L9「UI 集中供给」的 CSS 通道定案）。
 *
 * ── 它守的是哪句话 ──
 *   L9 起 `@linkdesk/ui` 的组件**代码与样式都由壳池 vendor 单实例供给**（import-map JS +
 *   `dist/pool.html` vendor css link；插件 bundle 里不再有组件实现，也不再该有组件样式）。
 *   插件源码里出现 `import "@linkdesk/ui/index.css"`（或其 dist 形态 / css @import）⇒ 组件样式
 *   重新烤进插件自己的 `index.bundle.css`——「壳改样式全生态跟随」破产一半，判红。
 *
 * ── 判定式（结构性，不猜写法）──
 *   扫插件工程源文件（.ts/.tsx/.js/.jsx/.mjs/.cjs/.css）里出现 specifier
 *   `@linkdesk/ui/index.css`（含 `/dist/` 变体）**本身**即违规——side-effect import、具名 import、
 *   动态 import、css `@import` 一视同仁（specifier 就是违规物，不区分语法形态；
 *   同 check-pool-css-imports 的「判 at-rule 本身不判写法」口径）。
 *   注释里的提及不算（stripComments / stripLineComments 同其余 check）。
 *
 * ── 报文指向 ──
 *   作者面文档：`docs/03-插件制造/19-组件速查.md §二`（英文 `docs/03-plugin-authoring/19-component-cheatsheet.md §2`）
 *   与 `05-插件UI写法规约.md §12.4`（EN `05-ui-conventions.md §12.4`）。作者侧动作只有一种：
 *   **删掉该行**——样式由壳供给，无需任何替代写法。
 *   ⚠️ 本腿**没有豁免出口**（disable 注释对它无效——「知情地把样式烤死」不是合法偏离，
 *   是语义错误；其余腿的 disable 机制不含本腿）。存量=0（#123 侦察：四只消费仓＋仓内插件全部零 import）。
 */
import { collectFiles, relPath, readSource, stripComments, stripLineComments, countNewlines, isTestOrMockRel, type CheckViolation } from "./scan.js";

const EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"];

/** 违规物 = specifier 本身（dist 形态一并覆盖；@linkdesk/ui 本体与其它子路径不在此列） */
const SPECIFIER_RE = /@linkdesk\/ui\/(?:dist\/)?index\.css/g;

export const UI_CSS_IMPORT_WHY =
  "组件样式由壳池统一供给：插件源码不 import @linkdesk/ui 的 css——删掉该行即可，无需替代写法；" +
  "作者面说明见《组件速查》§二（05-插件UI写法规约 §12.4）";

export function runUiCssImportCheck(root: string): CheckViolation[] {
  const violations: CheckViolation[] = [];
  for (const abs of collectFiles(root, EXT)) {
    const rel = relPath(root, abs);
    if (isTestOrMockRel(rel)) continue; // 与其余 check 同口径：测试夹具里的字符串不是真 import
    const cleaned = stripLineComments(stripComments(readSource(abs)));
    const re = new RegExp(SPECIFIER_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      violations.push({
        file: rel,
        line: countNewlines(cleaned.slice(0, m.index)) + 1,
        message: `插件源码 import 了 @linkdesk/ui 的样式（${m[0]}）——组件样式已由壳池 vendor 统一供给。${UI_CSS_IMPORT_WHY}`,
      });
    }
  }
  return violations;
}
