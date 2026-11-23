/**
 * `linkdesk-plugin-sdk publish`——E6#26d CLI 主路（自动发布链路底座 = E6#26b）。
 *
 * 作者在自己插件工程根跑 `npm run publish`（= linkdesk-plugin-sdk publish）：
 *   1. 读 plugin.json（复用 validate.ts 面）→ 插件 <id> v<version>；找 build 已产的分发件
 *      `<root>/<id>.linkdesk-plugin`（缺 → 提示先 `npm run build`）。
 *   2. 目标仓库 = 工程 git remote origin（多市场源模型 01 §六——作者发布到**自己**的 GitHub 仓库，
 *      别人把该仓库加为市场源即发现）。仅支持 github.com。
 *   3. 自动发布链路（GitHub REST，github-http.ts）：
 *        a. 校验仓库可达 + 取 default_branch（顺带验证 PAT）
 *        b. Release tag 已存在 → 拦（先 bump plugin.json version 再发）
 *        c. 创建 Release v<version> → 上传 <id>.linkdesk-plugin asset
 *        d. 更新仓库根 marketplace.json（Contents API：读 sha → 合并条目 → PUT）——
 *           格式 = marketplace.json 规范 §三 + §3.2（versions[] 版本历史最新在前）；更新消费者
 *           electron/ipc/handlers/plugin-install-handlers.ts:198 读 plugins[].versions[] 做版本对比。
 *           条目里的**两个「未装态」展示字段**（E6#91c 接通，作者零声明、publish 自动写）：
 *             · `readmeUrl` ← 工程根有 `README.md` 时填 raw.githubusercontent.com/{owner}/{repo}/{tag}/README.md
 *             · `versions[0].changelog` ← 工程根 `CHANGELOG.md` 切出「版本号 === manifest.version」那一段正文
 *           **两者缺省即不写键**（无 README / 无 CHANGELOG / 切不到该版本）——写了 404、写空串都是骗人。
 *           E6#106 同笔接通**身份图**：条目的 `icon`/`marketIcon` 由 `withCatalogIdentity` 转成绝对 URL
 *           （包内相对路径 → raw 直链）。**不转 = 未装用户看到的插件图标恒 404**——目录条目是「未装态」
 *           唯一数据源，而包内路径只有已装才可达。
 *   4. 发前预览确认（#26b「发布前预览+确认」）：打印 id/name/version/author/文件大小/目标仓库/tag
 *      → [y/N]；`--yes` 跳过（CI）；`--dry-run` 只打印将做动作不碰网络。
 *   5. publish v2（R4-4.5，Marketplace-Store 批4b）：工程根有 `marketplace.config.json` 时，
 *      除 v1 条目外**同笔写入 v2 文件夹**（09 §九·9.2）：
 *        · `authors/<authorId>.json` —— 作者块（身份/storeTitle/publicKey/homepage 板块声明
 *          以 config 为准；repos = 本仓段）。config 缺 authorId ⇒ 跳过（纯 v1 作者零打扰）。
 *        · `collections/<id>.json` —— 合集拆分写法；市场侧**读取入口 = 根 marketplace.json
 *          `collections[]` 里的字符串 id 引用**（config 声明合集时 publish 把根级 collections
 *          写成 id 数组；市场见字符串才拉对应文件——v1 目录零探针，⛔ 不调目录列举 API）。
 *      同版本重跑拦截 = 既有 Release-tag 断言（步骤 3b），它先于一切写入抛出 ⇒ v2 文件天然同罩。
 *
 * PAT（#26c 链路的 CLI 半侧）：env `LINKDESK_GITHUB_TOKEN` > 用户配置档
 * `{configDir}/linkdesk-sdk/config.json`（首跑掩码提示输入存一次，0600）。
 * #26a UI 备路 + #26c 的 app.* 配置存储 = 市场插件轮（L3）——UI 发 GitHub 需壳主进程 handler，
 * 本 CLI 是无壳作者终端主路（00-第三方作者旅程 §五）。
 *
 * 失败都 throw 中文可读错误 → bin.ts catch 打印；退出码由 bin 定。
 */
import { createHash } from "node:crypto"; // P1：发布件 sha256（与上传字节同一份）
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import JSZip from "jszip";
import * as jsonc from "jsonc-parser";
import { derivePluginId, readPluginManifest } from "./validate.js";
import { checkManifestI18n, formatMissingTranslation } from "./i18n-gate.js";
import { ghErrorDetail, ghHttp } from "./github-http.js";

/* ── 类型 ─────────────────────────────────────────────────────────────── */

/**
 * publish 成功收尾的固定提示（E6#133）。publish 用 Contents API 在**远端**独立提交
 * marketplace.json，本地 HEAD 从此落后一个提交——不 pull，下次 publish 必撞
 * 「本地 ≠ 远端」前置断言（第三方作者实测撞上）。文案与断言文案同批维护。
 */
export const PUBLISH_REMOTE_UPDATED_HINT =
  "📌 已在你仓库远端更新 marketplace.json（独立提交）——本地建议先 git pull，否则下次 publish 会撞「本地 ≠ 远端」前置断言。";

export interface GitHubRemote {
  owner: string;
  repo: string;
}

export interface CatalogVersion {
  version: string;
  downloadUrl: string;
  publishedAt: string;
  changelog?: string;
  /** P1（spec §七）：该版本分发件 sha256（小写 hex64）——壳下载后先校验再解压。
   *  publish 自 0.1.114 起自动计算写入；旧条目缺省 = 「未校验」不阻断。 */
  sha256?: string;
}

/** marketplace.json 插件条目——对齐规范 §三/§3.2 字段（作者条目=纯增量，缺字段不崩）。
 *  🔴 本类型与 `schemas/marketplace.schema.json` 是同一契约的两面（E6#135）：类型加/删字段必须
 *  同笔改 schema——对账测试 marketplace-schema.test.ts 用「真实产出过 schema」钉住。 */
export type LocaleOverrides = Record<string, Record<string, string>>;

export interface CatalogPluginEntry {
  id: string;
  name: string;
  /** 语言槽位（en/zh/… → {name,description}）；base 字段兜底。schema 同笔声明。 */
  locales?: LocaleOverrides;
  /** 顶层 version/downloadUrl = 最新（兼容旧条目） */
  version: string;
  description?: string;
  author?: { name: string; url?: string };
  /** 界面小图标（已装态读包内；未装态读本字段）——**发布时 URL 化**，见 withCatalogIdentity */
  icon?: string;
  iconSource?: string;
  /** E6#106：插件身份彩色图（Type-2）——图标栏 4 只插件的 `icon` 是 Type-1 剪影，**市场展示位必须读这一张**；
   *  此前目录条目只带 `icon` ⇒ 市场行显剪影而本地显身份图（同一插件两张脸）。发布时 URL 化，同 `icon`。 */
  marketIcon?: string;
  marketIconSource?: string;
  category?: string;
  /** Marketplace-Store v2：主分类下的副标签 slug（喂搜索/小类 chips；抽屉归属只看 category，防双重陈列） */
  categories?: string[];
  /** v2：作者身份聚合键——接 `authors/<authorId>.json` 作者块与 `vendors.json` 注册表（判定链：命中 ⇒ 官方 ✓） */
  authorId?: string;
  /** v2：画廊媒体——string = 图片（旧数据原样）；视频项至多 1 段且必须排第一（解析期丢越位视频并记声明提示） */
  screenshots?: CatalogScreenshot[];
  /** 目录卡封面（绝对 HTTPS URL）——缺省时市场按「视频海报 → 首张静帧 → 生成式封面」选帧 */
  cover?: string;
  /** 作者声明的许可证（展示字段） */
  license?: string;
  /** 作者显式声明的插件主页（完整 URL；非 GitHub 托管/自有官网的唯一出口） */
  repository?: string;
  /** v2：定价声明——只展示不裁决（购买走外链、验签在壳；09 §三·补3） */
  pricing?: PricingDecl;
  downloadUrl: string;
  size?: number;
  publishedAt?: string;
  minAppVersion?: string;
  /** 多语言 README 远端直链（语言码 → tag 下 raw URL）；缺省 = 单语言（readmeUrl）。 */
  readmeLocales?: Record<string, string>;
  /** 未装插件详情页「详情」页签的 README 远端直链（E6#91c 接通）——publish 自动写，作者零声明。
   *  与打进 zip 的 README 同源（同一 tag），故未装看到的 = 装上后看到的。工程根无 README.md → 不写。 */
  readmeUrl?: string;
  /** 版本历史，最新在前——更新机制数据源 */
  versions: CatalogVersion[];
}

export interface MarketplaceCatalog {
  /** $schema 引用——kit init 写入（编辑器补全）；publish 根级保全原样带过，不拥有它 */
  $schema?: string;
  version?: string;
  updatedAt?: string;
  plugins: CatalogPluginEntry[];
  /** v2：官方目录的已审核第三方源清单（只有官方运营者可写；收录 = 背书不复制条目） */
  sources?: SourceLink[];
  /** v2：合集声明（可声明于任意仓的 marketplace.json——推荐落点；成员按 id 引用，缺失静默跳过）。
   *  R4-4.5 两读：对象 = inline 声明；字符串 = `collections/<id>.json` 文件夹引用（拆分写法的
   *  读取入口——市场见字符串才拉对应文件，v1 目录零探针）。 */
  collections?: Array<CollectionDecl | string>;
  /** v2：分类 rail 展示顺序（未注册 slug 落「其他」桶，不报错） */
  categoryRail?: CategoryRailDecl;
}

/* ── Marketplace-Store v2 数据形状（R4-0.2 · 09-API设计 正典）────────────────────
 *  🔴 本组类型与 `schemas/marketplace.schema.json` $defs 是同一契约的两面（E6#135 同源纪律）——
 *  加/删字段必须同笔改 schema，对账测试 marketplace-schema.test.ts 用 key bag 集合 diff 钉住。 */

/** 画廊媒体项：string = 图片 URL（旧形态）；视频对象至多 1 段且必须排第一（06 §二·2 媒体契约） */
export type CatalogScreenshot = string | { type: "video"; url: string; poster?: string };

