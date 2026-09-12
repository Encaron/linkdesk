/**
 * 产品身份真相源——E6#57.1b（06-主软件更新/02-产品身份与版本.md §2.2）。
 *
 * loadProduct() 读 electron/product.json（02 §2.1：身份唯一真相源，随打包进 asar），
 * 一次读取缓存；ProductRuntime 从 process.versions + os 动态增强，不落盘。
 * 消费方 = 主进程 product-handlers → app:getVersion / app:getProductInfo（07 §四.1）。
 *
 * 🔥 版本单一真相源（02 §2.3）：任何地方不手写第二份版本号。Product.version 运行时
 * 恒取 `app.getVersion()`（Electron 自动读 package.json version 单点）；product.json
 * 的 version 字段仅供打包产物自证（发布脚本 npm run publish 写入 + 断言三处一致，E6#57.15d）。
 * 开发期 product.json 留 "0.1.0" 占位无害——本函数返回前用 app.getVersion() 覆盖，永不漂移。
 *
 * commit/date 降级（07 §四.1）：product.json 缺失 / 字段为空（dev 占位）→ '—'，永不抛。
 */

import { app } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';

export interface Product {
  nameLong: string;
  nameShort: string;
  version: string; // SemVer（运行时 = app.getVersion()，见头注）
  commit: string; // git HEAD 短哈希（发布脚本写）；dev 空 → '—'
  date: string; // ISO 8601（发布脚本写）；dev 空 → '—'
  quality: 'stable' | 'preview';
  updateUrl: string;
}

/** runtime 增强（process.versions，不落盘） */
export interface ProductRuntime {
  electron: string;
  chromium: string;
  node: string;
  v8: string;
  os: string; // `${platform} ${release}`（02 §2.2）
}

/** 关于标签页 8 字段唯一来源（07 §三）——app:getProductInfo 返回体 */
export interface ProductInfo {
  product: Product;
  runtime: ProductRuntime;
}

/** 缺 product.json / dev 占位空字段 → 显示级降级值（07 §四.1：'—' 不崩） */
const PLACEHOLDER = '—';

/** dev 缺文件时的兜底（quality/updateUrl 有默认，commit/date 走 PLACEHOLDER） */
const DEFAULT_PRODUCT: Omit<Product, 'version'> = {
  nameLong: 'LinkDesk',
  nameShort: 'LinkDesk',
  commit: PLACEHOLDER,
  date: PLACEHOLDER,
  quality: 'stable',
  updateUrl: '',
};

let _productCache: Product | null = null;

/**
 * electron/product.json 路径——dev（app 根 = repo）与打包（app.asar 内）统一按
 * app.getAppPath() 解析；打包需 electron-builder files 含 electron/product.json。
 */
function productJsonPath(): string {
  return join(app.getAppPath(), 'electron', 'product.json');
}

/** 读取 product.json（一次读取缓存）——缺失/坏 JSON → 兜底默认，永不抛。 */
export function loadProduct(): Product {
  if (_productCache) return _productCache;

  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(readFileSync(productJsonPath(), 'utf8'));
  } catch {
    // 缺文件 / 坏 JSON → 兜底默认（07 §四.1：不崩）
  }

  const commit = typeof raw.commit === 'string' && raw.commit ? raw.commit : PLACEHOLDER;
  const date = typeof raw.date === 'string' && raw.date ? raw.date : PLACEHOLDER;
  const quality = raw.quality === 'preview' ? 'preview' : 'stable';

  _productCache = {
    nameLong: typeof raw.nameLong === 'string' && raw.nameLong ? raw.nameLong : DEFAULT_PRODUCT.nameLong,
    nameShort: typeof raw.nameShort === 'string' && raw.nameShort ? raw.nameShort : DEFAULT_PRODUCT.nameShort,
    // 🔥 唯一运行时版本源 = app.getVersion()（package.json）——忽略 product.json 自证值（02 §2.3）
    version: app.getVersion(),
    commit,
    date,
    quality,
    updateUrl: typeof raw.updateUrl === 'string' ? raw.updateUrl : DEFAULT_PRODUCT.updateUrl,
  };
  return _productCache;
}

/**
 * 产品短名 = `package.json` 的 `name`（E6#57.5a）——**唯一用途**：拼更新器要找的安装包名。
 *
 * 🔴 **为什么不能换成 `app.getName()`**：那一个函数**被问了两个问题**——Electron 在 `package.json`
 * 同时有 `productName` 时返回 `productName`（"LinkDesk"，大写），否则返回 `name`（"linkdesk"）。
 * 而 electron-builder 的 `artifactName` 用的是 **`${name}` 不是 `${productName}`**（electron-builder.yml
 * 里就这一句注记）⇒ 哪天有人给 package.json 补上 `productName`，`app.getName()` 会**悄悄**变成大写那个，
 * 拼出来的安装包名从此恒不匹配 ⇒ 每个用户的更新器都报「安装包缺失」。读 `name` 字段则**语义唯一**。
 *
 * 🔴 **与 loadProduct() 的「缺失即兜底」相反——本函数**故意抛**。** loadProduct 的消费方是显示
 * （关于页），兜底值无害；本函数的消费方是**版本比对**——兜底出一个空串会让期望包名变成
 * `-setup-0.1.50.exe`、恒不匹配，把**本机打包缺陷**伪装成「发布侧改了文件名」（错向归因）。
 * 且 `package.json` 本就进 asar（electron-builder.yml `files:`），读不到只可能是包坏了 ⇒ 该硬失败。
 */
export function appPackageName(): string {
  const raw = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { name?: unknown };
  if (typeof raw.name !== 'string' || !raw.name) {
    throw new Error('product: package.json 缺 name 字段（拼安装包名的唯一来源，见 appPackageName）');
  }
  return raw.name;
}

/** runtime 增强（process.versions 动态读 + os 拼接）——每次现读，不缓存（永不漂移） */
export function productRuntime(): ProductRuntime {
  return {
    electron: process.versions.electron ?? PLACEHOLDER,
    chromium: process.versions.chrome ?? PLACEHOLDER,
    node: process.versions.node ?? PLACEHOLDER,
    v8: process.versions.v8 ?? PLACEHOLDER,
    os: `${process.platform} ${os.release()}`,
  };
}

/** app:getProductInfo 全量返回体 */
export function productInfo(): ProductInfo {
  return { product: loadProduct(), runtime: productRuntime() };
}

/** 测试辅助：清空单例缓存（product-handlers/单测用） */
export function __resetProductCache(): void {
  _productCache = null;
}
