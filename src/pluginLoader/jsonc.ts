/**
 * E6#55 plugin.json JSONC 化——作者声明文件的统一解析 helper。
 *
 * 背景：复杂插件 plugin.json 会到上千行（对标 VS Code git 扩展 package.json 1200+ 行），
 * 纯 JSON 不能写注释/尾逗号 = 千行声明不可导航。作者 plugin.json 可写注释/尾逗号
 * （对标 VS Code = JSONC），本模块 = 全仓读「作者 plugin.json」的唯一解析入口
 * （渲染进程 5 处 + 主进程发现/预载 #55c），各消费方不再各自 JSON.parse。
 * 解析形态对齐 plugin-sdk validate.ts readPluginManifest（同一 jsonc-parser 选项 +
 * offset→行:列 报错风格——SDK 头注自指"对齐壳 E6#55"，双端一源不漂移）。
 *
 * 🔥 范围纪律（#55 拍板）：只换「作者写的 plugin.json」解析；壳自写的运行时数据文件
 * （settings.json / workspace.json / 布局 / profile / 快捷键绑定）**继续严格 JSON**——
 * 机器数据不容忍脏数据，各走原 JSON.parse 不动。
 *
 * 选项 allowTrailingComma + disallowComments:false = JSONC ⊃ 严格 JSON——现有纯 JSON 插件
 * 逐字节一致，换解析器零回归（#55d 由既有 loader/lifecycle 测试全绿证明）。
 */

import { parse, printParseErrorCode } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";
import type { PluginManifest } from "../core/api/types";

/**
 * 解析 plugin.json 原始文本为 manifest（JSONC——允许注释 + 尾逗号）。
 * 语法错误抛含 行:列 的清晰错误（作者易定位，对齐 SDK ESLint 风格）；与 JSON.parse 同抛错语义——
 * 调用方既有 try/catch 不用改。
 */
export function parseManifestJson(raw: string): PluginManifest {
  const parseErrors: ParseError[] = [];
  const value = parse(raw, parseErrors, {
    allowTrailingComma: true, // 尾逗号容忍
    disallowComments: false, // 注释容忍（默认即 false，显式声明自文档）
    allowEmptyContent: false, // 空文本 = 错误（对齐 JSON.parse("") 抛错）
  });
  if (parseErrors.length > 0) {
    const { line, col } = offsetToLineCol(raw, parseErrors[0].offset);
    throw new Error(
      `JSONC 语法错误：第 ${line} 行第 ${col} 列（${printParseErrorCode(parseErrors[0].error)}）`
    );
  }
  return value as PluginManifest;
}

/** jsonc 语法错 offset → {line,col}（1 起）。CRLF 的 \r 算一列（对齐 SDK offsetToLineCol——可读性足够，不做精确归一） */
function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}