/** 定价声明（v1 只展示：外链收钱＋壳 Ed25519 离线验签；subscription/channel 为 B3 预留枚举位） */
export interface PricingDecl {
  model: "paid" | "subscription";
  price?: number;
  currency?: string;
  period?: string;
  /** 销售页——购买流 openExternal 的目标；model:"paid" 时必填（schema if/then 钉住） */
  licenseUrl?: string;
  refundUrl?: string;
  /** 试用天数＝详情页静态说明（真试用门在作者代码，壳不管） */
  trialDays?: number;
  /** B3 双轨预留：self = 自销（离线签名 0 抽成）· managed = 托管（我们签发/收款/抽成） */
  channel?: "self" | "managed";
}

/** 已审核第三方源清单条目（官方目录根级；收录 = 背书，⛔ 不收条目副本） */
export interface SourceLink {
  url: string;
  authorId: string;
  addedAt: string;
}

/** 合集声明（06 §二·3；作者数据直显不走 t()——先例：目录条目标题/作者/来源仓库名） */
export interface CollectionDecl {
  id: string;
  /** 语言槽位（title/subtitle/hint；base 字段兜底） */
  locales?: LocaleOverrides;
  title: string;
  subtitle?: string;
  /** 板块副题说明字——不声明不渲染（09 §五） */
  hint?: string;
  cover?: string;
  /** 卡片原型映射：banner→hero · strip→sm 横排 · duo→lg×2 · grid→md 网格（05 §四） */
  layout?: "banner" | "strip" | "duo" | "grid" | "mega" | "small" | "split" | "wall";
  /** 成员 pluginId 引用——缺失条目静默跳过（照目录 merge 防御语义） */
  items: string[];
  /** 环境光晕开关——市场侧板块级/合集级「两处都认」（08 §三·v3.57 U4；缺省开） */
  glow?: boolean;
  /** 合集标题跳转字——封闭 target 集合（与板块 more 同规） */
  more?: SectionMore;
  order?: number;
}

/** 分类 rail 展示顺序声明（06 §二·3） */
export interface CategoryRailDecl {
  order: string[];
  icons?: Record<string, string>;
}

/** 作者块内单个仓段——多仓归属（同 authorId 跨仓聚合；intro/image 仅显示于店内仓卡） */
export interface AuthorRepo {
  id: string;
  /** 语言槽位（name/intro；base 字段兜底） */
  locales?: LocaleOverrides;
  name: string;
  intro?: string;
  image?: string;
  /** 本仓 marketplace.json URL——仓切换拉取目标 */
  sourceUrl: string;
}

/** 板块跳转字——label 文案完全归作者；target 封闭集合（category:<slug> / rank / repo:<id>） */
export interface SectionMore {
  label: string;
  target: string;
}

/** hero 轮播单张（作者自选哪几张上大屏，上限 5 同官方） */
export interface HeroSlide {
  plugin: string;
  tag?: string;
}

/** 作者主页板块声明——「UI 界面必须有对应的指令」（09 §二）。type 封闭四件；标题/副题/跳转字全归作者，
 *  ⛔ 渲染器不自动造任何板块名与「更多」；「按分类浏览」渲染器硬保留、不在可声明清单。 */
export type HomepageSection =
  | { type: "hero"; slides: HeroSlide[]; locales?: LocaleOverrides; title?: string; hint?: string; glow?: boolean; more?: SectionMore }
  | {
      type: "collection";
      collection: string;
      locales?: LocaleOverrides;
      /** 卡片原型（整块统一，⛔ 卡级混排——想混 = 拆两个板块） */
      layout?: "small" | "mega" | "duo" | "split" | "wall";
      title?: string;
      hint?: string;
      glow?: boolean;
      more?: SectionMore;
    }
  | { type: "grid"; locales?: LocaleOverrides; title: string; hint?: string; glow?: boolean; more?: SectionMore }
  | { type: "rank"; top?: number; scope?: "self"; locales?: LocaleOverrides; title?: string; hint?: string; glow?: boolean; more?: SectionMore };

/** 作者块（authors/<authorId>.json）——authorId 去中心化聚合键（推荐 GitHub 用户名＝身份正典） */
export interface AuthorBlock {
  authorId: string;
  /** 语言槽位（intro/storeTitle；base 字段兜底） */
  locales?: LocaleOverrides;
  name: string;
  /** 非 GitHub 作者兜底（GitHub 正典可解时优先取 GitHub） */
  avatar?: string;
  introImage?: string;
  intro?: string;
  /** 作者店名，缺省「〈作者名〉的 Plugin Store」 */
  storeTitle?: string;
  /** Ed25519 公钥（kit keygen 生成）——壳离线验签许可密钥 */
  publicKey?: string;
  repos: AuthorRepo[];
  homepage?: { locales?: LocaleOverrides; sections?: HomepageSection[] };
}

/** 厂商注册表条目（vendors.json 独立文件，官方目录仓根；判定链唯一：authorId 命中 ⇒ 官方 ✓） */
export interface VendorDecl {
  vendorId: string;
  name: string;
  domains?: string[];
  githubOrgs?: string[];
  verifiedBy: "domain" | "github-org" | "manual";
  verifiedAt?: string;
}

export interface PublishOptions {
  /** 跳过确认（CI） */
  yes?: boolean;
  /** 只预览将做动作，不碰网络/token */
  dryRun?: boolean;
}

/* ── token 链路（CLI 半侧）────────────────────────────────────────────── */

function sdkConfigDir(): string {
  const home = homedir();
  const base =
    process.env.APPDATA && process.platform === "win32"
      ? process.env.APPDATA
      : process.env.XDG_CONFIG_HOME && process.platform !== "darwin"
        ? process.env.XDG_CONFIG_HOME
        : process.platform === "darwin"
          ? join(home, "Library", "Application Support")
          : join(home, ".config");
  return join(base, "linkdesk-sdk");
}

function tokenFilePath(): string {
  return join(sdkConfigDir(), "config.json");
}

/** 读已存 token（env 覆盖优先——CI/临时注入；文件 = 作者机器持久） */
function readStoredToken(): string {
  const env = process.env.LINKDESK_GITHUB_TOKEN;
  if (env && env.trim()) return env.trim();
  try {
    const raw = readFileSync(tokenFilePath(), "utf8");
    const cfg = JSON.parse(raw) as { githubToken?: unknown };
    if (typeof cfg.githubToken === "string" && cfg.githubToken.trim()) return cfg.githubToken.trim();
  } catch {
    // 文件不存在 / 坏 JSON → 视为无 token
  }
  return "";
}

