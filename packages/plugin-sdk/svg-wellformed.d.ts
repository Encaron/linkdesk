/**
 * @linkdesk/plugin-sdk/svg-wellformed 的类型声明（实现 = 同目录 svg-wellformed.mjs，免构建直发）。
 * 判据出处与两条判据的域内外声明见 .mjs 头注——那里是单一真源，这里不重述。
 */

export interface SvgViolation {
  /** 相对 `absRoot` 的 POSIX 斜杠路径 */
  file: string;
  /** 1-based；取不到位置时为 null（⛔ 不编造行号） */
  line: number | null;
  column: number | null;
  message: string;
  /** xml = 不是合法 XML；root = 根元素不是 svg */
  kind: "xml" | "root";
}

export interface SvgCheckOptions {
  /** 跳过的目录名集合（半角精确匹配）；缺省 = DEFAULT_SKIP_DIRS */
  skipDirs?: Set<string>;
  /** 文件级豁免（给相对路径，返回 true 即跳过）；缺省 = DEFAULT_EXEMPT_RE（`*.fixture.svg` / `*.mock.svg`） */
  isExempt?: (relPath: string) => boolean;
}

export interface SvgCheckResult {
  /** 实际扫描的 .svg 份数 */
  scanned: number;
  violations: SvgViolation[];
}

/** 单份 XML 源 → 第一处 well-formedness 错误（合法 ⇒ null）。纯函数，不读盘。 */
export declare function xmlWellformedError(
  source: string,
): { line: number | null; column: number | null; message: string } | null;

/** 走查一棵树，返回其中的 `.svg`（相对 `absRoot`、POSIX 斜杠、字典序）。 */
export declare function listSvgFiles(absRoot: string, options?: SvgCheckOptions): string[];

/** 巡检一棵树里所有 `.svg`（两条判据：well-formedness ＋ 根元素 = svg）。 */
export declare function checkSvgWellformed(absRoot: string, options?: SvgCheckOptions): SvgCheckResult;

/** 违规 → 人类可读一行（两轴打印同款，免得同一条错两种说法）。 */
export declare function formatSvgViolation(v: SvgViolation): string;

/** 违规 → 修法提示（按 kind 给因）。 */
export declare function svgViolationHint(v: SvgViolation): string;

/** 口径一句话——门禁与文档互钉用。 */
export declare const SVG_CALIBER: string;

export declare const DEFAULT_SKIP_DIRS: Set<string>;
export declare const DEFAULT_EXEMPT_RE: RegExp;
