/**
 * SVG 资源**合法性**判据——「SVG 是 XML 文档」这一件事的机械尺。
 *
 * ═══ 为什么必须有它（出处：2026-09-30「市场图标破图」案）═══
 * 2026-09 首次由外部独立 AI 作者用本工程 npm 包（脚手架 ＋ SDK ＋ UI 包）制作一只插件时，
 * 它的图标在插件市场里显示为**破图**，排查结论不是「画得不好看」，而是
 * **整份 SVG 根本不是合法 XML**——浏览器以 `image/svg+xml` 解析 `<img src>` 时用的是
 * **严格 XML 解析器**：注释里出现连续两个连字符、或用 `&nbsp;` 这类 XML 里不存在的实体，
 * 都会在那一行**致命报错**，整份文档被拒绝渲染。表现就是破图，而且**哪个环节都不报错**
 * （文件在、HTTP 200、`plugin.json` 声明正确 ⇒ 三道「存在性」检查全绿）。
 *
 * 那条注释里的话是「不能用 CSS 变量的字面量」——**它自己就是被那个字面量弄坏的**。
 * 这不是某一只插件的笔误，是**判据缺位**：本仓此前的门禁只查「声明的图在不在」，
 * 从不查「图是不是一张能读的图」。本模块补的就是那半张。
 *
 * ═══ 判据（两条，各自都是**精确判定**不是启发式）═══
 *   ① **well-formedness**：整份文档能被严格 XML 解析器读完（`saxes`，与 jsdom 解析 XML
 *      同一实现；本轮实证它能逐条抓出「注释里的连续连字符」「未定义实体」「标签不闭合」
 *      「裸 `<`」四类，且对 147 份合法 SVG 零误报）。
 *   ② **根元素 = `svg`**：`.svg` 文件里装的必须是一张 SVG（拿 HTML 改名成 .svg 是另一类
 *      常见破图）——根元素名不是 `svg` 即报。
 * ⛔ 域外（**本判据不管**，别以为漏了）：XML 语义层面的问题——如 `id` 撞车、
 *   `clipPath`/`viewBox` 算错、颜色不合主题。那些是「图能读但画得不对」，不是破图。
 *
 * ═══ 消费方（两轴同一份实现，⛔ 不许各写一份）═══
 *   · 作者侧：`create-linkdesk-plugin` 模板的 `scripts/ci-verify.mjs` 第 ⑦ 段——插件仓 CI 判红
 *     （经 `@linkdesk/plugin-sdk/svg-wellformed` subpath 引入：插件仓**零新增 devDependency**，
 *      纯数据插件仓也在覆盖内）。
 *   · 壳侧：`scripts/check-svg-wellformed.mjs`（以相对路径 import 本文件，与
 *     `scripts/audit-plugin-tests.mjs` 引 `test-audit.mjs` 同款）——扫模板 / 仓内插件 / 资源。
 *
 * 用法：
 *   import { checkSvgWellformed, xmlWellformedError } from "@linkdesk/plugin-sdk/svg-wellformed";
 *   const r = checkSvgWellformed(process.cwd());   // ⇒ { scanned, violations: [...] }
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { SaxesParser } from "saxes";

/** 口径一句话——门禁与文档互钉用（改判据就改这句，两处锚词比对会跟着红） */
export const SVG_CALIBER =
  "SVG 是 XML 文档：整份必须能被严格 XML 解析器读完且根元素为 svg；否则浏览器按 image/svg+xml 解析失败 ⇒ 静默破图。";

/** 默认跳过的目录名——构建产物 / 依赖 / 编辑器临时目录（它们不是「作者写的资源」） */
export const DEFAULT_SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-electron",
  ".git",
  ".vite",
  "coverage",
  "__tests__",
  "build",
]);

/**
 * 默认豁免的文件名形态——**测试夹具常故意放非法样本**（拿坏图验自己的错误分支），
 * 那是合法的。豁免靠**文件名自我声明**（`.fixture.svg` / `.mock.svg`），不靠目录猜测：
 * 与壳仓 `check-empty-dirs` / os.tmpdir 夹具、ci-verify `isSourceFile` 的既有词汇一致。
 */
export const DEFAULT_EXEMPT_RE = /\.(fixture|mock)\.svg$/i;

/**
 * 单份 XML 源 → **第一处** well-formedness 错误（合法 ⇒ `null`）。纯函数，不读盘。
 *
 * 只报第一处：XML 的第一处致命错会让后续解析失去意义（错误会串成一片），逐份报一个
 * 足够定位，也避免同一根因刷出十几行噪音。
 */
