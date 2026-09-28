/**
 * `contract-parse.mjs` 的类型声明。
 *
 * 为什么要有这个文件：`scripts/` 不在 `tsconfig.json` 的 `include`（只有 `src`）里，
 * 而 `src/` 下的消费者（`src/core/commands/aiManualIndex.test.ts`，M3 `AI#11` 的生成/门禁）
 * 需要 import 这个共享解析器——`moduleResolution: bundler` 下 `.mjs` 没有声明文件就是 TS2307。
 * ⛔ 本文件只声明形状，**不含任何判定逻辑**（判定只此一份，在 `contract-parse.mjs` 里）；
 * 改那边的 `parseContract()` 返回形状时，同笔改这里。
 */
export const ROOT: string;
export const DTS: string;

export interface ContractNamespace {
  /** 该命名空间所属的域接口（`export interface XxxAPI`） */
  iface: string;
  methods: string[];
  /** 契约里标 `?` 的成员（仅一侧 preload 注入，多为壳侧独有） */
  optionalMethods?: string[];
  /** JSDoc 首行正文 */
  doc: string;
  /** 顶层命名空间整体可选（`name?: {`） */
  optional: boolean;
  /** 函数属性命名空间的签名（无子方法）；块式命名空间为 null */
  signature: string | null;
  /** 类型引用别名（如 `config` = `configuration`）——方法面继承目标命名空间 */
  aliasOf?: string;
}

export function parseContract(): {
  interfaces: string[];
  namespaces: Map<string, ContractNamespace>;
};
