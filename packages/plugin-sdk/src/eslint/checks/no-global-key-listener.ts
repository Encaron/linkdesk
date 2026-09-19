/**
 * check 腿——**window/document 全局键盘监听判红**（E6#137 · 2026-09-20）。
 *
 * ── 这条禁令为什么现在才有腿 ──
 * 作者面 [05-ui-conventions §4.2](../../../../../docs/03-plugin-authoring/05-ui-conventions.md) 早已
 * 定案键盘两轨制：声明式 keybindings（非文本键）＋ **focus 分区**（容器 `onKeyDown` + `tabIndex`，
 * DOM focus 天然分区）⇒ `window`/`document` 级 keydown/keyup 是点名的反模式（历史案：serial F2
 * 劫持 file tree F2）。但规约只是文档——SDK 没有任何腿拦它 = **空转判据**。生态首个第三方 AI 作者
 * 实测即写了 `window.addEventListener("keydown")`；核对会话随即摸底 18 仓，**官方仓自己命中 3 处**
 * （serial-monitor SearchBar 两处、settings 快捷键录制器一处）——这条腿不是对第三方作者的苛求，
 * 是工程自己的欠账。
 *
 * ── 判定式（窄口子，不猜写法）──
 * 扫插件工程源文件（.ts/.tsx/.js/.jsx）里 `(window|document).addEventListener(<"keydown"|"keyup"
 * 字面量">, …)` **本身**即违规——第三个参数（capture）带不带都一样红（全局抓键的形态问题与
 * capture 无关）；单双引号都认。键名走**变量**的形态（`addEventListener(EVENT, …)`）静态读不出
 * ⇒ 不判（判据写死字面量；假红比漏报更坏的姊妹口径：窄射程宁可漏，不猜）。注释里的提及不算
 * （stripComments / stripLineComments 同其余 check）。
 *
 * ── 报文教正解（插件自由制造——不是只堵）──
 * focus 分区正解 = 容器 `onKeyDown` + `tabIndex={0}`（DOM focus 天然分区，见作者面
 * 05-ui-conventions §4.2）；确需全局抓键的**正当形态**（如快捷键录制器要在输入被吞前抓原始键）走
 * 标准 disable 注释 ＋ 行尾理由——**判据本身无白名单**（settings 录制器的裁决走豁免注释，不进本腿）。
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

export const GLOBAL_KEY_LISTENER_ID = CHECK_IDS.noGlobalKeyListener;

/** 判级文案——正解 ＋ 豁免出口（报错即文档） */
export const GLOBAL_KEY_LISTENER_WHY =
  "全局 keydown/keyup 会劫持整个窗口的按键（历史案：serial 插件抢 F2 连文件树一起失效）。" +
  "focus 分区正解 = 在你的容器上写 `onKeyDown` ＋ `tabIndex={0}`（DOM focus 天然分区，聚焦谁谁收到；" +
  "见作者面 05-ui-conventions §4.2）。确需全局抓键的正当形态（如快捷键录制器）= " +
  `// eslint-disable-next-line ${GLOBAL_KEY_LISTENER_ID} -- 理由。`;

const EXT = [".ts", ".tsx", ".js", ".jsx"];

/** 违规物 = window/document + addEventListener + 键名**字面量**（keydown/keyup；capture 参数无关） */
const GLOBAL_KEY_RE = /\b(window|document)\s*\.\s*addEventListener\s*\(\s*(['"])(keydown|keyup)\2/g;

export interface GlobalKeyListenerReport {
  /** 源码里全局键盘监听站点（豁免的也算在「看见了」里） */
  sites: { file: string; line: number; target: string; event: string }[];
  violations: CheckViolation[];
}

export function runGlobalKeyListenerCheck(root: string): GlobalKeyListenerReport {
  const report: GlobalKeyListenerReport = { sites: [], violations: [] };
  for (const abs of collectFiles(root, EXT)) {
    const rel = relPath(root, abs);
    if (isTestOrMockRel(rel)) continue; // 与其余 check 同口径：测试夹具里的字符串不是真监听
    const src = readSource(abs);
    const cleaned = stripLineComments(stripComments(src));
    const disabled = buildDisableIndex(src, [GLOBAL_KEY_LISTENER_ID]);
    const re = new RegExp(GLOBAL_KEY_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      const line = countNewlines(cleaned.slice(0, m.index)) + 1;
      report.sites.push({ file: rel, line, target: m[1], event: m[3] });
      if (isDisabled(disabled, line, GLOBAL_KEY_LISTENER_ID)) continue;
      report.violations.push({
        file: rel,
        line,
        message:
          `在 ${m[1]} 上全局监听 \`${m[3]}\`（${rel}:${line}）——这是壳点名的反模式。${GLOBAL_KEY_LISTENER_WHY}`,
      });
    }
  }
  report.violations.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
  return report;
}
