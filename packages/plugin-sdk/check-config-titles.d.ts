/**
 * @linkdesk/plugin-sdk/check-config-titles 的类型声明（实现 = 同目录 check-config-titles.mjs，免构建直发）。
 * 三族判据与 severity 归属见 .mjs 头注——那里是单一真源，这里不重述。
 */

export interface TitleGapBase {
  /** 配置键（contributes.configuration.properties 的键） */
  key: string;
  /** 声明的节名（group，未声明 = 空串） */
  group: string;
}

export interface NoTitleGap extends TitleGapBase {}

export interface MissingEnGap extends TitleGapBase {
  /** 声明的 title 原文（中文原文 = i18n key） */
  title: string;
}

export interface MissingEnumDescriptionsGap extends TitleGapBase {
  /** enum 档位数 */
  enumCount: number;
}

export interface ConfigTitleGaps {
  scanned: { properties: number; enums: number };
  /** ① 无 title */
  noTitle: NoTitleGap[];
  /** ② title 缺本仓字典译名（dictKeys 未传 = 空数组——⑧ 段 own-dict 红管辖同域） */
  missingEn: MissingEnGap[];
  /** ③ 有 enum 缺 enumDescriptions */
  missingEnumDescriptions: MissingEnumDescriptionsGap[];
  /** 是否存在非空 contributes.configuration.properties（false = 无判据对象） */
  hasConfiguration: boolean;
}

/**
 * 三族缺口收集——**纯函数**（不读盘）。dictKeys = 本仓自有字典 key 集（⑧ 段 cov.dict.keys）；
 * 不传 = 跳过 ② 族（无字典可对，缺译归 ⑧ 红）。
 */
export declare function collectConfigTitleGaps(
  manifest: unknown,
  options?: { dictKeys?: Set<string> },
): ConfigTitleGaps;

/** 黄单一行——三族同款格式（两轴打印同款，免得同一条错两种说法）。 */
export declare function formatTitleGap(
  family: "noTitle" | "missingEn" | "missingEnumDescriptions",
  gap: TitleGapBase & Partial<MissingEnGap & MissingEnumDescriptionsGap>,
): string;

/** 修法指路——按族给因。 */
export declare function titleGapHint(
  family: "noTitle" | "missingEn" | "missingEnumDescriptions",
): string;

/** 口径一句话——门禁与文档互钉用。 */
export declare const CONFIG_TITLES_CALIBER: string;
