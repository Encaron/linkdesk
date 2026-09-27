/**
 * check 腿——**插件源码里 JSX 原生 `title=` 判红**（04「悬停提示系统」件 2 · 门禁腿 1/3）。
 *
 * ── 这条禁令为什么要有腿 ──
 * 悬停提示已由宿主 `HintTip`（`data-hint*` **属性式**，零新 API/零新 IPC/零 contributes）统一接管：
 * 深浅主题、字号缩放、位置翻面、快捷键键帽全由壳一处决定。原生 `title=` 是**第二把尺子**——浏览器画、
 * 样式不可控、与键帽那套必然分叉（memory `two-rulers-one-caliber`）。作者在自己仓里写它就等于把提示
 * 交给"另一套渲染器"，所以这条腿在**作者侧**也要红。
 *
 * ── 判据（三档，⚠️ 判据物是 **JSX 开标签上的属性**，不是文件里出现 `title` 字样）──
 *   ① 小写 HTML 标签上的 title= 判红（`<button title=` / `<span title=` / `<div title=`…）——小写 = DOM
 *      元素，一定落到原生提示。
 *   ② 大写组件上的 title= 是组件自己的 prop，不判——`<SidebarSection title="">` 的标题文本、视图元数据
 *      对象的 `.title` 都会落在这里；一刀切判 `title=` 满屏假红，而**假红会让真红失效**。
 *      ⚠️ `@linkdesk/ui` 的 `Button` / `Badge` / `Combobox` / `SelectBox` 等件的 `title` **prop**
 *      是"悬停提示"语义，宿主已把它渲染成 `data-hint`（件 3 起）⇒ 调用方写 `<Button title={…}>` 不判红。
 *   ③ 豁免 = // eslint-disable-next-line linkdesk/no-native-title -- 理由（理由必填）——照 `disable.ts`
 *      既有形态，同一个腿 id 壳侧门禁也认（`scripts/check-native-title.mjs`）。
 *
 * ── 正解（插件自由制造，报错即文档）──
 *   · 属性式（覆盖多数场景，零 import）：`title={t("刷新")}` → `data-hint={t("刷新")}`；
 *     揭示类（"看全被截断的字"）加 `data-hint-delay="0"`；要带快捷键就 `data-hint-command="<命令 id>"`；
 *   · 组件式（复合场景）：`import { HintTip } from "@linkdesk/ui"` → `<HintTip label={…} command={…}>`。
 *
 * ── 锚⑪：判据口径跨包同源（本腿 ⇄ 壳门禁 `scripts/check-native-title.mjs`）──
 * 跨包无法 import ⇒ 照 `锚⑧`/`锚⑨`/`锚⑩` 先例钉**锚词**：下面 3 句必须**逐字**两边都在
 * （本份由 `no-native-title.test.ts` 断言、壳那份由壳 `--self-test` 断言——两边互证，
 * **改一边不改另一边 ⇒ 当场红**）：
 *   ① 小写 HTML 标签上的 title= 判红
 *   ② 大写组件上的 title= 是组件自己的 prop，不判
 *   ③ 豁免 = // eslint-disable-next-line linkdesk/no-native-title -- 理由（理由必填）
 *
 * ⚠️ 诚实记账：**机制侧不校验理由**（`disable.ts` 是既有全局解析器，不为单腿改语义——与
 * `no-global-key-listener` 那条腿同现状）；壳门禁判我们自己的仓，**理由必填**（标准更高）。两边要写的
 * 仍然是带理由的那一行，⛔ 别把"反正不校验"当成不写理由的许可。
 *
 * ── 存量怎么办（作者侧）──
 * 第三方仓里有存量时这条腿会红——**这是设计的意图**（作者看一次报错就知道正解）；官方四仓在
 * 04「悬停提示系统」件 4 里与壳同批收编。壳侧那 43 处走白名单账（`scripts/native-title-baseline.json`），
 * 本腿**不带账**：插件作者的正确动作是改代码或写豁免注释，不是维护一份会腐烂的账。
 */
import {
  collectFiles,
  isTestOrMockRel,
  readSource,
  stripComments,
  stripLineComments,
  countNewlines,
  relPath,
  type CheckViolation,
} from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

