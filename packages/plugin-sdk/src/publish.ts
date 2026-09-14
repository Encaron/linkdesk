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
 *
 * PAT（#26c 链路的 CLI 半侧）：env `LINKDESK_GITHUB_TOKEN` > 用户配置档
 * `{configDir}/linkdesk-sdk/config.json`（首跑掩码提示输入存一次，0600）。
 * #26a UI 备路 + #26c 的 app.* 配置存储 = 市场插件轮（L3）——UI 发 GitHub 需壳主进程 handler，
 * 本 CLI 是无壳作者终端主路（00-第三方作者旅程 §五）。
 *
 * 失败都 throw 中文可读错误 → bin.ts catch 打印；退出码由 bin 定。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { derivePluginId, readPluginManifest } from "./validate.js";
import { ghErrorDetail, ghHttp } from "./github-http.js";

/* ── 类型 ─────────────────────────────────────────────────────────────── */

export interface GitHubRemote {
  owner: string;
  repo: string;
}

export interface CatalogVersion {
  version: string;
  downloadUrl: string;
  publishedAt: string;
  changelog?: string;
}

/** marketplace.json 插件条目——对齐规范 §三/§3.2 字段（作者条目=纯增量，缺字段不崩） */
export interface CatalogPluginEntry {
  id: string;
  name: string;
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
  downloadUrl: string;
  size?: number;
  publishedAt?: string;
  minAppVersion?: string;
  /** 未装插件详情页「详情」页签的 README 远端直链（E6#91c 接通）——publish 自动写，作者零声明。
   *  与打进 zip 的 README 同源（同一 tag），故未装看到的 = 装上后看到的。工程根无 README.md → 不写。 */
  readmeUrl?: string;
  /** 版本历史，最新在前——更新机制数据源 */
  versions: CatalogVersion[];
}

export interface MarketplaceCatalog {
  version?: string;
  updatedAt?: string;
  plugins: CatalogPluginEntry[];
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

/** 作者面 manifest 摘要——entry 映射所需的字段（name/version 必填由 schema 保证，其余可选） */
export interface ManifestView {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  iconSource?: string;
  /** E6#106：Type-2 身份彩色图（图标栏插件才有；非图标栏插件 `icon` 即身份图） */
  marketIcon?: string;
  marketIconSource?: string;
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
    description: str(m.description),
    author: str(m.author),
    icon: str(m.icon),
    iconSource: str(m.iconSource),
    marketIcon: str(m.marketIcon),
    marketIconSource: str(m.marketIconSource),
  };
}

