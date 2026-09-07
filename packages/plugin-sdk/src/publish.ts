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
  icon?: string;
  iconSource?: string;
  category?: string;
  downloadUrl: string;
  size?: number;
  publishedAt?: string;
  minAppVersion?: string;
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
  readme?: string;
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
    readme: str(m.readme),
  };
}

/** 单条 catalog 条目构造——versions[] 只有当前一版（合并时与既有历史拼接）。author 缺失时回落 owner。 */
export function buildCatalogEntry(v: ManifestView, downloadUrl: string, size: number, owner: string, publishedAt: string): CatalogPluginEntry {
  return {
    id: v.id,
    name: v.name,
    version: v.version,
    ...(v.description !== undefined ? { description: v.description } : {}),
    author: { name: v.author ?? owner },
    ...(v.icon !== undefined ? { icon: v.icon } : {}),
    ...(v.iconSource !== undefined ? { iconSource: v.iconSource } : {}),
    downloadUrl,
    size,
    publishedAt,
    versions: [{ version: v.version, downloadUrl, publishedAt }],
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
  };
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
  const entry = buildCatalogEntry(preview.view, url, preview.sizeBytes, remote.owner, new Date().toISOString());
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
