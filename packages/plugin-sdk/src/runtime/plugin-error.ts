/**
 * 插件业务错误构造器（T14 / T19）——作者面**唯一的错误信封构造**。
 *
 * 导入方式：`import { pluginError } from "@linkdesk/plugin-sdk/runtime";`
 * 用法：`throw pluginError({ code: "ENO_SESSION", message: "串口会话不存在", hint: "先 openPort" });`
 *
 * 纪律（04 §四 / 11a §1.2）：
 *   · 插件业务错误⛔ `throw new Error("中文")`——门外只能从中文猜；
 *   · `code` 给 AI 判、`message` 给人读，两者分离；壳 / CLI / MCP **原样透传** code；
 *   · 裸 Error 或非本形状 ⇒ 壳侧兜底 `EUNKNOWN`（⛔ 猜语义归类）；
 *   · 壳保留码（`EVIEWREQUIRED` / `ENOTACTIVE` / `EUNKNOWNCOMMAND` / `EOPEXPIRED` /
 *     `EPOLICYDENIED` / `EPROTECTED` / `EUSERDENIED` / `ESHELLTIMEOUT` / `EUNKNOWN`）由壳产生，
 *     插件⛔ 自造（门禁侧由 SDK ESLint 规则拦，运行时不做码表判断——避免与壳的第二份名单）。
 */

export interface PluginErrorInit {
  /** 机读码（必填、非空；`E` 开头是建议，不强制） */
  code: string;
  /** 给人读的一句（允许中文）；⛔ 拿它当码用 */
  message: string;
  /** 给 AI 的下一步（可省） */
  hint?: string;
  /** 结构化上下文（可省，键名用英文） */
  details?: unknown;
}

/**
 * 结构化插件错误。跨 realm 判别请用 `isPluginError`（⛔ `instanceof`——
 * 插件运行在池 renderer、壳在另一个 realm，构造函数身份不共享）。
 */
export interface LinkDeskPluginError extends Error {
  readonly name: "LinkDeskPluginError";
  readonly code: string;
  readonly hint?: string;
  readonly details?: unknown;
  readonly isPluginError: true;
}

class PluginErrorImpl extends Error implements LinkDeskPluginError {
  readonly name = "LinkDeskPluginError" as const;
  readonly isPluginError = true as const;
  readonly code: string;
  readonly hint?: string;
  readonly details?: unknown;

  constructor(init: PluginErrorInit) {
    super(init.message);
    this.code = init.code;
    this.hint = init.hint;
    this.details = init.details;
  }
}

/**
 * 构造一条结构化插件错误（配合 `throw` 使用）。
 *
 * @throws TypeError 入参不是对象、`code` 为空、或 `message` 为空——
 *   这些是作者写错，不是业务错误，应当当场失败而不是伪装成业务回执。
 */
export function pluginError(init: PluginErrorInit): LinkDeskPluginError {
  if (init === null || typeof init !== "object") {
    throw new TypeError("pluginError: init object is required");
  }
  if (typeof init.code !== "string" || init.code.trim() === "") {
    throw new TypeError("pluginError: code must be a non-empty string");
  }
  if (typeof init.message !== "string" || init.message.length === 0) {
    throw new TypeError("pluginError: message must be a non-empty string");
  }
  return new PluginErrorImpl(init);
}