/** 条目补充字段——**缺省即不写该键**（字段缺省比填空串/空对象诚实，渲染层两条路走同一兜底） */
export interface CatalogEntryExtras {
  /** 未装态 README 远端直链——工程根无 README.md 时缺省（写了必 404） */
  readmeUrl?: string;
  /** 当前版本正文（`CHANGELOG.md` 切段所得）——无文件 / 切不到时缺省 */
  changelog?: string;
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
    version: v.version,
    ...(v.description !== undefined ? { description: v.description } : {}),
    author: { name: v.author ?? owner },
    ...(v.icon !== undefined ? { icon: v.icon } : {}),
    ...(v.iconSource !== undefined ? { iconSource: v.iconSource } : {}),
    // E6#106：身份图随条目——值应为 withCatalogIdentity 转换过的 URL 形态（缺省不写键）
    ...(v.marketIcon !== undefined ? { marketIcon: v.marketIcon } : {}),
    ...(v.marketIconSource !== undefined ? { marketIconSource: v.marketIconSource } : {}),
    ...(extras.readmeUrl !== undefined ? { readmeUrl: extras.readmeUrl } : {}),
    downloadUrl,
    size,
    publishedAt,
    versions: [
      {
        version: v.version,
        downloadUrl,
        publishedAt,
        ...(extras.changelog !== undefined ? { changelog: extras.changelog } : {}),
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
      versions: history,
      // 保历史字段：新 manifest 没填的（icon/description 等）回落到旧值，避免发布抖动丢展示数据
      icon: entry.icon ?? existing.icon,
      iconSource: entry.iconSource ?? existing.iconSource,
      // E6#106：身份图同待遇——作者删掉 marketIcon 声明时，不让目录条目跟着塌成剪影
      marketIcon: entry.marketIcon ?? existing.marketIcon,
      marketIconSource: entry.marketIconSource ?? existing.marketIconSource,
      description: entry.description ?? existing.description,
      category: entry.category ?? existing.category,
      minAppVersion: entry.minAppVersion ?? existing.minAppVersion,
    };
    next[idx] = merged;
  }
  return { version: catalog.version ?? "1", updatedAt: now, plugins: next };
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

/** 未装插件读 README 的远端直链（E6#91c）——**用 tag 不用 default_branch**：这条 URL 与打进 zip 的
 *  那份 README 同源（同一 commit）；用 main 会让「未装浏览者看到的」与「装上后看到的」是两份内容。 */
export function readmeRawUrl(remote: GitHubRemote, tag: string): string {
  return `https://raw.githubusercontent.com/${remote.owner}/${remote.repo}/${tag}/README.md`;
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
  const content = `${JSON.stringify(catalog, null, 2)}\n`;
  const body: Record<string, unknown> = {
    message: `publish ${id} (marketplace.json)`,
    content: Buffer.from(content, "utf8").toString("base64"),
  };
  if (sha) body.sha = sha;
  const res = await ghHttp({
    token,
    api: "api",
    method: "PUT",
    path: `/repos/${remote.owner}/${remote.repo}/contents/marketplace.json`,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error("marketplace.json 写冲突（409）——远端刚被改动，重跑一次 publish 即可");
    throw new Error(`更新 marketplace.json 失败（${res.status}）：${ghErrorDetail(res)}`);
  }
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
  /** 当前版本正文——`CHANGELOG.md` 切段所得；无文件 / 切不到该版本 → 缺省（诚实留空，不猜） */
  changelog?: string;
}

function collectPreview(root: string): PublishPreview {
  const pluginJsonPath = join(root, "plugin.json");
  if (!existsSync(pluginJsonPath)) {
    throw new Error(`当前目录不是插件工程——找不到 ${pluginJsonPath}。请 cd 进插件项目根再跑 linkdesk-plugin-sdk publish`);
  }
  const manifest = readPluginManifest(pluginJsonPath);
  const view = collectManifestView(manifest, basename(resolve(root)));
  const assetName = assetNameForId(view.id);
  const assetPath = join(root, assetName);
  if (!existsSync(assetPath)) {
    throw new Error(`找不到分发件 ${assetName}——先跑 npm run build（= linkdesk-plugin-sdk build）产出 .linkdesk-plugin 再发布`);
  }
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
    ...(existsSync(changelogPath) ? { changelog: sliceChangelogSection(readFileSync(changelogPath, "utf8"), view.version) } : {}),
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
    "  │ 将做      : 创建 GitHub Release → 上传 asset → 更新该仓库根 marketplace.json",
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
  const preview = collectPreview(root);
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
  await apiGetRepo(token, remote);
  console.log("  ✓ 仓库可达、token 有效");
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
      changelog: preview.changelog,
    },
  );
  const merged = upsertCatalogEntry(existing, entry);
  await apiWriteCatalog(token, remote, id, read?.sha ?? null, merged);

  console.log("");
  console.log(`  🚀 发布成功：${id} v${version}`);
  console.log(`     Release    : https://github.com/${remote.owner}/${remote.repo}/releases/tag/${tag}`);
  console.log(`     下载直链   : ${url}`);
  console.log(`     marketplace.json 已更新（${merged.plugins.length} 个插件条目）`);
  console.log("  要让别人看到：对方在 LinkDesk 市场「添加市场源」填本仓库 URL 即见；想所有用户默认可见 → 申请收录官方目录。");
  return 0;
}
