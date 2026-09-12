/**
 * 文本条目行尾归一——**判据只此一处**（2026-09-12 修，同族第 5 次）。
 *
 * 为什么要有这个文件：同一条规则被**两个脚本各用一次**——
 *   - `scripts/pack-bundled-plugins.mjs`：打包时归一，让**产物**与「打包时工作区的行尾」解耦；
 *   - `scripts/check-bundled-version-bump.mjs`：比指纹前归一，让**基线比对**不被行尾污染。
 * 两处各写一份必然漂移（改一处忘一处 ⇒ 一边归一一边不归一 ⇒ 假红假绿都出现），故抽到这里。
 *
 * 判据照抄 git 的 `text=auto`（不另立一套分类）：**前 8000 字节含 NUL ⇒ 二进制，原样**；
 * 其余按 UTF-8 **严格**解码（解不开也当二进制）；文本一律 `\r\n → \n`——与 `.gitattributes`
 * 的 `eol=lf` 同规。没有 `\r\n` 就逐字节原样（连 BOM 决策也不动），调用方可用 `normalized`
 * 分辨「这次到底动没动」。
 *
 * 🔴 为什么必须是这条规则（本机实测的病根，不是推测）：`core.autocrlf=true` + `.gitattributes`
 * `text=auto eol=lf` ⇒ **索引里是 LF，工作区却是 CRLF**（`git ls-files --eol` 实测 `i/lf w/crlf`——
 * `.gitattributes` 管不住**已检出**的存量文件）。于是同一份源码在一台机器上重打一次，zip 的内
 * 容指纹就变了 ⇒ 版本门禁判「改内容没 bump」**满屏红**（而源码一个字没改）。而 `bundled-plugins/`
 * 里那些**基线 zip 本身就是混合行尾打出来的**（实测：`plugin.json` 是 CRLF、`README.md` 是 LF）
 * ⇒ 只修打包脚本会让红数**从 10 变 11**（LF 那半边被对齐了，CRLF 那半边反而对不齐）。两侧都要归一。
 */
export function normalizeEol(buf) {
  if (buf.subarray(0, 8000).includes(0)) return { buf, normalized: false };
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return { buf, normalized: false }; // 不是合法 UTF-8 —— 当二进制，一个字节都不碰
  }
  if (!text.includes("\r\n")) return { buf, normalized: false }; // 已是 LF，逐字节原样
  return { buf: Buffer.from(text.replace(/\r\n/g, "\n"), "utf8"), normalized: true };
}