export const NATIVE_TITLE_ID = CHECK_IDS.noNativeTitle;

/** 判级文案——正解 ＋ 豁免出口（与壳门禁同 3 句锚词，见文件头 锚⑪） */
export const NATIVE_TITLE_WHY =
  "原生 title= 由浏览器渲染：深浅主题、字号缩放、位置翻面都不跟宿主走，且与快捷键键帽那套必然分叉。" +
  '正解：`title={x}` → `data-hint={x}`（说明类留默认延时；揭示类——"看全被截断的字"——加 ' +
  '`data-hint-delay="0"`）；要带快捷键就 `data-hint-command="<命令 id>"` 并去掉手写文案；' +
  '复合场景用 `import { HintTip } from "@linkdesk/ui"`。确需原生 title（如提示渲染器够不到的形态）= ' +
  `豁免 = // eslint-disable-next-line ${NATIVE_TITLE_ID} -- 理由（理由必填）。`;

const EXT = [".tsx", ".jsx"];

/** 剥注释（等长替换 ⇒ 行号不漂移；`https://` 的 `//` 不误伤——与其余腿同口径） */
function cleanSource(src: string): string {
  return stripLineComments(stripComments(src));
}

/** JSX 开标签的名字；返回 null 表示这里不是开标签 */
function tagNameAt(s: string, i: number): string | null {
  const m = /^<([A-Za-z_][\w.$]*)/.exec(s.substring(i, i + 64));
  return m ? m[1] : null;
}

/** 从标签名之后找**本标签**的收尾 `>`（跳过字符串/模板字面量、跳过 `{}` 内的任意 `>`） */
function tagEnd(s: string, from: number): number {
  let depth = 0;
  for (let j = from; j < s.length; j++) {
    const ch = s[j];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      j++;
      while (j < s.length && s[j] !== q) {
        if (s[j] === "\\") j++;
        j++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return j;
  }
  return -1;
}

/** `title=` 出现在属性位（前一位不是标识符字符/`-`/`.` ⇒ `data-title=` / `myTitle=` 不算） */
const TITLE_ATTR_RE = /(?<![\w$.-])title\s*=/g;

/** 一段源码里的原生 title 站点（行号 1-based） */
export function findNativeTitleSites(src: string): { line: number; tag: string }[] {
  const cleaned = cleanSource(src);
  const out: { line: number; tag: string }[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const lt = cleaned.indexOf("<", i);
    if (lt === -1) break;
    const tag = tagNameAt(cleaned, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    const end = tagEnd(cleaned, lt + 1 + tag.length);
    if (end === -1) {
      i = lt + 1;
      continue;
    }
    if (/^[a-z]/.test(tag)) {
      // 小写 = DOM 元素（判据 ①）；大写/`_`/`$` 开头 = 组件自己的 prop（判据 ②，不判）
      const tagText = cleaned.slice(lt, end + 1);
      const re = new RegExp(TITLE_ATTR_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(tagText)) !== null) {
        out.push({ line: countNewlines(cleaned.slice(0, lt + m.index)) + 1, tag });
      }
    }
    i = end + 1;
  }
  return out;
}

export interface NativeTitleReport {
  /** 源码里原生 title 站点（豁免的也算在「看见了」里） */
  sites: { file: string; line: number; tag: string }[];
  violations: CheckViolation[];
}

export function runNativeTitleCheck(root: string): NativeTitleReport {
  const report: NativeTitleReport = { sites: [], violations: [] };
  for (const abs of collectFiles(root, EXT)) {
    const rel = relPath(root, abs);
    if (isTestOrMockRel(rel)) continue; // 与其余 check 同口径：测试夹具里的 JSX 不是真界面
    const src = readSource(abs);
    const disabled = buildDisableIndex(src, [NATIVE_TITLE_ID]);
    for (const site of findNativeTitleSites(src)) {
      report.sites.push({ file: rel, line: site.line, tag: site.tag });
      if (isDisabled(disabled, site.line, NATIVE_TITLE_ID)) continue;
      report.violations.push({
        file: rel,
        line: site.line,
        message: `<${site.tag}> 上写了原生 title=（${rel}:${site.line}）。${NATIVE_TITLE_WHY}`,
      });
    }
  }
  report.violations.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
  return report;
}
