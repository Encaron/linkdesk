/**
 * 产品身份 wire 契约——`app:getProductInfo` 的返回体（07-数据流通格式.md §四.1）。
 *
 * ## 为什么类型住在这里，而不是 `electron/product.ts` 里
 *
 * 同 `src/core/types/ipc/update.ts` 的既有理由（那个文件头注写着同一句话）：
 * **跨堆协议类型归口本目录，`electron/` 与 `src/` 双端 import 同一份**——字段改名 tsc 双端报错，
 * 不再各写一份。
 *
 * 🔴 本文件是**从 `electron/product.ts` 搬过来的**（E6#57.13 落地时）：那三个 interface 原本
 * 只声明在主进程，而渲染侧 `window.linkdesk.app.getProductInfo` 是**壳内私有扩展**
 * （不在契约，见 `src/core/api/linkdesk-api/surfaces.ts` 的 `ShellExposed.app` 段）——
 * 壳侧要消费它就得有类型，而「在 `src/` 里再抄一份」等于**同一个形状两份真值**，
 * 改一处漏一处是迟早的事。搬移的另一个理由：`#57.14` 关于标签页要的是同一份数据，
 * 那时不必再搬第二次。
 *
 * ⚠️ 值不动：`loadProduct()` / `productInfo()` 仍在 `electron/product.ts`（读 `product.json` +
 * 从 `process.versions` 增强）——本文件**零逻辑，只有形状**。
 */

/** `electron/product.json` 的身份字段（02 §2.2：身份唯一真相源，随打包进 asar） */
export interface Product {
  nameLong: string;
  nameShort: string;
  /** SemVer。⚠️ 运行时恒取 `app.getVersion()`（02 §2.3 版本单一真相源），不是读 product.json 那份 */
  version: string;
  /** git HEAD 短哈希（发布脚本写）；dev 空 → `'—'` */
  commit: string;
  /** ISO 8601（发布脚本写）；dev 空 → `'—'` */
  date: string;
  quality: "stable" | "preview";
  /**
   * 更新源 URL（检查腿打的 `/latest` 端点）。
   * ⚠️ 也是**发行说明「所有版本」链接的唯一基址**——壳侧 `useReleaseNotes.listPageUrl()`
   * 从这个值推出 `github.com/O/R/releases` 页面端点，不写死仓库地址（仓库名改过一次：
   * `serial-v3` → `linkdesk`）。改仓库 = 改 `product.json` 一处。
   */
  updateUrl: string;
}

/** runtime 增强（`process.versions` + `os`，不落盘） */
export interface ProductRuntime {
  electron: string;
  chromium: string;
  node: string;
  v8: string;
  /** `${platform} ${release}`（02 §2.2） */
  os: string;
}

/** `app:getProductInfo` 全量返回体（关于标签页 8 字段唯一来源，07 §三） */
export interface ProductInfo {
  product: Product;
  runtime: ProductRuntime;
}
