/**
 * check 腿 · **错误信封**（T14 · `check-error-envelope`）——预期业务错误 **`return pluginError(...)`**。
 *
 * ── 判据（一个实现，两个 id ＋ 一条 throw-pluginError 提示）──
 *   ① 🟡 **裸 `throw new Error(...)` / `throw pluginError(...)`**（`linkdesk/no-bare-error-throw`）：
 *      预期业务错误必须 **`return pluginError(...)`**。跨 contextBridge 的**抛出**只保留 message，
 *      `code` / `hint` / `details` 会丢 ⇒ 门外只剩 `EUNKNOWN`；返回值走结构化克隆、属性完整。
 *      → **advisory（提示不拦）**：真正的编程意外仍可抛（那类 EUNKNOWN 合理）。
 *   ② 🔴 **自造壳保留码**（`linkdesk/no-reserved-shell-error-code`）：`pluginError({ code: "EVIEWREQUIRED" })`
 *      这类壳码由壳产生，插件自造会让 AI 分不清「壳拦的」还是「插件报的」。→ 违规（进腿）。
 *
 * ── 保留码的来源（⛔ 不在 SDK 另存字面量表）──
 * `options.reservedCodes` 由调用方注入；唯一来源 = `@linkdesk/contracts` 的 `SHELL_ERROR_CODES`
 * （B 增 / A 确认）。该常量尚未落地时调用方传空数组，报告里如实标「判据空转」（`reservedCodesAvailable:false`）。
 *
 * ── 射程（窄口子，不猜写法）──
 * 扫 `.ts/.tsx/.js/.jsx`（跳过测试/mock，与其余腿同口径）；注释里的提及不算。
 * 裸 throw 只认 `throw new Error(`（`TypeError` 等内置具体错误不判——那是编程错误而不是业务回执）；
 * 保留码只读 `pluginError({ code: "<字面量>" })`，变量/拼接读不出 ⇒ 不判（假红比漏报更坏）。
 */
import {
  collectFiles,
  countNewlines,
  isTestOrMockRel,
  readSource,
  relPath,
  stripComments,
  stripLineComments,
  type CheckViolation,
} from "./scan.js";
import { buildDisableIndex, CHECK_IDS, isDisabled } from "./disable.js";

export const ERROR_ENVELOPE_ID = CHECK_IDS.errorEnvelope;
export const RESERVED_SHELL_CODE_ID = CHECK_IDS.reservedShellErrorCode;

/** 报文教正解（报错即文档） */
export const ERROR_ENVELOPE_WHY =
  "预期业务错误请 **`return pluginError({ code, message, hint?, details? })`**（从 `@linkdesk/plugin-sdk/runtime` 导入）：" +
  "`code` 给 AI 判、`message` 给人读。⚠️ 跨 contextBridge 的 **throw** 只保留 message（code/hint 会丢 ⇒ `EUNKNOWN`）；" +
  "`throw` 仅用于真正的意外。";
export const RESERVED_SHELL_CODE_WHY =
  "壳保留码（视图可达性 / 权限 / 异步句柄那几类）由**壳**产生，插件自造会让 AI 分不清是谁拦的。" +
  "改用你自己的业务码（`E` 开头是建议，不强制）；确需知情绕行走标准 disable 注释 ＋ 理由。";

const EXT = [".ts", ".tsx", ".js", ".jsx"];

