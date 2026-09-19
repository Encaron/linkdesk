/**
 * 纯数据插件的打包通道（E6#98c，L7 第 7.1 轮）——`linkdesk-plugin-sdk pack`。
 *
 * 为什么需要它：主题 / 语言/图标集这类插件**没有 entry、没有可编译表面**——`build` 的 collectSurfaces
 * 会直接抛「无可编译表面」。此前它们的 zip 只由**壳仓脚本** `scripts/pack-bundled-plugins.mjs` 产出，
 * 而源码搬进各自独立的仓之后，插件仓里没有那条路径 ⇒ 产不出 zip。
 *
 * 语义 = 打包「**目录整树**」：`plugin.json` + 全部随包资源，条目相对插件根、正斜杠、**无外层目录**
 * （loader 解压期待 plugin.json 在顶，E6#7 契约）。与 `build` 的静态清单不同——`build` 只拷一份
 * 白名单（plugin.json / i18n / icon / README / CHANGELOG），纯数据包的**本体**恰恰是白名单之外的
 * 数据文件（`themes/*.json` / `icons/**` / `en.json`），只能走「整树」。
 *
 * 排除清单（三个理由）：
 *   - **构建/工具产物**：`node_modules/`、`dist/`、`<id>.linkdesk-plugin`（自己上一次的产物）、`*.tgz`
 *     ——独立仓里跑过 `npm install` 之后，不排会把整个 node_modules 打进 zip。
 *   - **npm 元数据**：`package.json` / `package-lock.json`——它们描述「怎么构建这个包」，不是插件内容。
 *     这个取舍与 `build` 一致（build 的静态清单从不拷 package.json）。
 *   - 🔴 **仓库面工具文件**（2026-09-15 补）：`AGENTS.md`（给在这个仓里干活的 AI 看的仓面说明）、
 *     `marketplace.json`（`publish` 写的**目录条目**——消费者全部经 GitHub Contents API 读**仓根**那份，
 *     没有任何代码从「已装插件目录」读它）、`scripts/ci-verify.mjs`（仓自带门禁的入口）。
 *     **判据 = 它是不是「插件内容」**：这三个都只服务「维护这个仓」，装插件的人一个都用不上。
 *     ⚠️ 漏排的实际代价不是"多几个文件"——是**出厂件因此不可能由仓内重建**：同一份源码，
 *     多一个仓面文件就换一个内容指纹，而「箱内 ↔ 账」两道门禁都看不见这种漂移。
 *     与 `build` 一致（build 的静态清单同样不拷它们）。
 *   隐藏项（`.` 开头，含 `.git` / `.github` / `.gitignore` / `.npmrc`）一并排除——同属工具面。
 *   ⚠️ **`LICENSE` 反过来要随包**（不排）：MIT 这类条款要求「副本里带版权声明」，而 zip 才是
 *     用户真正拿到的那份；`build` 通道白名单里也同笔补了它（见 vite-config.ts 的拷贝清单）。
 *
 * 🔴 **两条与壳仓脚本必须逐字节一致的行为**（否则同一插件走「壳内」与「插件仓」两条路径产出的内容
 * 指纹不同，`scripts/check-bundled-version-bump.mjs` 的内容指纹门禁会互相打架）：
 *   ① **文本条目行尾归一 LF**——让产物与「打包时工作区的行尾」解耦。规则本体在 `normalizeEol`（本文件），
 *      壳仓侧的同源实现是 `scripts/lib/text-eol.mjs`（判据：前 8000 字节含 NUL ⇒ 二进制原样；否则严格
 *      UTF-8 解码，解不开也当二进制；文本一律 `\r\n → \n`）。**SDK 是独立发布的 npm 包，不能 import
 *      壳仓文件**，故只能是一份同源实现——改一处必须同笔改另一处。
 *      ⚠️ 壳仓的 `pack-bundled-plugins.mjs` 已改为调用本模块（打包实现只此一份），因此这条「两处同源」
 *      当前只剩「行尾规则」这一份判据需要人工对齐。
 *   ② **条目时间戳固定**（`ZIP_ENTRY_DATE`）——JSZip 默认给每个条目盖 `new Date()`，于是内容一个字没改
 *      重打一次字节也全变 ⇒ 产物不可复现（`git status` 恒脏、无法用「重打一遍」验证、也判断不了某次
 *      diff 是真改内容还是只换时间）。值本身无意义，只要跨机器恒定。
 *      🔴 **E6#15o（2026-09-19）补全：隐式目录条目同钉**——`file()` 的 `createFolders` 隐式建的父目录
 *      条目吃 `o.date || new Date()`（jszip object.js:33），文件条目钉了、目录条目没钉 ⇒ 带子目录的
 *      插件连打两次仍差几个字节（09-14 复验：同尺寸差 4 字节）。`pinDirectoryEntryDates()` 在
 *      generate 前把 `zip.files` 里全部目录条目同值覆写——generate 只认条目自身的 `.date`
 *      （jszip generate/index.js:38），改写即生效。build 通道（vite-config `zipTree`）同笔接入
 *      （那边此前连文件条目都没钉，且 `readdirSync` 不排序 ⇒ 条目顺序在 ext4 上也漂移）。
 *
 * 用法：
 *   `linkdesk-plugin-sdk pack`            → 插件根 `./<pluginId>.linkdesk-plugin`
 *   `linkdesk-plugin-sdk pack --out <p>`  → 指定输出文件（壳仓编排脚本用）
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import { derivePluginId, readPluginManifest, validatePluginJson } from "./validate.js";

/**
 * 条目时间戳固定——值本身无意义，只要跨机器恒定。与壳仓 `scripts/pack-bundled-plugins.mjs` 同值。
 */