function writeStoredToken(token: string): void {
  const dir = sdkConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(tokenFilePath(), `${JSON.stringify({ githubToken: token }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600, // POSIX 生效；Windows 忽略（ACL 由用户账户隔离）
  });
}

/** 掩码输入——stdin raw 模式逐键收，输出 '*' 不回显原文。回车/EOF 结束；Ctrl+C 取消。 */
function promptMasked(prompt: string): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      rejectP(new Error("当前非交互终端，无法安全输入 token——请设环境变量 LINKDESK_GITHUB_TOKEN"));
      return;
    }
    process.stdout.write(prompt);
    let acc = "";
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      try {
        stdin.setRawMode(false);
      } catch {
        // raw 模式还原失败不阻断
      }
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
    };
    const onData = (buf: Buffer): void => {
      for (const code of buf) {
        if (code === 3 || code === 4) {
          // Ctrl+C / Ctrl+D → 取消
          finish();
          rejectP(new Error("已取消"));
          return;
        }
        if (code === 13 || code === 10) {
          finish();
          resolveP(acc);
          return;
        }
        if (code === 8 || code === 127) {
          if (acc.length > 0) {
            acc = acc.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        acc += String.fromCharCode(code);
        process.stdout.write("*");
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

/** 取 token：env > 文件 > （TTY 首跑）掩码提示并持久化；非 TTY 无 token → throw */
async function acquireToken(): Promise<string> {
  const env = process.env.LINKDESK_GITHUB_TOKEN;
  if (env && env.trim()) return env.trim();
  const stored = readStoredToken();
  if (stored) return stored;
  const isTty = Boolean(process.stdin.isTTY);
  if (!isTty) {
    throw new Error(
      "未找到 GitHub token：请设环境变量 LINKDESK_GITHUB_TOKEN，或先在有交互终端跑一次 publish 让它记住（存到用户配置档）。",
    );
  }
  const token = await promptMasked("GitHub Personal Access Token（首次发布，需 repo 权限；仅本次输入、存入本机配置，不输出）：");
  if (!token.trim()) throw new Error("未输入 token，已取消");
  writeStoredToken(token.trim());
  console.log("  ✓ token 已存入本机配置（后续发布自动复用；env LINKDESK_GITHUB_TOKEN 可随时覆盖）");
  return token.trim();
}

/* ── 纯逻辑：仓库解析 / 条目映射 / catalog 合并（可单测，无 I/O）────────── */

/** 解析 git remote origin → owner/repo。支持 https:// / git:// / ssh://git@ / git@github.com:o/r(.git) */
export function parseGitHubRemote(raw: string): GitHubRemote | null {
  const s = raw.trim();
  const m =
    /^(?:https?:\/\/|git:\/\/|ssh:\/\/)?(?:git@)?github\.com[:/]([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
      s,
    );
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  if (!owner || !repo) return null;
  return { owner, repo };
}

/** 当前工程 git origin URL——非 git 工程 / 无 origin → throw（发布前提 = 插件工程已推到 GitHub） */
export function gitRemoteOrigin(root: string): string {
  try {
    const out = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" });
    const url = out.trim();
    if (!url) throw new Error("empty");
    return url;
  } catch {
    throw new Error(
      "发布需要插件工程是一个已推到 GitHub 的 git 仓库（发布目标 = 工程 origin 的 Releases + marketplace.json，多市场源模型）。请先：git init → git remote add origin git@github.com:<你>/<仓库>.git → git push -u origin main，再跑 publish。",
    );
  }
}

/** 本地 HEAD 的 sha——读不到（非 git 工程 / git 不在 PATH / 空仓无提交）→ null，由调用方决定要不要拦 */
export function gitHeadSha(root: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    const sha = out.trim();
    return /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/**
 * `git status --porcelain --untracked-files=no` 的解析（纯函数，便于单测）。
 * 一行一条：` M path` / `M  path` / `MM path` / `R  old -> new`……本函数只取整行（够判「有没有脏」，
 * 也能原样念给作者听），不做花哨解析——但**必须滤掉空行**，否则空输出会被当成「脏了一条」。
 */
export function parsePorcelainStatus(out: string): string[] {
  return out
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");
}

/**
 * 工作区里**已跟踪**文件的未提交改动（`git status --porcelain --untracked-files=no`）→ 文件清单。
 *
 * 只看已跟踪：untracked 不进任何提交、也常常是构件与临时文件（各仓 `.gitignore` 已把 `dist/` 与
 * `<id>.linkdesk-plugin` 排除），拿它们拦发布只会制造假红。
 */
export function gitDirtyTracked(root: string): string[] {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" });
    return parsePorcelainStatus(out);
  } catch {
    return [];
  }
}

/** 发布前置判据的结论（纯数据，便于单测；真正的 IO 在 assertPublishReady 里） */
export type PublishReadiness =
  | { ok: true; skipped?: string }
  | { ok: false; kind: "unpushed" | "dirty"; message: string };

/**
 * 🔴 **发布前置断言**（E6#68c 追加，2026-09-15 用户拍板「把这条做成机械门禁」）。
 *
 * 为什么必须拦——**2026-09-15 实测踩过一次**：本机代理进程死掉的那段时间里，`git push` 失败
 * 而 `publish` **照样成功**。两者是**两条独立链路**（push 走 git，publish 走 api.github.com 的
 * Releases API），一条断不代表另一条断 ⇒ 于是「半成品发布」可以悄无声息地成立：
 *   · Release 建好了、asset 传对了（asset 取自**本地工作区**的构建件）；
 *   · 但 tag 是打在**远端默认分支 HEAD** 上的，而本地那笔提交没推上去
 *     ⇒ **tag 指向的提交里没有你刚改的文件**；
 *   · 目录条目里的 `icon` / `marketIcon` / `readmeUrl` 全写成
 *     `raw.githubusercontent.com/<owner>/<repo>/v<版本>/<路径>` ⇒ **未装用户看到的图标与 README 全 404**。
 *
 * 两条判据：
 *   ① `localHead` 必须 === `remoteHead`（远端默认分支 HEAD）——不等 = 本地有未推送的提交；
 *   ② 工作区不能有已跟踪文件的未提交改动——发布件是从**工作区**打的包，脏工作区打出来的内容
 *      **不在任何提交里**，与目录条目指向的 tag 对不上（memory `stale-sdk-built-plugin-zip` 同族）。
 *
 * 读不到远端 HEAD（空仓 / 权限 / API 抖）⇒ **放行 + 说明**，不判红：本仓最贵的坏法是**假红**
 * （假红让真红失效），护栏不该因为自己读不到就拦住作者的正常发布。
 */
export function judgePublishReadiness(input: {
  localHead: string | null;
  remoteHead: string | null;
  dirtyFiles: string[];
}): PublishReadiness {
  const { localHead, remoteHead, dirtyFiles } = input;
  if (dirtyFiles.length > 0) {
    return {
      ok: false,
      kind: "dirty",
      message:
        `🔴 工作区有未提交的改动（${dirtyFiles.length} 个）——**发布已中止**：\n` +
        dirtyFiles.map((f) => `     ${f}`).join("\n") +
        `\n   发布件是从**工作区**打的包，不是从任何提交打的 ⇒ 用户拿到的 zip 内容不在版本历史里，\n` +
        `   而目录条目（icon / marketIcon / readmeUrl）指向的是 tag（= 远端某个提交）⇒ 两者对不上。\n` +
        `   修法：先 commit（不想提交就 git stash），再 npm run build + publish。`,
    };
  }
  if (localHead && remoteHead && localHead !== remoteHead) {
    return {
      ok: false,
      kind: "unpushed",
      message:
        `🔴 本地 HEAD 还没推上去（本地 ${localHead.slice(0, 7)} ≠ 远端 ${remoteHead.slice(0, 7)}）——**发布已中止**：\n` +
        `   publish 把 tag 打在**远端 HEAD** 上，而目录条目里的 icon / marketIcon / readmeUrl 全写成\n` +
        `   raw.githubusercontent.com/<owner>/<repo>/v<版本>/<路径>。本地没推 ⇒ tag 指向的提交里**没有你刚改的文件**\n` +
        `   ⇒ 未装用户看到的图标与 README 全 404（而 Release 里那份 asset 又是对的——两条链路互不相干，一条断不代表另一条断）。\n` +
        `   修法：git push 之后再 publish。\n` +
        `   若上一次 publish 后你还没 pull 过——publish 曾替你在远端独立提交过 marketplace.json，\n` +
        `   本地不知道这笔提交；先 git pull 再重试（E6#133）。\n` +
        `   已经发错了？补推之后把 tag 挪正：git push --force origin <新 sha>:refs/tags/v<版本>。`,
    };
  }
  if (!localHead || !remoteHead) {
    return {
      ok: true,
      skipped:
        `⚠️ 发布前置断言跳过（${!localHead ? "读不到本地 HEAD" : "读不到远端 HEAD"}）——` +
        `请自行确认「本地提交已推、工作区干净」再发布。`,
    };
  }
  return { ok: true };
}

/** 远端默认分支 HEAD 的 sha（读不到 → null：空仓 / 权限 / API 抖，由判据放行） */
async function apiBranchHead(token: string, remote: GitHubRemote, branch: string): Promise<string | null> {
  const res = await ghHttp({ token, api: "api", path: `/repos/${remote.owner}/${remote.repo}/commits/${encodeURIComponent(branch)}` });
  if (!res.ok) return null;
  const json = res.json as { sha?: unknown } | null;
  return typeof json?.sha === "string" ? json.sha : null;
}

/** 发布前置断言的 IO 壳：读三处事实 → 交给纯判据 → 不放行就 throw */
async function assertPublishReady(root: string, token: string, remote: GitHubRemote, defaultBranch: string): Promise<void> {
  const remoteHead = await apiBranchHead(token, remote, defaultBranch);
  const verdict = judgePublishReadiness({
    localHead: gitHeadSha(root),
    remoteHead,
    dirtyFiles: gitDirtyTracked(root),
  });
  if (!verdict.ok) throw new Error(verdict.message);
  if (verdict.skipped) console.log(`  ${verdict.skipped}`);
  else console.log(`  ✓ 发布前置断言：本地 HEAD 已推送且工作区干净`);
}

/** 作者面 manifest 摘要——entry 映射所需的字段（name/version 必填由 schema 保证，其余可选） */
export interface ManifestView {
  id: string;
  name: string;
  /** plugin.json 的可选 locales（只收 name/description；publish 原样带进目录条目） */
  locales?: LocaleOverrides;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  iconSource?: string;
  /** E6#106：Type-2 身份彩色图（图标栏插件才有；非图标栏插件 `icon` 即身份图） */
  marketIcon?: string;
  marketIconSource?: string;
  /**
   * 🔴 E6#109p-b（1.28）：**最低宿主版本**——原样带进目录条目（`buildCatalogEntry`）。
   *
   * 修的是 1.27 体检抓到的**空转判据**：市场侧那条「拒装」腿（`marketplace/src/services/marketCatalog/parse.ts`
   * 读 → `useInstallAction.ts` 比对并拒装）**读的是 catalog 条目**，而生产端 `buildCatalogEntry()`
   * **从不写这个键** ⇒ 官方各仓条目 **无一条有**（只有 2 只在 plugin.json 里声明过）⇒ 那条腿永远不触发。
   * ⇒ 本字段补上「manifest → 条目」这一段。⚠️ **存量条目不回溯**：已发布的条目要等各自**下次发布**才带上它。
   * ⚠️ 字段缺省 ⇒ **不写该键**（沿用本仓「缺省即不写」纪律；市场侧对 undefined 天然放行）。
   */
  minAppVersion?: string;
  /**
   * 🔴 R4-0.2（Marketplace-Store v2）：分类声明透传——plugin.json `category`（主分类 slug）与
   * `categories[]`（副标签）复制进目录条目。04-分类体系 §四声明链路的环①→②：分类页/搜索/chips
   * 读的是**目录条目**（插件侧 parse 白名单已收这两键），生产端此前从不写 ⇒ 作者声明了也静默丢
   * （E6#106/E6#77乙 同一类「静默丢」坑）。缺省不写键；存量条目等下次发布带上。
   */
  category?: string;
  categories?: string[];
  /** plugin.json `readme.locales`（语言码 → 相对插件根路径）；publish 映射成 tag 下 raw URL。 */
  readme?: { default?: string; locales?: Record<string, string> };
}

function parseLocaleOverrides(raw: unknown): LocaleOverrides | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: LocaleOverrides = {};
  for (const [lang, fields] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(lang.toLowerCase())) continue;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) continue;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) clean[k] = v.trim();
    }
    if (Object.keys(clean).length) out[lang.toLowerCase()] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

export function collectManifestView(manifest: unknown, sourceDirName: string): ManifestView {
  const id = derivePluginId(manifest, sourceDirName);
  const m = (manifest ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const name = str(m.name) ?? id;
  const version = str(m.version);
  if (!version) throw new Error(`plugin.json 缺 version——publish 以插件版本为 Release tag（v<version>），请先声明 version`);
  return {
    id,
    name,
    version,
    locales: parseLocaleOverrides(m.locales),
    description: str(m.description),
    author: str(m.author),
    icon: str(m.icon),
    iconSource: str(m.iconSource),
    marketIcon: str(m.marketIcon),
    marketIconSource: str(m.marketIconSource),
    // 🔴 E6#109p-b（1.28）：最低宿主版本随条目走——市场「拒装」腿的唯一数据源（见 ManifestView 该字段说明）
    minAppVersion: str(m.minAppVersion),
    // 🔴 R4-0.2：分类声明透传（manifest → 条目；声明链路环①→②，见 ManifestView 该字段说明）
    category: str(m.category),
    categories: Array.isArray(m.categories)
      ? (m.categories.filter((v) => typeof v === "string" && v.trim()) as string[])
      : undefined,
    readme: parseReadmeDecl(m.readme),
  };
}

/** `plugin.json.readme` → { default?, locales? }；非法/空值忽略。 */
function parseReadmeDecl(raw: unknown): { default?: string; locales?: Record<string, string> } | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const def = typeof r.default === "string" && r.default.trim() ? r.default.trim() : undefined;
  const locales: Record<string, string> = {};
  if (r.locales && typeof r.locales === "object" && !Array.isArray(r.locales)) {
    for (const [lang, rel] of Object.entries(r.locales as Record<string, unknown>)) {
      if (typeof rel === "string" && rel.trim()) locales[lang.toLowerCase()] = rel.trim();
    }
  }
  if (!def && !Object.keys(locales).length) return undefined;
  return { ...(def ? { default: def } : {}), ...(Object.keys(locales).length ? { locales } : {}) };
}

