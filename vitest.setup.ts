// 测试地基的唯一真源 = packages/plugin-sdk/src/vitest-setup.ts（`window.linkdesk` 六命名空间最小 mock）。
// 本文件**只是一行指针**：壳没有也不该有 `@linkdesk/plugin-sdk` 依赖 ⇒ 走同仓相对路径引**源码**
// （⛔ 不引 `dist/`——那是 gitignore 的构建产物，干净检出必炸）。插件仓那边走包名 subpath，两处形态有意不同。
import "./packages/plugin-sdk/src/vitest-setup";