/** 裸 `throw new Error(`（不匹配 TypeError 等具体内置错误） */
const BARE_THROW_RE = /\bthrow\s+new\s+Error\s*\(/g;
/** `throw pluginError(`——预期错误被抛，跨桥会丢属性 */
const THROW_PLUGIN_ERROR_RE = /\bthrow\s+pluginError\s*\(/g;
/** `pluginError({ ... })` 调用点（保留码判据的扫描入口） */
const PLUGIN_ERROR_CALL_RE = /\bpluginError\s*\(\s*\{/g;
/** 在调用点附近读 `code: "<字面量>"` */
const CODE_LITERAL_RE = /\bcode\s*:\s*(['"])([^'"]+)\1/;

export interface ErrorEnvelopeOptions {
  /** 壳保留错误码（唯一来源 = contracts 的 SHELL_ERROR_CODES；缺省 = 判据空转） */
  reservedCodes?: readonly string[];
  /** 保留码来源说明（进报告；缺省按「空」处理） */
  reservedCodesSource?: string;
}

export interface ErrorEnvelopeReport {
  /** 看见的裸 throw 站点数（含被豁免的） */
  bareThrows: number;
  /** 看见的 `throw pluginError(...)` 站点数（含被豁免的） */
  thrownPluginErrors: number;
  /** 🟡 裸 throw 提示（不进腿报点，不拦 CI） */
  advisories: CheckViolation[];
  /** 🔴 自造壳保留码（进腿报点） */
  violations: CheckViolation[];
  /** 保留码判据是否真正生效（false ⇒ 报告里必须说明空转） */
  reservedCodesAvailable: boolean;
  reservedCodesSource: string;
}

export function runErrorEnvelopeCheck(root: string, options: ErrorEnvelopeOptions = {}): ErrorEnvelopeReport {
  const reserved = new Set(options.reservedCodes ?? []);
  const report: ErrorEnvelopeReport = {
    bareThrows: 0,
    thrownPluginErrors: 0,
    advisories: [],
    violations: [],
    reservedCodesAvailable: reserved.size > 0,
    reservedCodesSource: options.reservedCodesSource ?? (reserved.size > 0 ? "caller" : "absent"),
  };

  for (const abs of collectFiles(root, EXT)) {
    const rel = relPath(root, abs);
    if (isTestOrMockRel(rel)) continue;
    const src = readSource(abs);
    const cleaned = stripLineComments(stripComments(src));
    const disabled = buildDisableIndex(src, [ERROR_ENVELOPE_ID, RESERVED_SHELL_CODE_ID]);

    // ① 裸 throw new Error（advisory）
    const throwRe = new RegExp(BARE_THROW_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = throwRe.exec(cleaned)) !== null) {
      const line = countNewlines(cleaned.slice(0, m.index)) + 1;
      report.bareThrows++;
      if (isDisabled(disabled, line, ERROR_ENVELOPE_ID)) continue;
      report.advisories.push({
        file: rel,
        line,
        message: `裸 \`throw new Error(...)\`（${rel}:${line}）——${ERROR_ENVELOPE_WHY}`,
      });
    }

    // ①b throw pluginError(...)——预期错误被抛，跨桥丢属性（advisory）
    const throwPeRe = new RegExp(THROW_PLUGIN_ERROR_RE.source, "g");
    while ((m = throwPeRe.exec(cleaned)) !== null) {
      const line = countNewlines(cleaned.slice(0, m.index)) + 1;
      report.thrownPluginErrors++;
      if (isDisabled(disabled, line, ERROR_ENVELOPE_ID)) continue;
      report.advisories.push({
        file: rel,
        line,
        message: `「throw pluginError(...)」（${rel}:${line}）——预期业务错误请 \`return pluginError(...)\`：抛出跨 contextBridge 只保留 message，\`code/hint/details\` 会丢 ⇒ 门外只剩 EUNKNOWN。`,
      });
    }

    // ② 自造壳保留码（红）——只在拿到保留码清单时判
    if (reserved.size > 0) {
      const callRe = new RegExp(PLUGIN_ERROR_CALL_RE.source, "g");
      while ((m = callRe.exec(cleaned)) !== null) {
        const tail = cleaned.slice(m.index, m.index + 400);
        const codeMatch = CODE_LITERAL_RE.exec(tail);
        if (!codeMatch) continue;
        const code = codeMatch[2];
        if (!reserved.has(code)) continue;
        const line = countNewlines(cleaned.slice(0, m.index + codeMatch.index)) + 1;
        if (isDisabled(disabled, line, RESERVED_SHELL_CODE_ID)) continue;
        report.violations.push({
          file: rel,
          line,
          message: `pluginError 使用了壳保留码 \`${code}\`（${rel}:${line}）——${RESERVED_SHELL_CODE_WHY}`,
        });
      }
    }
  }

  report.advisories.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
  report.violations.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
  return report;
}
