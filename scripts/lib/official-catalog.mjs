/**
 * GitHub 侧的**读取端**——官方目录（`Encaron/linkdesk-marketplace`）+ 各插件仓的 Release 事实。
 * E6#101（L7 第 7.4 轮）。
 *
 * 谁在用：`scripts/sync-bundled.mjs`（`--latest` 查最新版）与 `scripts/check-bundled-freshness.mjs`
 * （门禁比对「箱内版本 vs 目录最新版」）。两边问的是**同一件事**「这只插件现在最新是几版」，
 * 所以读数方式只此一份（两个实现必然漂移，然后一颗种子被两个门禁各判一次、结论还不一样）。
 * Release 事实（`releases/latest` 的 tag）与目录读取同属「向 GitHub 要插件发布事实」一件事——
 * 网络口径 / 认证 / 错误话术只写一份，故同放本模块。
 *
 * ── 为什么用 Contents API 而不是 raw CDN（2026-09-14 用户裁，⑦.4 轮开工审计第 4 问）──
 *   ① **raw 有 `Cache-Control: max-age=300`**（7.3 轮 `#100c-2` 实测：写完约 5 分钟才翻档，`Source-Age` 爬到 255）
 *      ⇒ 判「最新版」时可能读到 **5 分钟前的旧内容**。
 *   ② Contents API 读的是 **committed 内容**（`repos/…/contents/<path>` 返回该 ref 的 blob），**无 CDN 层**。
 *   ③ 顺带解掉本机的网络口径问题：实测 `api.github.com` **直连可通**，而
 *      `raw.githubusercontent.com` 与 Release asset（`github.com/…/releases/download/…`）**必须走代理**。
 *
 * ⚠️ 判定方向因此定为「**目录版本 > 箱内版本 ⇒ 红；箱内 ≥ 目录 ⇒ 绿**」（见门禁脚本）：
 *   即便将来某条读取路径又带上缓存滞后，**滞后只会让内容偏旧**，只会「延迟发现落后」，
 *   **永不产生假红**——假红让真红失效，是本仓最贵的坏法。
 *
 * 认证：匿名 60 次/时·IP 足够本用途（每轮 1 次读）；带 `GITHUB_TOKEN` / `GH_TOKEN` 时自动附上
 *   （CI 里 GH Actions 自带；本机 `gh auth login` 的凭据**不会**自动被 fetch 用上，属已知边界）。
 */

export const OFFICIAL_REPO = { owner: "Encaron", repo: "linkdesk-marketplace" };

/**
 * 插件仓的命名规则（N3 定案：`linkdesk-plugin-<id>`，见 09-命名规范 §五）。
 * 这里只放**仓库名**规则——它是基础设施约定，不是插件 id 名单（硬约束 10 禁的是后者）。
 * `scripts/sync-official-catalog.mjs` 的 `--owner/--repo-prefix` 默认值同源于此（同一份，不各写一份）。
 */
export const PLUGIN_REPO = { owner: OFFICIAL_REPO.owner, prefix: "linkdesk-plugin-" };

/** 官方目录在仓内的路径（与 `scripts/sync-official-catalog.mjs` 写的那份同一个文件；本模块内部用） */
const OFFICIAL_CATALOG_PATH = "marketplace.json";

/**
 * 网络失败时的话术——**要说人话，且给得出下一步**。
 * 实测（2026-09-14，本机）：`api.github.com` 直连可通；`github.com/.../releases/download/...` 与
 * `raw.githubusercontent.com` 直连会 ECONNRESET，**必须带代理**。Node 的 fetch 不自动读系统代理，
 * 要走环境变量代理得开 `NODE_USE_ENV_PROXY=1`（Node ≥ 22.21 / 24 支持）。
 */
export function networkHint(what, url) {
  return (
    `❌ 取不到${what}（${url}）\n` +
    `   本机的实测口径：api.github.com 直连可通；github.com 的 asset 下载与 raw.githubusercontent.com 需要代理。\n` +
    `   若确实无网 → 用 --offline 档（只按 lock 指纹校验，明示不出网）；若只是要过代理 → 先设好再跑：\n` +
    `     set HTTPS_PROXY=http://127.0.0.1:7890 && set HTTP_PROXY=http://127.0.0.1:7890 && set NODE_USE_ENV_PROXY=1\n` +
    `   （Git Bash/PowerShell 用 export/$env: 写法；NODE_USE_ENV_PROXY 是 Node 读取环境代理的开关）`
  );
}