/** 条目补充字段——**缺省即不写该键**（字段缺省比填空串/空对象诚实，渲染层两条路走同一兜底） */
export interface CatalogEntryExtras {
  /** 多语言 README —— 语言码 → tag 下 raw URL（由 manifest.readme.locales 映射） */
  readmeLocales?: Record<string, string>;
  /** 未装态 README 远端直链——工程根无 README.md 时缺省（写了必 404） */
  readmeUrl?: string;
  /** 当前版本正文（`CHANGELOG.md` 切段所得）——无文件 / 切不到时缺省 */
  changelog?: string;
  /** P1：本次分发件的 sha256（publish 从**实际上传的字节**算，⛔ 不从磁盘重读——两者必须同一份） */
  sha256?: string;
}

/** 单条 catalog 条目构造——versions[] 只有当前一版（合并时与既有历史拼接）。author 缺失时回落 owner。 */
export function buildCatalogEntry(
  v: ManifestView,
  downloadUrl: string,
  size: number,
  owner: string,
  publishedAt: string,
  extras: CatalogEntryExtras = {},
): CatalogPluginEntry {
  return {
    id: v.id,
    name: v.name,
    ...(v.locales ? { locales: v.locales } : {}),
    version: v.version,
    ...(v.description !== undefined ? { description: v.description } : {}),
    author: { name: v.author ?? owner },
    ...(v.icon !== undefined ? { icon: v.icon } : {}),
    ...(v.iconSource !== undefined ? { iconSource: v.iconSource } : {}),
    // E6#106：身份图随条目——值应为 withCatalogIdentity 转换过的 URL 形态（缺省不写键）
    ...(v.marketIcon !== undefined ? { marketIcon: v.marketIcon } : {}),
    ...(v.marketIconSource !== undefined ? { marketIconSource: v.marketIconSource } : {}),
    // 🔴 E6#109p-b（1.28）：最低宿主版本——**市场「拒装」腿的输入**（缺省不写键，市场侧对 undefined 放行）
    ...(v.minAppVersion !== undefined ? { minAppVersion: v.minAppVersion } : {}),
    // 🔴 R4-0.2：分类声明随条目走（缺省不写键；分类页/搜索/chips 的唯一数据源）
    ...(v.category !== undefined ? { category: v.category } : {}),
    ...(v.categories !== undefined ? { categories: v.categories } : {}),
    ...(extras.readmeUrl !== undefined ? { readmeUrl: extras.readmeUrl } : {}),
    ...(extras.readmeLocales !== undefined ? { readmeLocales: extras.readmeLocales } : {}),
    downloadUrl,
    size,
    publishedAt,
    versions: [
      {
        version: v.version,
        downloadUrl,
        publishedAt,
        ...(extras.changelog !== undefined ? { changelog: extras.changelog } : {}),
        ...(extras.sha256 !== undefined ? { sha256: extras.sha256 } : {}),
      },
    ],
  };
}

/** 建空 catalog（首发的插件仓库无 marketplace.json） */
export function createEmptyCatalog(): MarketplaceCatalog {
  return { version: "1", plugins: [] };
}

/**
 * 合并（纯函数）：把新 entry 合进既有 catalog——同 id 更新（顶层 = 最新 + 历史拼接去重），
 * 异 id 追加；其余插件条目原样保留。返回新对象，不改入参。
 */
export function upsertCatalogEntry(catalog: MarketplaceCatalog, entry: CatalogPluginEntry): MarketplaceCatalog {
  const now = entry.publishedAt ?? new Date().toISOString();
  const next: CatalogPluginEntry[] = catalog.plugins.map((p) => ({ ...p, versions: [...p.versions] }));
  const idx = next.findIndex((p) => p.id === entry.id);
  if (idx < 0) {
    next.push(entry);
  } else {
    const existing = next[idx];
    const history = [
      entry.versions[0],
      ...existing.versions.filter((v) => v.version !== entry.version), // 同版本重发 = 顶掉旧行
    ];
    const merged: CatalogPluginEntry = {
      ...entry,
      // E6#164：历史只带窗口内 N 版的正文（更早版本条目仍全量保留 ⇒ 回装旧版/比版本零损失）
      versions: windowCatalogChangelog(history),
      // 保历史字段：新 manifest 没填的（icon/description 等）回落到旧值，避免发布抖动丢展示数据
      icon: entry.icon ?? existing.icon,
      iconSource: entry.iconSource ?? existing.iconSource,
      // E6#106：身份图同待遇——作者删掉 marketIcon 声明时，不让目录条目跟着塌成剪影
      marketIcon: entry.marketIcon ?? existing.marketIcon,
      marketIconSource: entry.marketIconSource ?? existing.marketIconSource,
      description: entry.description ?? existing.description,
      locales: entry.locales ?? existing.locales,
      category: entry.category ?? existing.category,
      // R4-0.2：分类副标签同待遇（作者漏写 categories 时不抹掉历史值）
      categories: entry.categories ?? existing.categories,
      minAppVersion: entry.minAppVersion ?? existing.minAppVersion,
      // 🔴 媒体/价格/许可 = 作者在 marketplace.json 手改的**目录元数据**（publish 不产出它们）：
      // 不回落 = 下次发版把作者补的截图/封面/价格静默抹掉。⛔ 这不是 publish 拥有的字段。
      authorId: entry.authorId ?? existing.authorId,
      screenshots: entry.screenshots ?? existing.screenshots,
      cover: entry.cover ?? existing.cover,
      license: entry.license ?? existing.license,
      repository: entry.repository ?? existing.repository,
      pricing: entry.pricing ?? existing.pricing,
    };
    next[idx] = merged;
  }
  // 🔴 R4-0.2：**根级字段原样带过**（sources/collections/categoryRail 及任何未知根键）——publish 只拥有
  //  version/updatedAt/plugins 三键；此前整根重建会把官方目录仓根级的 `sources`/`collections` 等静默抹掉
  //  （目录仓 v2 骨架 R4-0.3 恰恰往根上放这些键，下次收录发布就会丢——先例级坑，同笔修）。
  return { ...catalog, version: catalog.version ?? "1", updatedAt: now, plugins: next };
}

/** release tag = v{version} */
export function releaseTagForVersion(version: string): string {
  return `v${version}`;
}

/** asset 名 = <id>.linkdesk-plugin（对齐 build 分发件命名） */
export function assetNameForId(id: string): string {
  return `${id}.linkdesk-plugin`;
}

/** Release asset 直链——GitHub 固定形态，无需等上传响应回读 */
export function releaseDownloadUrl(remote: GitHubRemote, tag: string, assetName: string): string {
  return `https://github.com/${remote.owner}/${remote.repo}/releases/download/${tag}/${assetName}`;
}

/* ── AI#51：资产版本**源头断言**（发版三轴纪律的硬闸）──────────────────────
 *
 * 病根（2026-09-29 会话 11 实测立案）：publish **不 build、复用 dist 现成分发件** ⇒ 四仓首发
 * 资产全部 stale（settings 包里缺整个 1.0.22 功能）——tag 对、包内容错，错误活到消费侧
 * （`sync:bundled` 下游闸）才被看见 ⇒ 整批删 release 重发 ≈ 35 分钟。
 *
 * 本断言把检查点挪到**上传之前**（`collectPreview` 内、任何网络触碰之前 ⇒ 秒级红）：
 *   ① 分发件 zip 内 `plugin.json` 的 `version` 必须 == 本次 Release 版本（`plugin.json` = 发布号真源，
 *      记忆 `plugin-json-version-is-release-source`）——build 忘跑 / 改版没重 build 当场拦；
 *   ② 分发件必须**新鲜**：mtime 不早于 `plugin.json` / `package.json` / `src/**` 里最新一次变更
 *      ——源码改过而 asset 没重打，发出去就是 stale 代码。
 * 逃逸口 = `publish --force-build`（bin 层先跑本 SDK 的 build 再进 publish，见 bin.ts）。
 */

/** 读分发件 zip 顶部的 `plugin.json`（loader 解压期待它在顶，E6#7 契约）并取 `version`。
 *  解析走 jsonc-parser（与 validate/packager 同一读取口径——dist manifest 是 JSON，
 *  纯数据包通道拷的是作者原件、可能是 JSONC）。读不到 / 解析不出 version → null（由断言判红）。 */
export async function readAssetManifestVersion(assetPath: string): Promise<string | null> {
  const zip = await JSZip.loadAsync(readFileSync(assetPath));
  const entry = zip.file("plugin.json");
  if (!entry) return null;
  const text = await entry.async("string");
  const errors: jsonc.ParseError[] = [];
  const parsed = jsonc.parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as
    | { version?: unknown }
    | undefined;
  if (errors.length > 0) return null;
  return typeof parsed?.version === "string" ? parsed.version : null;
}

/** `root` 下「参与构建的源」的最新 mtime——`plugin.json` / `package.json` ＋ `src/**`（存在才计入）。
 *  返回 null = 一个候选都没有（不构成 freshness 断言的输入）。只取 mtime，不读内容。 */
