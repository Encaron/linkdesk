/**
 * 串口字节解码原语（T17）——**唯一实现**，住作者面运行时代码。
 *
 * 导入方式：`import { decodeBytes, SERIAL_CODINGS } from "@linkdesk/plugin-sdk/runtime";`
 * ⛔ 不要从包主入口取：主入口 re-export `vite-config.js`（静态 import `vite` / `@vitejs/plugin-react`），
 * 插件源码一旦从主入口取值，整条构建链会被打进插件 zip（见 `src/index.ts` 头注）。
 *
 * 分层纪律（04 §二 / 11a §1.4）：
 *   · **解码原语**（字节 + 编码名 → 文本）＝ 本模块，一处定义；
 *   · **选档策略**（当前选哪档、「自动」的回退顺序）＝ 插件（会话级属性），⛔ 进本模块。
 *     所以本模块**没有** `auto` 档：需要自动的插件自己按 `UTF-8 strict → GB2312 strict` 探测。
 */

/** 规范编码清单——四档，值与串口插件消费者一致（B 的 T17 接入以此为唯一来源）。 */
export const SERIAL_CODINGS = ["UTF-8", "GB2312", "Shift-JIS", "Latin-1"] as const;

/** 编码名（存配置 / 传参都用它，⛔ 各插件另造同义值）。 */
export type SerialCoding = (typeof SERIAL_CODINGS)[number];

export interface DecodeBytesOptions {
  /**
   * true = 非法字节序列抛 `TypeError`（供「自动」档探测用）；
   * 缺省 false = lossy，非法字节替换为 U+FFFD（手动档正常显示不中断）。
   * `Latin-1` 按字节 1:1 映射，不存在非法序列，本选项对它无效果。
   */
  strict?: boolean;
}

/** TextDecoder 标签。GB2312 走 GBK 超集（兼容 2312 流的常见实践）；Latin-1 不走 TextDecoder，见下。 */
const DECODER_LABELS: Record<Exclude<SerialCoding, "Latin-1">, string> = {
  "UTF-8": "utf-8",
  GB2312: "gbk",
  "Shift-JIS": "shift_jis",
};

/**
 * `TextDecoder` 的最小形状。本包 tsconfig 不引 DOM/Node 类型（`lib: ["ES2022"]`、`types: []`），
 * 与 `shell-commands.ts` 取 `window` 的方式一致：经 `globalThis` 声明真正用到的这一面。
 */
interface TextDecoderLike {
  decode(input?: Uint8Array): string;
}
interface TextDecoderCtor {
  new (label?: string, options?: { fatal?: boolean }): TextDecoderLike;
}

/**
 * 解码一段字节。
 *
 * @param data   原始字节（串口契约 `SerialDataPayload.data`）
 * @param coding 四档之一，见 {@link SERIAL_CODINGS}
 * @param options `strict` 见 {@link DecodeBytesOptions}
 * @throws TypeError 编码名非法，或 `strict:true` 且字节序列对所选编码非法
 */
export function decodeBytes(
  data: Uint8Array,
  coding: SerialCoding,
  options: DecodeBytesOptions = {},
): string {
  if (coding === "Latin-1") return decodeLatin1(data);

  const label = DECODER_LABELS[coding as Exclude<SerialCoding, "Latin-1">];
  if (label === undefined) throw new TypeError(`Unknown serial coding: ${String(coding)}`);

  const TextDecoderImpl = (globalThis as { TextDecoder?: TextDecoderCtor }).TextDecoder;
  if (!TextDecoderImpl) throw new TypeError("TextDecoder is not available in this environment");
  return new TextDecoderImpl(label, { fatal: options.strict === true }).decode(data);
}

/**
 * Latin-1：字节 `0x00`–`0xFF` **严格 1:1** 映射到 `U+0000`–`U+00FF`。
 *
 * ⛔ 不用 `new TextDecoder("iso-8859-1")`：按 WHATWG 编码标准那是 **windows-1252**
 * （0x80–0x9F 会变成 €、“、… 等），与「Latin-1」这个名字不是一回事。
 */
function decodeLatin1(data: Uint8Array): string {
  let out = "";
  const CHUNK = 0x2000; // 分块展开，避免超长数组炸调用栈
  for (let i = 0; i < data.length; i += CHUNK) {
    out += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  return out;
}