/** 本模块自用的极薄 fetch 包装：附 UA + 可选 token，失败抛带话术的错 */
async function ghFetch(url, { accept, raw = true, what }) {
  const headers = { "User-Agent": "linkdesk-bundled-sync", Accept: accept };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(url, { headers, redirect: "follow" });
  } catch (e) {
    const cause = e instanceof Error && e.cause ? e.cause.code || e.cause.message : null;
    throw new Error(networkHint(what, url) + (cause ? `\n   （底层错误：${cause}）` : ""));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const auth = res.status === 401 || res.status === 403
      ? "\n   403/401 多为**速率限制或凭据问题**——设 GITHUB_TOKEN（或 GH_TOKEN）后重跑；匿名额度 60 次/时·IP。"
      : "";
    throw new Error(`❌ 取不到${what}：HTTP ${res.status} ${res.statusText}${auth}\n   ${body.slice(0, 300)}`);
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

/**
 * 读官方目录 → `{ plugins: [...] }`（原始结构，不做裁剪）。
 * 读不到 ⇒ **抛**（门禁/同步都必须响，不许退化成「目录空 ⇒ 无落后」的假绿）。
 */
export async function readOfficialCatalog() {
  const url =
    `https://api.github.com/repos/${OFFICIAL_REPO.owner}/${OFFICIAL_REPO.repo}` +
    `/contents/${OFFICIAL_CATALOG_PATH}?ref=main`;
  const buf = await ghFetch(url, {
    accept: "application/vnd.github.raw",
    what: "官方目录 marketplace.json",
  });
  let parsed;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    throw new Error(`❌ 官方目录解析失败（${url}）：${e instanceof Error ? e.message : String(e)}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.plugins;
  if (!Array.isArray(list)) throw new Error("❌ 官方目录结构不认识：既不是数组，也没有 `plugins` 数组");
  return { ...(Array.isArray(parsed) ? {} : parsed), plugins: list };
}

/**
 * 目录条目 → `id → { version, downloadUrl, repo }`。
 * 版本口径与 `sync-official-catalog.mjs` 写入的口径一致：顶层 `version`（缺失则取 `versions[0].version`）。
 * `downloadUrl` 缺失时不猜（上层按 GitHub Release 约定拼）——猜 URL 会骗人，宁可留空让调用方报错。
 */
export function catalogIndexOf(catalog) {
  const map = new Map();
  for (const p of catalog.plugins) {
    if (!p || typeof p !== "object") continue;
    const id = typeof p.id === "string" ? p.id : null;
    if (!id) continue;
    const version =
      typeof p.version === "string" && p.version !== ""
        ? p.version
        : typeof p.versions?.[0]?.version === "string"
          ? p.versions[0].version
          : null;
    map.set(id, {
      id,
      version,
      downloadUrl: typeof p.downloadUrl === "string" ? p.downloadUrl : null,
      repo: typeof p.repository === "string" ? p.repository : null,
    });
  }
  return map;
}

/** semver 粗比（只处理 x.y.z 数字段）——够本用途（比大小判落后），不引依赖、不另造第二套完整实现 */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * 读某插件仓 `releases/latest` 的 tag（去 `v`）——**「目录落后于 Release」这条警告的读数源**，
 * 不是 version 裁决源（裁决源按第 7.4 轮用户裁定 = 官方目录，见文件头）。
 *
 * 为什么要它：官方目录是**第二步**（7.3 的模型：publish 进自己仓 → 收录进官方目录），
 * 两步之间会有一段「作者已发版、市场还没上」的窗口。窗口期里只读目录 ⇒ 箱子不会先跑，
 * **这是对的**（用户能装到的就是目录那一版，箱子与市场一致）；但**必须让这段窗口可见**，
 * 否则「明明发了版箱子怎么没动」会变成一个没人能回答的问题。
 * 无 Release / 404 / 无权限 → `null`（不是错误：条目可能还没有 Release，交由调用方只提示不判红）。
 */
export async function readLatestReleaseTag(repo) {
  if (typeof repo !== "string" || !repo.includes("/")) return null;
  try {
    const json = await ghFetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      accept: "application/vnd.github+json",
      raw: false,
      what: `${repo} 的最新 Release`,
    });
    const tag = typeof json?.tag_name === "string" ? json.tag_name.replace(/^v/, "") : null;
    return tag || null;
  } catch {
    return null;
  }
}