export function newestSourceMtime(root: string): number | null {
  let newest: number | null = null;
  const consider = (p: string): void => {
    const m = statSync(p).mtimeMs;
    if (newest === null || m > newest) newest = m;
  };
  for (const name of ["plugin.json", "package.json"]) {
    const p = join(root, name);
    if (existsSync(p)) consider(p);
  }
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else consider(full);
    }
  };
  const srcDir = join(root, "src");
  if (existsSync(srcDir)) walk(srcDir);
  return newest;
}

/** AI#51 断言本体：分发件「版本对 ＋ 新鲜」才放行上传。任何一条不满足 = 中文可读错误（秒级红，
 *  EXIT≠0，资产**不会**出现在任何 Release 上——此函数只在 `collectPreview` 里跑、网络调用之前）。 */
export async function assertAssetCurrent(root: string, assetPath: string, releaseVersion: string): Promise<void> {
  const assetName = basename(assetPath);
  const zipVersion = await readAssetManifestVersion(assetPath);
  if (zipVersion === null) {
    throw new Error(
      `分发件 ${assetName} 里读不到 plugin.json（或其 version）——这不是 build 产物。` +
        `先跑 npm run build（= linkdesk-plugin-sdk build）重新产出再 publish`,
    );
  }
  if (zipVersion !== releaseVersion) {
    throw new Error(
      `资产内 plugin.json 版本 ${zipVersion} ≠ Release 版本 ${releaseVersion}——分发件是旧构建` +
        `（SDK publish 不 build、复用 dist 现成分发件）。先 npm run build 再 publish（或用 publish --force-build）`,
    );
  }
  const newest = newestSourceMtime(root);
  if (newest !== null && newest > statSync(assetPath).mtimeMs) {
    throw new Error(
      `分发件 ${assetName} 比源码旧（plugin.json / package.json / src/ 在 build 之后又改过）——` +
        `发出去就是 stale 资产。先 npm run build 再 publish（或用 publish --force-build）`,
    );
  }
}

/** 未装插件读 README 的远端直链（E6#91c）——**用 tag 不用 default_branch**：这条 URL 与打进 zip 的
 *  那份 README 同源（同一 commit）；用 main 会让「未装浏览者看到的」与「装上后看到的」是两份内容。 */
export function readmeRawUrl(remote: GitHubRemote, tag: string): string {
  return `https://raw.githubusercontent.com/${remote.owner}/${remote.repo}/${tag}/README.md`;
}

/** 任意随包文件 → tag 下 raw 直链（多语言 README 用；路径保持正斜杠）。 */
export function rawTagUrl(remote: GitHubRemote, tag: string, rel: string): string {
  return `https://raw.githubusercontent.com/${remote.owner}/${remote.repo}/${tag}/${rel.replace(/^\/+/, "")}`;
}

/** E6#106：**包内相对路径 → 远端 raw 直链**（本仓唯一一处 URL 构造——与 readmeRawUrl 同 tag 同形态）。
 *
 *  为什么必须 URL 化（否则市场那一半永远好不了）：目录条目里的 `icon: "resources/icon.svg"` 是**包内**路径，
 *  消费端 `resolvePluginIcon` 只能把它拼成 `linkdesk://<插件id>/resources/icon.svg`——该协议只在**本地已装**
 *  的插件根里找文件。于是**插件没装时市场行图标恒 404**（用户看到的「卸掉之后图标就没了」即此）。
 *  线上 `first-run-setup` 那条手写条目用的是绝对 URL + `iconSource:"url"`，形态早就对——本函数把这条形态
 *  变成 publish 自动行为（作者零声明）。
 *
 *  ⚠️ 只服务**包内资产路径**；`lucide`/`codicon` 名与作者自填的 http(s) URL 不走这里（见 withCatalogIdentity）。 */
export function assetRawUrl(remote: GitHubRemote, tag: string, relPath: string): string {
  return `https://raw.githubusercontent.com/${remote.owner}/${remote.repo}/${tag}/${relPath.replace(/^\.?\//, "")}`;
}

/** 判「这个值是不是包内资产路径」——判据与消费端 `resolvePluginIcon`（src/components/shared/plugin-icon/
 *  iconUtils.ts，@linkdesk/ui）**逐字对齐**：含 `/` 或 `.` ⇒ 按路径推断；否则按 codicon 名。
 *  两处判据必须同一套，否则会出现「SDK 当图标名发出去、市场当路径收」这类两侧各自自洽的错。 */
function looksLikeAssetPath(value: string): boolean {
  return value.includes("/") || value.includes(".");
}

/**
 * E6#106：目录条目身份字段裁决——把作者在 `plugin.json` 里的声明转成**未装态可解析的形态**。
 *
 * 三档（与作者面文档「零图 / 一张 icon / 可选 marketIcon」三档契约同构）：
 *   - 作者自填 http(s) 绝对 URL → 原样留，**补 `iconSource:"url"`**（不补会被当包内路径拼成 linkdesk://，
 *     已由 `resolvePluginIcon` 的推断规则决定，故必须显式）。
 *   - 包内相对路径（`resources/icon.svg`）→ `assetRawUrl(...)` 转绝对 URL + `iconSource:"url"`。
 *   - `lucide` / `codicon` 图标名 → **原样留**（消费端白名单/codicon 字体渲染）；作者声明的 iconSource 照带，
 *     声明缺省也照缺省（消费端按值推断，两处判据同源）。
 *   - 无值 → **不写该键**（沿用本仓「缺省即不写该键」纪律）。
 */
