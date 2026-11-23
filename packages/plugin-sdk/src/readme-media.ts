/**
 * readme-media — README 媒体引用收集与随包（**纯 fs 域**，零 vite 依赖）。
 *
 * 从 vite-config 拆出（I11/#16 · R4-5.8）：collect/copy 是纯函数＋纯 fs，拆出来 = 单测可直测
 * （vite-config import vite ⇒ 测试环境带不动 esbuild）；build 通道消费同一份实现（⛔ 测试另抄正则）。
 *
 * E6#70a（15 档案 §四 70a/§五.3）：README 媒体引用收集——从说明文本抽相对引用（去 query/hash +
 * 实体解码），返回源码根相对路径集。只认作者两态写法：markdown `![alt](path)` + HTML
 * `<img>/<video>/<source>` 内 `src=`/`poster=` 属性（tag 级 [^>] 含 \n，跨行标签可过）。
 * 绝对 scheme（https/data:/mailto…）、协议相对 //、锚点 # 不入集。
 * I11/#16（R4-5.8）：补 `<source src>`——多格式视频（`<video><source src=a.webm><source src=b.mp4>`）
 * 的每个 `<source>` 都是独立资源引用，漏收 = 装完只有 poster 没有片源（详情页播放器黑屏）。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isWithinRoot } from "./validate.js";

/** 单个文件安全拷贝：断言 src 在 root 内，落 pkgDir 同相对路径，缺省忽略 */
export function copyFileInto(root: string, pkgDir: string, rel: string): boolean {
  const src = resolve(root, rel);
  if (!isWithinRoot(root, src) || !existsSync(src)) return false;
  const dest = join(pkgDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

export function readmeMediaRefs(md: string): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const clean = raw
      .trim()
      .split(/[?#]/, 1)[0]
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"');
    if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//") || clean.startsWith("#")) return;
    out.push(clean);
  };
  // markdown 图片 ![alt](path)
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) add(m[1]);
  // HTML <img>/<video>/<source> 内 src=/poster= 属性（值带单/双引号或裸值）
  for (const m of md.matchAll(/<(?:img|video|source)\b[^>]*>/gi)) {
    const attrs = m[0].matchAll(/(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi);
    for (const a of attrs) add(a[1] ?? a[2] ?? a[3] ?? "");
  }
  return out;
}

/** E6#70a：README 引用的相对媒体资产随包——扫 README 文本逐一 copyFileInto（与 README 同根相对路径）。
 *  逃逸/缺省由 copyFileInto 内 isWithinRoot + existsSync 守卫兜底（出 root 或不存在 → 跳过，作者错不红）。
 *  作者零声明清单——detail 说明区渲染以 assetBase=linkdesk://{id}/ 解析这些相对路径 → 资产必须真在包内。 */
export function copyReadmeReferencedAssets(root: string, pkgDir: string, readmeText: string): void {
  for (const rel of readmeMediaRefs(readmeText)) copyFileInto(root, pkgDir, rel);
}

/** 多语言 README 的随包：按该 md 自己的目录解析相对媒体引用，落包内同相对路径。
 *  声明路径由 plugin.json readme.locales 给出；未声明 = 不随包。 */
export function copyReadmeFileAssets(root: string, pkgDir: string, readmeRel: string): void {
  const absReadme = resolve(root, readmeRel);
  if (!isWithinRoot(root, absReadme) || !existsSync(absReadme)) return;
  const baseDir = dirname(readmeRel);
  const text = readFileSync(absReadme, "utf8");
  for (const rel of readmeMediaRefs(text)) {
    const abs = resolve(root, baseDir, rel);
    if (!isWithinRoot(root, abs) || !existsSync(abs)) continue;
    const destRel = relative(root, abs).split(sep).join("/");
    copyFileInto(root, pkgDir, destRel);
  }
}