export const ZIP_ENTRY_DATE = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));

/**
 * 把 zip 里全部**目录条目**的时间戳钉到 `ZIP_ENTRY_DATE`——E6#15o（2026-09-19）。
 *
 * 病根：`file()` 的 `createFolders` 隐式建的父目录条目在 jszip `object.js:33` 吃
 * `o.date || new Date()`——文件条目钉了、目录条目没钉 ⇒ 带子目录的插件连打两次字节必变
 * （09-14 复验：同尺寸差 4 字节 = 目录条目的 dos time/date 字段）。修法 = generate 前对
 * `zip.files` 里 `dir === true` 的条目同值覆写——generate 只认条目自身的 `.date`
 * （jszip `generate/index.js:38` `var dir = file.dir, date = file.date`），改写即生效。
 * pack 与 build（vite-config）两通道同源调用此函数。
 */
export function pinDirectoryEntryDates(zip: JSZip): void {
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) entry.date = ZIP_ENTRY_DATE;
  }
}

/** pkgDir → zip 目录遍历——条目相对 pkgDir、正斜杠归一（build 通道用；住在 pack 是因为
 *  「确定性打包」的两条纪律——时间戳固定 ＋ 条目顺序确定——两通道同源，别写两份）。
 *  🔴 E6#15o（2026-09-19）：文件条目日期固定（此前 build 通道全部条目盖 `new Date()`）＋
 *  `readdirSync` 结果按名排序（NTFS 恰好按名返回、ext4 不然 ⇒ 不排序则条目顺序跨机漂移，
 *  隐式目录条目的出现时机连带漂）；目录条目由调用处在 generate 前用 `pinDirectoryEntryDates` 钉住。 */
export function zipTree(zip: JSZip, dir: string, prefix: string): void {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const full = join(dir, e.name);
    if (e.isDirectory()) zipTree(zip, full, rel);
    else zip.file(rel, readFileSync(full), { date: ZIP_ENTRY_DATE });
  }
}

/** 排除的目录名（任意层级）——构建/工具产物 */
const EXCLUDED_DIRS = new Set(["node_modules", "dist"]);

/** 排除的文件名（任意层级）——npm 元数据 + 仓库面工具文件（见文件头「排除清单」） */
const EXCLUDED_FILES = new Set(["package.json", "package-lock.json", "AGENTS.md", "marketplace.json"]);

/** 按**相对路径**排除——精确到一条路径，避免「同名文件在别处可能是插件内容」的误伤 */
const EXCLUDED_REL_PATHS = new Set(["scripts/ci-verify.mjs"]);

/**
 * 文本条目行尾归一——**判据照抄 git 的 `text=auto`**（不另立一套分类）：前 8000 字节含 NUL ⇒ 二进制，
 * 原样；其余按 UTF-8 **严格**解码（解不开也当二进制）；文本一律 `\r\n → \n`——与 `.gitattributes`
 * 的 `eol=lf` 同规。没有 `\r\n` 就逐字节原样（连 BOM 决策也不动），调用方可用 `normalized` 分辨
 * 「这次到底动没动」。
 *
 * 🔴 为什么必须是这条规则（壳仓实测的病根，不是推测）：`core.autocrlf=true` + `.gitattributes`
 * `text=auto eol=lf` ⇒ **索引里是 LF，工作区却是 CRLF**（`git ls-files --eol` 实测 `i/lf w/crlf`——
 * `.gitattributes` 管不住**已检出**的存量文件）。于是同一份源码在一台机器上重打一次，zip 的内容
 * 指纹就变了 ⇒ 版本门禁判「改内容没 bump」满屏红，而源码一个字没改。
 */