export function withCatalogIdentity(v: ManifestView, remote: GitHubRemote, tag: string): ManifestView {
  const resolve = (value?: string, source?: string): { value?: string; source?: string } => {
    if (value === undefined) return {};
    if (/^https?:\/\//i.test(value)) return { value, source: "url" };
    if (looksLikeAssetPath(value)) return { value: assetRawUrl(remote, tag, value), source: "url" };
    return { value, source };
  };
  const icon = resolve(v.icon, v.iconSource);
  const marketIcon = resolve(v.marketIcon, v.marketIconSource);
  return {
    ...v,
    ...(icon.value !== undefined ? { icon: icon.value, iconSource: icon.source } : {}),
    ...(marketIcon.value !== undefined ? { marketIcon: marketIcon.value, marketIconSource: marketIcon.source } : {}),
  };
}

/** 去版本号前导 `v`——段标题与 plugin.json 两侧同规则，免「v1.0.0 vs 1.0.0」假不等 */
function stripLeadingV(s: string): string {
  return /^[vV]/.test(s) ? s.slice(1) : s;
}

/** 段标题——`## v1.0.0` / `## 1.0.0` / `## [1.0.0] - 2026-09-11`（Keep a Changelog）/ `## v1.0.0-beta.1` 全认。
 *  ① `#{2,4}`：`##` 常规，容忍 `###`/`####`；**一级 `#` 不算**（那是文档标题「# 更新日志」）。
 *  ② `\[?…\]?`：容忍一对可选方括号——Keep a Changelog 是最流行的约定，作者不该为适配解析器改习惯。
 *  ③ 版本段整段捕获（含 prerelease/build 后缀）——只捕 `\d+.\d+.\d+` 会把 `1.0.0-beta.1` 截成 `1.0.0`，与真有的 `1.0.0` 段撞号。
 *  ④ 尾部否定前瞻 `(?![0-9A-Za-z.-])`：防 `1.0.0` 吃掉 `1.0.01` 的前缀。中文全角括号天然通过（不在否定类里）。 */
const CHANGELOG_HEADING = /^#{2,4}\s+\[?[vV]?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\]?(?![0-9A-Za-z.-])/;

/** 围栏代码块起止行（``` / ~~~，允许缩进）。块内的 `## v1.0.0` 是示例文本不是段标题——误判会把它当更新说明 */
const FENCE_LINE = /^\s*(?:```|~~~)/;

/**
 * 从 `CHANGELOG.md` 原文切出指定版本的正文（E6#91c）。**纯函数、零 IO**——publish 内可直测。
 *
 * 返回**该版本段标题之下、下一个段标题之前**的正文（`trim` 后）；**切不到 / 正文为空 → `undefined`**
 * （诚实留空，不猜——渲染层已有「此版本未提供变更说明」兜底）。**绝不回落到「取第一段」**：那会把上一版
 * 的说明挂到新版本上，是**发错信息**（同 marketCatalog/select.ts「不发错包」的既有纪律）。
 *
 * 版本相等判据 = 去 `v` 后**字符串严格相等**，不做 semver 松弛匹配（`1.0.0` ≠ `1.0`）——目录条目版本号与
 * `plugin.json.version` 本就该逐字相同，松弛只会掩盖作者写错。
 */
export function sliceChangelogSection(text: string, version: string): string | undefined {
  const src = text.replace(/^\uFEFF/, ""); // BOM 剥离——记事本存过就带，不剥会让首行匹配位移
  const lines = src.split(/\r?\n/); // CRLF 兼容（本仓 Windows 开发，多份文档实测 CRLF）
  const target = stripLeadingV(version);

  let inFence = false;
  let start = -1; // 正文起始行（段标题的下一行）
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (FENCE_LINE.test(line)) {
      inFence = !inFence; // 开/闭同一判定——只关心奇偶
      continue;
    }
    if (inFence) continue; // 围栏块内一律不看

    const m = CHANGELOG_HEADING.exec(line);
    if (!m) continue;
    if (start < 0) {
      // 取第一个匹配段（同版本出现多次 = 取最新那段，「最新在最上」是格式约定）
      if (stripLeadingV(m[1] ?? "") === target) start = i + 1;
    } else {
      end = i; // 正文到下一个段标题为止
      break;
    }
  }

  if (start < 0) return undefined;
  const body = lines.slice(start, end).join("\n").trim();
  return body === "" ? undefined : body;
}

/* ── E6#164：分发面 changelog 窗口（目录 ＋ zip 共用一处判据）───────────────
 *
 * 病根：同一批散文同时住在三个分发面上，而**只有仓库文件是免费的**——
 *   市场目录 `versions[].changelog`（每个用户每次「检查更新」全量下载，实测目录 193 KB
 *   里 38.1% 是散文、≈9.2 KB/天且无上限）＋ 插件 zip 内 `CHANGELOG.md`（每次安装/更新
 *   下载并常驻，marketplace 包实测占 24.3%）。壳侧三个面（安装包白名单 / npm `files`
 *   白名单 / Release 每版独立）早已按行业正解做完，缺的就是这里一条窗口。
 *
 * 口径（2026-10-01 用户拍板）：**只带最近 N 版正文，更早版本仍保留版本条目**——回装旧版、
 * 比版本号的能力零损失（读侧对缺 `changelog` 的条目早有「未提供」兜底）。
 * 权衡与边界见 docs/02-Electron架构/插件生态与发布/01-插件独立构建/
 * 15-变更日志膨胀与分发面裁剪-立案与设计前置.md。
 */

/** 分发面 changelog 窗口大小——**唯一常量**（目录窗口与 zip 窗口同源，⛔ 不许各写一份）。
 *  编译期常量、⛔ 不是用户设置项：否则每个用户的目录形状互不相同 = 平台常量变成用户态漂移。 */
export const CHANGELOG_WINDOW = 5;

/**
 * 按段标题切分（纯函数、零 IO）——`head` = 第一个段标题**之前**的行（文件标题/说明），
 * `sections` = 逐段（含各自段标题行）。判据与 `sliceChangelogSection` **同一套**
 * （`CHANGELOG_HEADING` ＋ 围栏感知），⛔ 不许另写一份正则——两处判据分叉 = 窗口切掉的
 * 与读侧认得的不是同一批段。
 */
function splitChangelogSections(text: string): { head: string[]; sections: string[][] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/); // BOM 剥离 + CRLF 兼容（同 sliceChangelogSection）
  const head: string[] = [];
  const sections: string[][] = [];
  let cur: string[] | null = null;
  let inFence = false;
  for (const line of lines) {
    if (!inFence && CHANGELOG_HEADING.test(line)) {
      cur = [line];
      sections.push(cur);
      continue;
    }
    if (FENCE_LINE.test(line)) inFence = !inFence; // 围栏块内的段标题是示例文本，不算段
    (cur ?? head).push(line);
  }
  return { head, sections };
}

/**
 * 只留最近 N 版段落（纯函数、零 IO）——给 zip 用（包内 `CHANGELOG.md` 那一条）。
 *
 * 三条「不猜」纪律：① **段数在窗口内 ⇒ 原文逐字节返回**（含 BOM，一个字节都不动）；
 * ② **认不出段标题（自由格式）⇒ 原文返回**——作者写成什么样就什么样，⛔ 不裁不猜；
 * ③ 段与段之间的空行随**前一段**走（新段从标题行起算）⇒ 丢弃第 N+1 段时不会留下孤零零的间隔。
 */
export function windowChangelogText(text: string, window = CHANGELOG_WINDOW): string {
  const { head, sections } = splitChangelogSections(text);
  if (sections.length <= window) return text;
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  return bom + [...head, ...sections.slice(0, window)].flat().join("\n").trimEnd() + "\n";
}

/**
 * 目录条目窗口（纯函数、零 IO）——给 `versions[]` 用：只保留**最近 N 版条目的 `changelog`**，
 * 更早条目**只剥这一个键**（键整个不留，⛔ 不写空串——「缺字段」比「空值」诚实，读侧同一路兜底）。
 *
 * ⚠️ **倒序假设**：目录 `versions[]` 规约 = 最新在前（见模块头 §3.2）⇒ 窗口按数组序取前 N 条。
 * 其余字段（version / downloadUrl / publishedAt 及将来新增的）**一律原样保留**——用展开＋删键
 * 而不是逐字段重建，为的是「将来给条目加字段时，老版本条目不会被静默剥掉」。
 */
export function windowCatalogChangelog(versions: CatalogVersion[], window = CHANGELOG_WINDOW): CatalogVersion[] {
  return versions.map((v, i) => {
    if (i < window || v.changelog === undefined) return v;
    const rest: CatalogVersion = { ...v };
    delete rest.changelog;
    return rest;
  });
}

/* ── GitHub REST 操作（github-http.ts 之上的领域调用）────────────────── */

interface RepoInfo {
  defaultBranch: string;
}

async function apiGetRepo(token: string, remote: GitHubRemote): Promise<RepoInfo> {
  const res = await ghHttp({ token, api: "api", path: `/repos/${remote.owner}/${remote.repo}` });
  if (!res.ok) {
    if (res.status === 401) throw new Error("GitHub token 无效或无权访问——请检查 PAT（需 repo 权限）");
    if (res.status === 404) throw new Error(`仓库 ${remote.owner}/${remote.repo} 不存在或当前 token 不可见——确认已 push 到 GitHub 且仓库为 public 或 token 有权限`);
    throw new Error(`读取仓库信息失败（${res.status}）：${ghErrorDetail(res)}`);
  }
  const json = res.json as { default_branch?: unknown } | null;
  return { defaultBranch: typeof json?.default_branch === "string" ? json.default_branch : "main" };
}

/** 查 Release 是否已存在（GET releases/tags/{tag}；404 = 没有） */
async function apiReleaseExists(token: string, remote: GitHubRemote, tag: string): Promise<boolean> {
  const res = await ghHttp({ token, api: "api", path: `/repos/${remote.owner}/${remote.repo}/releases/tags/${encodeURIComponent(tag)}` });
  return res.ok;
}

/** 建 Release → 返回 release id */
async function apiCreateRelease(
  token: string,
  remote: GitHubRemote,
  tag: string,
  name: string,
  body: string,
  prerelease: boolean,
): Promise<number> {
  const res = await ghHttp({
    token,
    api: "api",
    method: "POST",
    path: `/repos/${remote.owner}/${remote.repo}/releases`,
    body: JSON.stringify({ tag_name: tag, name, body, draft: false, prerelease }),
  });
  if (!res.ok) {
    if (res.status === 422) throw new Error(`创建 Release v${tag} 被拒（422）——tag 可能已被占用：${ghErrorDetail(res)}`);
    throw new Error(`创建 Release 失败（${res.status}）：${ghErrorDetail(res)}`);
  }
  const json = res.json as { id?: unknown } | null;
  const id = json?.id;
  if (typeof id !== "number") throw new Error(`创建 Release 响应缺 id：${res.text.slice(0, 200)}`);
  return id;
}

/** 上传 asset（直链走固定形态 releaseDownloadUrl，无需读响应） */
async function apiUploadAsset(
  token: string,
  remote: GitHubRemote,
  releaseId: number,
  assetName: string,
  data: Buffer,
): Promise<void> {
  const res = await ghHttp({
    token,
    api: "uploads",
    method: "POST",
    path: `/repos/${remote.owner}/${remote.repo}/releases/${releaseId}/assets`,
    query: `name=${encodeURIComponent(assetName)}`,
    headers: { "Content-Type": "application/zip" },
    body: data,
  });
  if (!res.ok) {
    throw new Error(`上传 ${assetName} 失败（${res.status}）：${ghErrorDetail(res)}`);
  }
}

/** Contents 读：取 marketplace.json 的 sha + 解码内容；404 → null（首次发布无目录文件） */
async function apiReadCatalog(token: string, remote: GitHubRemote): Promise<{ sha: string; catalog: MarketplaceCatalog } | null> {
  const res = await ghHttp({
    token,
    api: "api",
    path: `/repos/${remote.owner}/${remote.repo}/contents/marketplace.json`,
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取 marketplace.json 失败（${res.status}）：${ghErrorDetail(res)}`);
  const json = res.json as { sha?: unknown; content?: unknown } | null;
  const sha = json?.sha;
  const content = json?.content;
  if (typeof sha !== "string" || typeof content !== "string") {
    throw new Error(`marketplace.json 响应异常（缺 sha/content）：${res.text.slice(0, 200)}`);
  }
  const decoded = Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
  let catalog: MarketplaceCatalog;
  try {
    const parsed = JSON.parse(decoded) as MarketplaceCatalog;
    if (!parsed || !Array.isArray(parsed.plugins)) throw new Error("plugins 数组缺失");
    catalog = parsed;
  } catch (e) {
    throw new Error(`现有 marketplace.json 解析失败（可能被手改坏）：${e instanceof Error ? e.message : String(e)}`);
  }
  return { sha, catalog };
}

/** Contents 写：PUT base64 内容（带 sha 覆盖 / 无 sha 新建）。走仓库默认分支。 */
async function apiWriteCatalog(token: string, remote: GitHubRemote, id: string, sha: string | null, catalog: MarketplaceCatalog): Promise<void> {
  await apiWriteContents(token, remote, "marketplace.json", `${JSON.stringify(catalog, null, 2)}\n`, sha, `publish ${id} (marketplace.json)`, "marketplace.json");
}