export function xmlWellformedError(source) {
  if (typeof source !== "string") return null;
  const parser = new SaxesParser({ fragment: false });
  /** 错误回调是**同步**触发的：抓住第一处就够，后面的必然是它的余波 */
  let first = null;
  parser.on("error", (e) => {
    if (!first) first = e;
  });
  try {
    parser.write(source).close();
  } catch (e) {
    if (!first) first = e;
  }
  if (!first) return null;
  // ⚠️ saxes 把位置**编进 message 前缀**（`"4:26: malformed comment."`），不是独立字段——
  //    本仓实测 `first.line`/`first.column` 恒 undefined。故从消息里摘，摘不到就留 null
  //    （⛔ 不编造位置：宁可只报「这份文件坏了」，也不报一个会把人带偏的行号）。
  const raw = String(first.message ?? first).trim();
  const m = /^(\d+):(\d+):\s*([\s\S]*)$/.exec(raw);
  return {
    line: m ? Number(m[1]) : null,
    column: m ? Number(m[2]) : null,
    message: m ? m[3].trim() : raw,
  };
}

/** 读一份盘的 `.svg` → 违规对象（合规 ⇒ `null`）。文件读不动（权限/竞态）同样返回 `null`：不阻断门禁。 */
function checkOneFile(absPath, fileRel) {
  let source;
  try {
    source = readFileSync(absPath, "utf8");
  } catch {
    return null; // 读不动不是本判据的事（存在性由别的门禁管）
  }
  const err = xmlWellformedError(source);
  if (err) {
    return { file: fileRel, line: err.line, column: err.column, message: err.message, kind: "xml" };
  }
  return null;
}

/** 根元素名（只看第一个开标签；判据本身已保证解析成功过） */
function rootElementName(source) {
  const m = /<([A-Za-z_][\w.:-]*)/.exec(source.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, ""));
  return m ? m[1] : null;
}

/**
 * 走查一棵树，收集其中的 `.svg`（工程相对、正斜杠、字典序）。
 * `absRoot` 不存在 / 不可读 ⇒ 空数组（约定根缺失不是本判据的事）。
 */
export function listSvgFiles(absRoot, options = {}) {
  const skipDirs = options.skipDirs ?? DEFAULT_SKIP_DIRS;
  const isExempt = options.isExempt ?? ((rel) => DEFAULT_EXEMPT_RE.test(rel));
  const out = [];
  const walk = (absDir, relDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (skipDirs.has(e.name) || e.name.startsWith(".")) continue;
        walk(join(absDir, e.name), rel);
        continue;
      }
      if (!e.isFile()) continue;
      if (!/\.svg$/i.test(e.name)) continue;
      if (isExempt(rel)) continue;
      out.push(rel);
    }
  };
  walk(absRoot, "");
  return out.sort();
}

/**
 * 巡检一棵树里所有 `.svg` —— 返回 `{ scanned, violations }`。
 *
 * `violations[i]` 形状：`{ file, line, column, message, kind }`（`file` = 相对 `absRoot` 的正斜杠路径）。
 * 两个 `kind`：`"xml"`（不是合法 XML）/ `"root"`（根元素不是 svg）。
 */
export function checkSvgWellformed(absRoot, options = {}) {
  const files = listSvgFiles(absRoot, options);
  const violations = [];
  for (const fileRel of files) {
    const abs = join(absRoot, fileRel.split("/").join(sep));
    const bad = checkOneFile(abs, fileRel);
    if (bad) {
      violations.push(bad);
      continue;
    }
    let source = "";
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const root = rootElementName(source);
    if (root !== "svg") {
      violations.push({
        file: fileRel,
        line: 1,
        column: 1,
        message: `根元素是 <${root ?? "?"}>，不是 <svg>——.svg 文件里装的必须是一张 SVG`,
        kind: "root",
      });
    }
  }
  return { scanned: files.length, violations };
}

/**
 * 违规 → 人类可读一行。两轴（作者侧 CI / 壳侧门禁）打印同款，免得同一条错两种说法。
 */
export function formatSvgViolation(v) {
  const where = v.line == null ? v.file : `${v.file}:${v.line}${v.column == null ? "" : `:${v.column}`}`;
  return `${where}  ${v.message}`;
}

/**
 * 违规 → 修法提示（**按 kind 给因**：破图这个病的两种成因，修法完全不同）。
 * 供两轴打印用；⛔ 别在调用处另写一份文案。
 */
export function svgViolationHint(v) {
  if (v.kind === "root") {
    return "拿 HTML/别的 XML 改名成 .svg 了？重画成 <svg xmlns=\"http://www.w3.org/2000/svg\"> 根元素。";
  }
  if (/malformed comment/i.test(v.message)) {
    return 'XML 注释里禁止出现**连续两个连字符**——最常见是「不能用 CSS 变量的字面量」这句话被原样写进了注释；改成写「CSS 变量」即可。';
  }
  if (/undefined entity/i.test(v.message)) {
    return "XML 只有 amp/lt/gt/quot/apos 五个预定义实体——`&nbsp;` 这类要写成数字引用（如 `&#160;`）。";
  }
  return "用严格 XML 解析器定位那一行后修掉；改完再跑一次本判据（它是唯一的验收）。";
}