export function normalizeEol(buf: Buffer): { buf: Buffer; normalized: boolean } {
  if (buf.subarray(0, 8000).includes(0)) return { buf, normalized: false };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return { buf, normalized: false }; // 不是合法 UTF-8 —— 当二进制，一个字节都不碰
  }
  if (!text.includes("\r\n")) return { buf, normalized: false }; // 已是 LF，逐字节原样
  return { buf: Buffer.from(text.replace(/\r\n/g, "\n"), "utf8"), normalized: true };
}

/** 相对路径是否进包——见文件头「排除清单」。路径一律正斜杠 */
export function isPackableRelPath(rel: string): boolean {
  const parts = rel.split("/");
  if (parts.some((p) => p.startsWith("."))) return false; // 隐藏项（.git/.github/.gitignore/.npmrc…）
  if (parts.some((p) => EXCLUDED_DIRS.has(p))) return false;
  if (EXCLUDED_REL_PATHS.has(rel)) return false;
  const name = parts[parts.length - 1];
  if (EXCLUDED_FILES.has(name)) return false;
  if (name.endsWith(".linkdesk-plugin") || name.endsWith(".tgz")) return false;
  return true;
}

/** 目录递归收集相对路径文件——正斜杠，**排序**（条目顺序确定性 = 跨机器同字节） */
export function collectPluginFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), rel);
      else if (isPackableRelPath(rel)) out.push(rel);
    }
  };
  walk(root, "");
  return out.sort();
}

export interface PackResult {
  /** 插件身份（`pluginId` 声明值；缺声明时退回目录名兜底） */
  id: string;
  version: string;
  /** 产物绝对路径 */
  outPath: string;
  bytes: number;
  entryCount: number;
  /** 被归一行尾（CRLF → LF）的条目数——不为零 = 这台机器的检出是 CRLF，产物已与工作区行尾解耦 */
  normalizedCount: number;
}

/**
 * 把一个插件目录打成 `.linkdesk-plugin`（纯数据包）。
 *
 * - 先跑 `validatePluginJson`：**manifest 不合法不产 zip**（宁打包时红脸，不把坏包带进分发链）
 * - `outFile` 缺省 = `<root>/<pluginId>.linkdesk-plugin`（与 `build` 同款落点，作者零心智）
 * - **不抛异常给「属性不合法」之外的场景**——文件读不了就抛，调用方自己决定怎么报
 */
export async function packPluginData(options: { root: string; outFile?: string }): Promise<PackResult> {
  const root = resolve(options.root);
  const manifestPath = join(root, "plugin.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`插件根没有 plugin.json：${root}`);
  }

  const res = validatePluginJson(manifestPath);
  if (!res.valid) {
    throw new Error(`plugin.json 验证失败：\n  ${res.errors.join("\n  ")}`);
  }

  const manifest = readPluginManifest(manifestPath) as { version?: unknown };
  const id = derivePluginId(manifest, root.split(/[\\/]/).filter(Boolean).pop() ?? "");
  const version = typeof manifest?.version === "string" ? manifest.version : "";

  const zip = new JSZip();
  let normalizedCount = 0;
  let entryCount = 0;
  for (const rel of collectPluginFiles(root)) {
    const { buf, normalized } = normalizeEol(readFileSync(join(root, rel)));
    if (normalized) normalizedCount += 1;
    zip.file(rel, buf, { date: ZIP_ENTRY_DATE });
    entryCount += 1;
  }
  if (entryCount === 0) {
    throw new Error(`插件根没有任何可打包条目：${root}（plugin.json 之外全被排除？）`);
  }

  pinDirectoryEntryDates(zip); // E6#15o：隐式目录条目同钉固定时间戳（见函数注）

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const outPath = resolve(options.outFile ?? join(root, `${id}.linkdesk-plugin`));
  writeFileSync(outPath, buf);

  return { id, version, outPath, bytes: buf.byteLength, entryCount, normalizedCount };
}