/** Contents 读 sha（v2 侧车文件覆盖写用）——404 → null（首次写）；非 404 失败抛错 */
async function apiReadContentsSha(token: string, remote: GitHubRemote, path: string): Promise<string | null> {
  const res = await ghHttp({
    token,
    api: "api",
    path: `/repos/${remote.owner}/${remote.repo}/contents/${path}`,
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取 ${path} 失败（${res.status}）：${ghErrorDetail(res)}`);
  const sha = (res.json as { sha?: unknown } | null)?.sha;
  if (typeof sha !== "string") throw new Error(`${path} 响应异常（缺 sha）：${res.text.slice(0, 200)}`);
  return sha;
}

/** Contents 写通用形（v2 authors/collections 与 marketplace.json 共用一份实现——⛔ 不开第二份 PUT） */
async function apiWriteContents(
  token: string,
  remote: GitHubRemote,
  path: string,
  content: string,
  sha: string | null,
  message: string,
  label: string,
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
  };
  if (sha) body.sha = sha;
  const res = await ghHttp({
    token,
    api: "api",
    method: "PUT",
    path: `/repos/${remote.owner}/${remote.repo}/contents/${path}`,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error(`${label} 写冲突（409）——远端刚被改动，重跑一次 publish 即可`);
    throw new Error(`更新 ${label} 失败（${res.status}）：${ghErrorDetail(res)}`);
  }
}

/* ── publish v2（R4-4.5）：marketplace.config.json → authors/ ＋ collections/ ────────── */

/**
 * 发布侧作者声明（`marketplace.config.json`，init 生成骨架；正典 09 §九·9.1/9.2）。
 * 已知键 = 作者块白名单透传（publicKey 由付费作者指南 K10b 写法灌入——keygen 产出）；
 * 未知键**警告不拦**（config 是作者私产，但拼错键等于意图静默丢失——预览里必须可见）。
 */
export interface MarketplacePublishConfig {
  authorId?: string;
  name?: string;
  avatar?: string;
  introImage?: string;
  intro?: string;
  storeTitle?: string;
  publicKey?: string;
  locales?: LocaleOverrides;
  homepage?: AuthorBlock["homepage"];
  collections?: CollectionDecl[];
}

const PUBLISH_CONFIG_KEYS = new Set<string>(["authorId", "name", "avatar", "introImage", "intro", "storeTitle", "publicKey", "locales", "homepage", "collections"]);
const PUBLISH_CONFIG_STRINGS = ["authorId", "name", "avatar", "introImage", "intro", "storeTitle", "publicKey"] as const;

export interface ReadPublishConfigResult {
  config: MarketplacePublishConfig;
  /** 拼错/不认识的顶层键——预览里点名（⛔ 静默丢配置键 = 作者意图丢失） */
  unknownKeys: string[];
}

/** 读工程根 marketplace.config.json——不存在 → null（纯 v1 作者，行为零变化） */
export function readPublishConfig(root: string): ReadPublishConfigResult | null {
  const path = join(root, "marketplace.config.json");
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`marketplace.config.json 不是合法 JSON（修好再发）：${e instanceof Error ? e.message : String(e)}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("marketplace.config.json 必须是 JSON 对象");
  }
  const obj = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(obj).filter((k) => !PUBLISH_CONFIG_KEYS.has(k));
  for (const key of PUBLISH_CONFIG_STRINGS) {
    if (obj[key] !== undefined && typeof obj[key] !== "string") {
      throw new Error(`marketplace.config.json 的 "${key}" 必须是字符串`);
    }
  }
  if (obj.homepage !== undefined && (typeof obj.homepage !== "object" || obj.homepage === null)) {
    throw new Error('marketplace.config.json 的 "homepage" 必须是对象（{ sections: [...] }）');
  }
  if (obj.collections !== undefined && !Array.isArray(obj.collections)) {
    throw new Error('marketplace.config.json 的 "collections" 必须是数组');
  }
  const config = obj as unknown as MarketplacePublishConfig;
  // 合集 id 形状与唯一性——publish 不写垃圾（市场靠 id 引用，重复 id = 谁覆盖谁说不清）
  const seen = new Set<string>();
  for (const c of config.collections ?? []) {
    if (!c || typeof c.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(c.id)) {
      throw new Error(`marketplace.config.json 的合集 id 非法（须 [a-z][a-z0-9-]*）：${JSON.stringify((c as { id?: unknown })?.id)}`);
    }
    if (seen.has(c.id)) throw new Error(`marketplace.config.json 合集 id 重复：${c.id}`);
    seen.add(c.id);
    if (!Array.isArray(c.items) || c.items.length === 0) {
      throw new Error(`合集 "${c.id}" 缺 items（成员 pluginId 数组，至少 1 项）`);
    }
  }
  return { config, unknownKeys };
}

/** 本仓 marketplace.json 的 raw 直链（作者块 repos 段的 sourceUrl——市场仓切换的拉取目标） */
export function catalogRawUrl(remote: GitHubRemote): string {
  return `https://raw.githubusercontent.com/${remote.owner}/${remote.repo}/HEAD/marketplace.json`;
}

/** config → 作者块（09 §9.2「以作者 config 为准」；repos = 本仓段——每仓一份块、同 authorId 聚合） */
export function buildAuthorBlockFromConfig(config: MarketplacePublishConfig, remote: GitHubRemote): AuthorBlock {
  if (!config.authorId) throw new Error("buildAuthorBlockFromConfig 需要 config.authorId（调用方先判空）");
  return {
    authorId: config.authorId,
    name: config.name ?? config.authorId,
    ...(config.avatar ? { avatar: config.avatar } : {}),
    ...(config.introImage ? { introImage: config.introImage } : {}),
    ...(config.intro ? { intro: config.intro } : {}),
    ...(config.storeTitle ? { storeTitle: config.storeTitle } : {}),
    ...(config.locales ? { locales: config.locales } : {}),
    ...(config.publicKey ? { publicKey: config.publicKey } : {}),
    repos: [{ id: "main", name: remote.repo, sourceUrl: catalogRawUrl(remote) }],
    ...(config.homepage ? { homepage: config.homepage } : {}),
  };
}

export interface PublishFileWrite {
  path: string;
  content: string;
}

/** config.collections → 逐合集文件写入清单（`collections/<id>.json`）。
 *  🔴 拆分写法的市场侧**读取入口 = 根 marketplace.json `collections[]` 里的字符串 id 引用**
 *  （R4-4.5 同笔拍板——本函数不产 index.json：市场按「根里有字符串引用才去拉对应文件」工作，
 *  v1 目录零探针、零新增请求；字符串形态与 inline 对象形态在**同一字段**两读，06 §二·3b）。 */
export function buildCollectionFiles(config: MarketplacePublishConfig): PublishFileWrite[] {
  return (config.collections ?? []).map((c) => ({
    path: `collections/${c.id}.json`,
    content: `${JSON.stringify(c, null, 2)}\n`,
  }));
}

/** config.collections 非空 ⇒ 根 `collections[]` 写成**字符串 id 引用**（市场侧据此拉文件夹文件）。
 *  config 没声明合集 ⇒ 原样带过（作者手写的 inline 合集不受 publish 打扰）。 */
export function collectionsRootRefs(config: MarketplacePublishConfig): string[] | null {
  const collections = config.collections ?? [];
  return collections.length > 0 ? collections.map((c) => c.id) : null;
}

/* ── 编排 ─────────────────────────────────────────────────────────────── */

export interface PublishPreview {
  id: string;
  name: string;
  version: string;
  /** 完整 manifest 摘要——marketplace 条目构建数据源 */
  view: ManifestView;
  assetName: string;
  assetPath: string;
  sizeBytes: number;
  remote: GitHubRemote;
  tag: string;
  releaseName: string;
  prerelease: boolean;
  /** 未装态 README 远端直链——工程根无 `README.md` → 缺省（不写，写了必 404；见 §三.3 边界表） */
  readmeUrl?: string;
  /** 多语言 README（语言码 → tag 下 raw URL）；manifest.readme.locales 非空时写 */
  readmeLocales?: Record<string, string>;
  /** 当前版本正文——`CHANGELOG.md` 切段所得；无文件 / 切不到该版本 → 缺省（诚实留空，不猜） */
  changelog?: string;
  /** publish v2：工程根 marketplace.config.json（缺 → null = 纯 v1 发布，行为零变化） */
  publishConfig: MarketplacePublishConfig | null;
  /** config 里拼错/不认识的顶层键——预览点名（拼错键 = 作者意图静默丢失） */
  unknownConfigKeys: string[];
}

async function collectPreview(root: string): Promise<PublishPreview> {
  const pluginJsonPath = join(root, "plugin.json");
  if (!existsSync(pluginJsonPath)) {
    throw new Error(`当前目录不是插件工程——找不到 ${pluginJsonPath}。请 cd 进插件项目根再跑 linkdesk-plugin-sdk publish`);
  }
  const manifest = readPluginManifest(pluginJsonPath);
  // 发布前硬闸：声明了语言就必须每条显示文本都有译文。缺一条，装到英文界面就是中文混排；
  // 作者不想翻译可以删语言声明——自由仍在，但「声明了却只翻一半」不能静默发出去。
  const i18nCheck = checkManifestI18n(root);
  if (i18nCheck.problems.length || i18nCheck.missing.length) {
    const detail = [
      ...i18nCheck.problems.map((p) => `  - ${p}`),
      ...i18nCheck.missing.slice(0, 30).map((m) => `  - ${formatMissingTranslation(m)}`),
      ...(i18nCheck.missing.length > 30 ? [`  … 另有 ${i18nCheck.missing.length - 30} 条`] : []),
    ].join("\n");
    throw new Error(
      `manifest 显示文本 i18n 不完整，拒绝发布：\n${detail}\n` +
        `修法：把中文原文作为 key 补进每种声明语言的字典；不想翻译就删掉对应语言声明。`,
    );
  }
  const view = collectManifestView(manifest, basename(resolve(root)));
  const assetName = assetNameForId(view.id);
  const assetPath = join(root, assetName);
  if (!existsSync(assetPath)) {
    throw new Error(`找不到分发件 ${assetName}——先跑 npm run build（= linkdesk-plugin-sdk build）产出 .linkdesk-plugin 再发布`);
  }
  // AI#51 源头断言——在一切网络触碰之前跑（秒级红）：版本对不上 / 比源码旧 = 拦下，别让 stale
  // 资产活着上 Release（会话 11 四仓 stale 实测的检查点缺位，就补在这里）
  await assertAssetCurrent(root, assetPath, view.version);
  const remoteUrl = gitRemoteOrigin(root);
  const remote = parseGitHubRemote(remoteUrl);
  if (!remote) {
    throw new Error(`origin 不是 github.com 仓库（当前：${remoteUrl}）。发布目标 = 工程 origin 的 GitHub Releases + marketplace.json，多市场源模型仅支持 github.com`);
  }
  const tag = releaseTagForVersion(view.version);

  // 未装态两个展示字段——**本层 3.7.2 接通的两处写入方**（此前读取方早已写好、只差这两行）：
  // `readmeUrl` = 未装详情页 README 远端源；`changelog` = 未装「更改日志」页签的逐版正文。
  // 两者都**缺省即不写**——不写是本函数要表达的诚实（写了 404 / 写空串都是骗人）。
  const changelogPath = join(root, "CHANGELOG.md");
  const v2 = readPublishConfig(root);
  return {
    id: view.id,
    name: view.name,
    version: view.version,
    view,
    assetName,
    assetPath,
    sizeBytes: statSync(assetPath).size,
    remote,
    tag,
    releaseName: `${view.name} v${view.version}`,
    prerelease: view.version.includes("-"),
    ...(existsSync(join(root, "README.md")) ? { readmeUrl: readmeRawUrl(remote, tag) } : {}),
    ...(view.readme?.locales
      ? {
          readmeLocales: Object.fromEntries(
            Object.entries(view.readme.locales).map(([lang, rel]) => [lang, rawTagUrl(remote, tag, rel)]),
          ),
        }
      : {}),
    ...(existsSync(changelogPath) ? { changelog: sliceChangelogSection(readFileSync(changelogPath, "utf8"), view.version) } : {}),
    publishConfig: v2?.config ?? null,
    unknownConfigKeys: v2?.unknownKeys ?? [],
  };
}

/** E6#106：发布预览里那行「市场行会显哪张图」——把三档契约在发布前摊开（缺身份图不是错误，
 *  但作者有权先知道「我这只插件在市场里会显默认彩块」）。 */
function identityOf(view: ManifestView, remote: GitHubRemote, tag: string): string {
  const v = withCatalogIdentity(view, remote, tag);
  if (v.marketIcon) return `✓ 身份图 marketIcon（Type-2，市场行/详情顶显这张）`;
  if (v.icon) return `✓ icon（非图标栏插件：icon 即身份图，市场行显它）`;
  return "✗ 未声明图标 → 市场落统一默认彩色块（零图可发，可接受）";
}

function renderPreview(p: PublishPreview): string {
  const lines = [
    "",
    "  ┌─ 发布预览 ──────────────────────────────",
    `  │ 插件      : ${p.name}  v${p.version}${p.prerelease ? "（prerelease）" : ""}  (${p.id})`,
    `  │ 作者      : ${p.view.author ?? p.remote.owner}`,
    `  │ 分发件    : ${p.assetName}（${(p.sizeBytes / 1024).toFixed(1)} KB）`,
    `  │ 目标仓库  : github.com/${p.remote.owner}/${p.remote.repo}（来自 git origin）`,
    `  │ 发布号    : ${p.tag}`,
    `  │ 未装展示  : README ${p.readmeUrl ? "✓ 已随条目（远端直链）" : "✗ 工程根无 README.md → 不写 readmeUrl"}`,
    `  │             日志 ${p.changelog ? `✓ 已切出 v${p.version} 正文（${p.changelog.split("\n").length} 行）` : `✗ 工程根 CHANGELOG.md 无 v${p.version} 段 → 不写 changelog`}`,
    // E6#106：把「市场行会显哪张图」在发布前摊开——身份图缺失是可发布但会显默认彩块的状态，作者有权先知道
    `  │             图标 ${identityOf(p.view, p.remote, p.tag)}`,
    ...(p.publishConfig
      ? [
          `  │ v2 作者面 : ${p.publishConfig.authorId ? `authors/${p.publishConfig.authorId}.json（作者块以 config 为准）` : "config 缺 authorId → 不写作者块"}` +
            `；合集 ${p.publishConfig.collections?.length ?? 0} 件（collections/<id>.json＋根级字符串引用）`,
          ...(p.publishConfig.publicKey ? [] : ["  │             （config 无 publicKey——付费插件先跑 `marketplace-kit keygen` 再填进 config，见付费作者指南）"]),
          ...(p.unknownConfigKeys.length > 0 ? [`  │ ⚠️ config 未知键（拼错？）: ${p.unknownConfigKeys.join(", ")}——这些键会被忽略`] : []),
        ]
      : ["  │ v2 作者面 : 工程根无 marketplace.config.json → 仅 v1 条目（想要作者主页/合集：marketplace-kit init）"]),
    "  │ 将做      : 创建 GitHub Release → 上传 asset → 更新该仓库根 marketplace.json（＋v2 作者面文件，如有）",
    "  └─────────────────────────────────────────",
  ];
  return lines.join("\n");
}

/** 确认：--yes 跳过；非 TTY 无 --yes → throw（防静默发布） */
async function confirmPublish(yes?: boolean): Promise<void> {
  if (yes) return;
  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isTty) throw new Error("非交互终端发布需加 --yes 确认（或先 --dry-run 预览）");
  process.stdout.write("  发布以上内容到 GitHub？[y/N] ");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question("", (a) => res(a.trim().toLowerCase())));
  rl.close();
  if (answer !== "y" && answer !== "yes") throw new Error("已取消");
}

