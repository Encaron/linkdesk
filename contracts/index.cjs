"use strict";
/**
 * 壳保留错误码——**唯一来源**（C 的 `check-error-envelope` 经 `createRequire` 同步读）。
 *
 * 9 个码由 A 确认（壳侧产生/透传，插件不得自造变体）；值改动只在这里改，
 * ⛔ 在 SDK / CLI / 插件收一份字面量表（那是第二份真相）。
 *
 * CJS（`.cjs`）：SDK 的 `runPluginLint` 是同步 API，用 `createRequire` 读本文件；
 * 包 `type:module` + `main:"./index.cjs"` 让 `require("@linkdesk/contracts")` 命中这里。
 */
const SHELL_ERROR_CODES = Object.freeze([
  "EVIEWREQUIRED",
  "ENOTACTIVE",
  "EUNKNOWNCOMMAND",
  "EOPEXPIRED",
  "EPOLICYDENIED",
  "EPROTECTED",
  "EUSERDENIED",
  "ESHELLTIMEOUT",
  "EUNKNOWN",
]);

module.exports = { SHELL_ERROR_CODES };
