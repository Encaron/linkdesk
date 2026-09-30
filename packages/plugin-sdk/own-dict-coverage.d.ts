/**
 * @linkdesk/plugin-sdk/own-dict-coverage 的类型声明（实现 = 同目录 own-dict-coverage.mjs，免构建直发）。
 * 判据出处（用户 2026-09-30 拍板「谁的仓谁译文」）与两条判据的域内外声明见 .mjs 头注——
 * 那里是单一真源，这里不重述。
 */

export interface OwnDictDecl {
  /** 声明出处，如 `contributes.i18n.en` / `contributes.languages[zh]` */
  origin: string;
  /** 语言码（`contributes.languages` 取 id） */
  lang: string;
  /** 相对插件根的路径 */
  rel: string;
}

export interface OwnDictFile extends OwnDictDecl {
  /** 该文件里的 key（key = 原文，与语言无关） */
  keys: string[];
}

export interface OwnDictLoad {
  /** 全部声明字典的 key 并集 */
  keys: Set<string>;
  files: OwnDictFile[];
  /** 读不到 / 解析不动的声明（非空 ⇒ degraded） */
  problems: string[];
  /** 字典不完整 ⇒ 调用方**跳过判红**（否则「全是 gap」是假红） */
  degraded: boolean;
}

/** 一条可渲染 manifest 字段的判据规格 */
export interface RenderableFieldSpec {
  /** 路径步：普通键名 / `"*"` 开放键 / `"[]"` 数组 / `"**"` 沿 children 递归 */
  steps: string[];
  /** 取值字段；`null` ⇒ 落点自己就是那条字符串 */
  field: string | null;
  /** 消费方（渲染点在哪里）——文档与报错里同款 */
  consumer: string;
  /** 值形态是「映射/枚举显示名」——对象与数组两种写法都收 */
  mapValues?: boolean;
}

export interface ManifestString {
  text: string;
  field: string;
  consumer: string;
}

export interface SourceKey {
  key: string;
  /** 出现的源码文件（相对插件根，POSIX 斜杠） */
  at: string[];
}

export interface OwnDictCheckOptions {
  /** 已解析的 `plugin.json`（JSONC 解析由调用方负责，与壳侧读到的必须是同一份清单） */
  manifest?: unknown;
  /** 跳过的目录名集合；缺省 = DEFAULT_SKIP_DIRS */
  skipDirs?: Set<string>;
  /** 源码根（相对插件根）；缺省 `src` */
  srcDir?: string;
}

export interface OwnDictCheckResult {
  dict: OwnDictLoad;
  scanned: { manifestStrings: number; themeStrings: number; sourceKeys: number };
  /** 红：声明在本仓的 manifest 渲染串（含主题数据文件里的名字）没住本仓字典 */
  manifestGap: ManifestString[];
  /** 黄：本仓 `t("中文")` key 没住本仓字典（应用级字典是合法提供方） */
  sourceGap: SourceKey[];
  degraded: boolean;
  problems: string[];
}

/** 本仓**自己声明的**字典文件（`contributes.i18n` ＋ `contributes.languages[].path`）。 */
export declare function collectOwnDictDecls(manifest: unknown): OwnDictDecl[];

/** 读本仓声明的字典 → key 并集 ＋ 每份字典的 key（key = 原文，与语言无关）。 */
export declare function loadOwnDict(absRoot: string, manifest: unknown): OwnDictLoad;

/** manifest 里的**可渲染中文串**（按 text 去重，保留首个落点）。 */
export declare function collectRenderableManifestStrings(manifest: unknown): ManifestString[];

/**
 * **主题数据文件**（`contributes.themes[].path` 指到的 JSON）里的可渲染中文串
 * （`name` / `colorways[].name`）＋ 读不动的问题串。`field` 形如 `themes/x.json.colorways[].name`。
 */
export declare function collectRenderableThemeStrings(
  absRoot: string,
  manifest: unknown,
): { strings: ManifestString[]; problems: string[] };

/** 本仓 `src/**` 里 `t("…")` 的**中文**字面量 key（只收含中文的，非中文原文插件不在此列）。 */
export declare function collectSourceTKeys(absRoot: string, options?: OwnDictCheckOptions): SourceKey[];

/** 判据主体——manifest 缺口（红，含主题数据文件名）＋ 源码 t() 缺口（黄）。 */
export declare function checkOwnDictCoverage(absRoot: string, options?: OwnDictCheckOptions): OwnDictCheckResult;

/** 违规一律以投影类型表示（`text` 在 = manifest 缺口；`key` 在 = 源码缺口） */
export type OwnDictIssue = ManifestString | SourceKey;

/** 违规 → 人类可读一行（两轴打印同款）。 */
export declare function formatOwnDictIssue(issue: OwnDictIssue): string;

/** 违规 → 修法提示（按 manifest / source 给因）。 */
export declare function ownDictHint(issue: OwnDictIssue): string;

/** 参与 `t()` 扫描的源码文件（测试 / mock 不在其列）。 */
export declare function isSourceFile(relPath: string): boolean;

/** 口径一句话——门禁与文档互钉用。 */
export declare const OWN_DICT_CALIBER: string;

export declare const RENDERABLE_MANIFEST_FIELDS: RenderableFieldSpec[];

/** **主题数据文件**里的名字规格（`name` / `colorways[].name`）——与上面那张表同一份判域。 */
export declare const THEME_FILE_NAME_FIELDS: RenderableFieldSpec[];

export declare const DEFAULT_SKIP_DIRS: Set<string>;