/**
 * 跑发布。返回退出码（0 成功 / 1 失败）。所有失败 throw；bin catch 打印统一前缀。
 */
export async function runPluginPublish(root: string, opts: PublishOptions = {}): Promise<number> {
  const preview = await collectPreview(root);
  process.stdout.write(renderPreview(preview) + "\n");

  if (opts.dryRun) {
    console.log("  --dry-run：以上为将执行的动作，未调用 GitHub（无网络/token 触碰）。");
    return 0;
  }

  await confirmPublish(opts.yes);
  const token = await acquireToken();
  const { remote, tag, assetName, assetPath, version, id } = preview;

  console.log("");
  console.log(`  publishing ${id} v${version} → github.com/${remote.owner}/${remote.repo} …`);
  // 1. 校验仓库 + 取 default_branch（顺带验证 token）
  const repoInfo = await apiGetRepo(token, remote);
  console.log("  ✓ 仓库可达、token 有效");
  // 1.5 发布前置断言（E6#68c 追加）——本地 HEAD 必须已推送 + 工作区干净；否则 tag 会打在
  //     「没有你刚改的文件」的提交上（2026-09-15 实测：push 失败而 publish 成功，见该函数头注）
  await assertPublishReady(root, token, remote, repoInfo.defaultBranch);
  // 2. 防重发
  if (await apiReleaseExists(token, remote, tag)) {
    throw new Error(`Release ${tag} 已存在——该版本已发布过。要发新版本请先 bump plugin.json 的 version 再 build + publish`);
  }
  // 3. 建 Release + 传 asset
  const body = preview.prerelease ? `${preview.releaseName}（prerelease，更新机制默认忽略非正式版）` : preview.releaseName;
  const releaseId = await apiCreateRelease(token, remote, tag, preview.releaseName, body, preview.prerelease);
  console.log(`  ✓ Release ${tag} 已创建`);
  const data = readFileSync(assetPath);
  await apiUploadAsset(token, remote, releaseId, assetName, data);
  const url = releaseDownloadUrl(remote, tag, assetName);
  console.log(`  ✓ asset ${assetName} 已上传`);
  // 4. 更新 marketplace.json（含新条目 / 既有条目版本历史拼接——描述/图标等回落旧值见 upsertCatalogEntry）
  const read = await apiReadCatalog(token, remote);
  const existing = read ? read.catalog : createEmptyCatalog();
  // E6#106：身份字段（icon/marketIcon）先转「未装态可解析」形态——包内相对路径 → 远端 raw 直链。
  // 不做这一步，未装用户看到的插件图标恒是 404（目录里存的是 `resources/icon.svg` 这种包内路径）。
  const entry = buildCatalogEntry(
    withCatalogIdentity(preview.view, remote, tag),
    url,
    preview.sizeBytes,
    remote.owner,
    new Date().toISOString(),
    {
      readmeUrl: preview.readmeUrl,
      ...(preview.readmeLocales ? { readmeLocales: preview.readmeLocales } : {}),
      changelog: preview.changelog,
      // P1：校验和取**上传的同一份字节**（下面 data 即上传体）——⛔ 不经第二遍磁盘读，避免「hash 的是 A、传的是 B」
      sha256: createHash("sha256").update(data).digest("hex"),
    },
  );
  const merged = upsertCatalogEntry(existing, entry);
  // publish v2：config 声明了合集 ⇒ 根 collections 写成字符串 id 引用（拆分写法读取入口）；
  // 根级原本的 inline 对象被 config 接管（config 是 publish 的真相源——作者文档 23 章写明）
  const rootRefs = preview.publishConfig ? collectionsRootRefs(preview.publishConfig) : null;
  const mergedFinal = rootRefs ? { ...merged, collections: rootRefs } : merged;
  await apiWriteCatalog(token, remote, id, read?.sha ?? null, mergedFinal);

  // 5. publish v2（R4-4.5）：工程根有 marketplace.config.json → 同笔写 authors/<id>.json ＋ collections/
  //    （同版本重跑在步骤 2 已被 Release-tag 断言拦下——它先于一切写入 ⇒ v2 文件天然同罩）
  if (preview.publishConfig) {
    const cfg = preview.publishConfig;
    if (cfg.authorId) {
      const authorPath = `authors/${cfg.authorId}.json`;
      const authorSha = await apiReadContentsSha(token, remote, authorPath);
      const block = buildAuthorBlockFromConfig(cfg, remote);
      await apiWriteContents(token, remote, authorPath, `${JSON.stringify(block, null, 2)}\n`, authorSha, `publish ${id} (authors/${cfg.authorId}.json)`, authorPath);
      console.log(`  ✓ ${authorPath} 已写入（作者块以 config 为准）`);
    } else {
      console.log("  · config 缺 authorId → 跳过作者块（v1 条目照常）");
    }
    const collectionWrites = buildCollectionFiles(cfg);
    for (const w of collectionWrites) {
      const sha = await apiReadContentsSha(token, remote, w.path);
      await apiWriteContents(token, remote, w.path, w.content, sha, `publish ${id} (${w.path})`, w.path);
    }
    if (collectionWrites.length > 0) console.log(`  ✓ collections/ 已写入（${collectionWrites.length} 个合集；根 marketplace.json collections[] 写为字符串引用＝市场侧读取入口）`);
  }

  console.log("");
  console.log(`  🚀 发布成功：${id} v${version}`);
  console.log(`     Release    : https://github.com/${remote.owner}/${remote.repo}/releases/tag/${tag}`);
  console.log(`     下载直链   : ${url}`);
  console.log(`     marketplace.json 已更新（${merged.plugins.length} 个插件条目）`);
  console.log(`  ${PUBLISH_REMOTE_UPDATED_HINT}`);
  console.log("  要让别人看到：对方在 LinkDesk 市场「添加市场源」填本仓库 URL 即见；想所有用户默认可见 → 申请收录官方目录。");
  return 0;
}
