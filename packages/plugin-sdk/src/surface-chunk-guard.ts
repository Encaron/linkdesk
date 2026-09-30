/**
 * 跨表面共享 chunk 的两条机械判据（E6#159）——多表面构建的产物自检。
 *
 * 为什么判据必须落在构建里：「一个插件 = N 个表面」被 `vite-config` 打成**单次多入口 build**，
 * 靠 rollup 的模块图去重让「模块级 = 跨表面唯一真相」重新成立。这条性质是**构建器的内部行为**——
 * 一旦退化（换回逐表面独立 build、或被 output 配置带偏）不会红，只会静默回到 marketplace 1.1.4
 * 那种「每个表面各长一份 store、侧栏翻了主区不翻」的事故形态。所以每次出包都得量。
 *
 * 判据一（G1）**入口齐备**：每个表面声明的产物路径必须真被产出——壳 loader 按 dist manifest 里的
 *   `views/<Key>.bundle.js` dynamic-import，路径对不上 = 装上才 404（SDK 与壳 loader 的路径契约）。
 * 判据二（G2）**共享模块唯一**：同一源模块不得出现在 ≥2 个**入口** chunk 里——两份 = 两个实例。
 *
 * 两个刻意划的边界：只认 `isEntry` chunk（worker 产物是 asset，且 worker 是独立 realm，本就该各持一份）；
 * 只认**同一次构建内**的重复（跨构建的重复正是 G2 要防的退化形态，不该由本模块兜底）。
 * 纯函数、不 import vite——`pack.test.ts` 记过：vite 依赖链会拖坏 workspaces 嵌套安装下的测试图。
 */

/** 参与判据的输出 chunk——rollup `OutputChunk` 的最小子集 */
export interface EmittedChunk {
  fileName: string;
  isEntry: boolean;
  moduleIds: string[];
}

export interface DuplicateModule {
  moduleId: string;
  /** 内联了该模块的入口 chunk（≥2 个） */
  fileNames: string[];
}

/** G2：同一源模块被内联进多个入口 chunk——多表面共享状态塌缩的机械指纹 */
export function findDuplicatedEntryModules(chunks: EmittedChunk[]): DuplicateModule[] {
  const owners = new Map<string, string[]>();
  for (const c of chunks) {
    if (!c.isEntry) continue;
    for (const id of c.moduleIds) {
      const list = owners.get(id);
      if (list) list.push(c.fileName);
      else owners.set(id, [c.fileName]);
    }
  }
  return [...owners.entries()]
    .filter(([, fileNames]) => fileNames.length > 1)
    .map(([moduleId, fileNames]) => ({ moduleId, fileNames }));
}

/** G1：应产出却缺席的入口（返回缺席的 finalName；空数组 = 齐备） */
export function missingEntries(expected: string[], chunks: EmittedChunk[]): string[] {
  const emitted = new Set(chunks.filter((c) => c.isEntry).map((c) => c.fileName));
  return expected.filter((f) => !emitted.has(f));
}
