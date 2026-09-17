/**
 * check-appearance-ownership 腿·**外观族 id 归属判据**（E6#111f · 轮次 1.36）。
 *
 * ── 为什么（本件立项的那条轴）──
 * 外观 id（配方 / 配色 / 图标主题 / 共享图标）是**全局名册的键**：配方 id 进 `app.theme` 取值空间、
 * 配色 id 进 `app.themeColor` 取值空间，两者都由**壳的能力面**消费（主题卡片、配色下拉、图标主题选择器）。
 * 不带本仓归属的 id ⇒ 两个插件可以声明**同一个名字**（今天后注册者**静默**覆盖 ⇒ 有一个永远不生效），
 * 或者插件占**宿主兜底**的名字（`dark` / `light` / `dark-fallback` / `default`）⇒ 顶替宿主的保底面。
 *
 * ── 判据（与壳仓 `scripts/gen-host-reserved.mjs` 的账同源）──
 *   ① **本仓前缀**（🔴 红 · **1.49 收紧**）：声明的外观 id 第一段应是本仓 `pluginId`（`<pluginId>.<名字>`，只换第一段、词干零变化）。
 *      🕐 **收紧史**：1.36 任务书 §二.2 把它定为红**但附回退条件**（「若存量改名不执行 ⇒ 必须回退到黄」）；
 *      1.36 落地时存量 25 条改名判给 1.47，故按轴上排序纪律先落黄（**先「黄灯 ＋ 账」、1.49 才收紧为红**）。
 *      1.49 清账完成（官方 18 仓需改处 0）后兑现为红。
 *      🔴 **图标主题 id 一并收进判据①**（1.49 随手掰掉的旧例外）：1.36 曾按「本轮不改名」对 `iconTheme` 空间不判①，
 *      而那条理由（改名＝设置页可见文字变化）**已被 [00 §〇c.1] 撤销**，1.47 实改了 1 条
 *      （`ld-iconset-pastel` → `theme-iconset-pastel.ld-iconset-pastel`）并由**迁移 v12 五键**兜住用户已选值
 *      ⇒ 「改名会丢用户体验」这个前提不再成立，例外随之作废（否则第三方声明裸图标主题 id 永远无人拦）。
 *      🔴 **仍然成立的例外（跑官方 18 仓实测抓到的缺陷）**：**宿主兜底 id 本身不判①**——它在账的**本空间**栏内，
 *      要么已判红，要么你就是**持证照的实现者**。对后者建议 `<pluginId>.light` = 让官方实现者去改宿主的兜底名
 *      ⇒ **断掉「保底 → 官方实现」接替链**（本轴硬禁区），而且那条建议**永远修不得**。
 *      实测读数（修前 / 修后）：`theme-defaults` 报 **4 条黄 → 1 条黄**——被除掉的三条是 `light` 配方×2
 *      ＋ `light` 配色（**修不得的建议**）；留下的一条是配色 `dark`，它**是** `theme-defaults` 自己的配色变体
 *      （不在任何兜底栏内）⇒ 该改名，与 1.35 §13 的 16 条配色改名表一致。
 *   ② **宿主保留面**（🔴 红）：声明 id ∈ 账（包内 `schemas/host-reserved.json`）**对应空间**那一栏，
 *      且声明者**不在** `appearanceIdGrants[id]`（证照）里 ⇒ 占用宿主兜底面。**按空间比、绝不跨空间**：
 *      配方 id 与配色 id 是**两个名字空间**（`mint-soda` 同时是两者）——合栏比会把官方 `theme-defaults`
 *      的配色 `dark` 判成顶替配方 `dark`（**假红**；而它恰恰是宿主亮兜底的**官方实现者**，有 `light` 证照）。
 *   ③ **同插件跨配方同配色 id**（🟡 黄 ＋ 登记）：同一插件的两个配方声明同一个配色 id
 *      （壳侧 `theme.ts:92` 的契约是「配色变体 id 全局唯一」；跨配方重复今天表现为壳 UI 的 React key 碰撞）。
 *
 * ── 扫描面（两面）──
 *   · **声明面** `declared` = `plugin.json`：`contributes.themes[].id`（配方）／`contributes.iconThemes[].id`
 *     （图标主题）／`contributes.icons` 的键（共享图标）；
 *   · **主题文件面** `themeFile` = 仓内 `themes/*.json`：顶层 `id`（配方）＋ `colorways[].id`（配色）。
 *     🔴 配色 id **只在这里出现**（plugin.json 不声明配色）——少了这一面，判据②对配色空间就是瞎子。
 *   · 哨兵空间（`followTheme`）**恒空转**：插件没有声明哨兵的通道（它是壳的取值约定，不是 id）。
 *
 * ── 🔴 与运行时同源 ──
 * 壳运行时（`src/core/registry/appearance/appearanceOwnership.ts`）对**同样的三条分支**做仲裁：
 * 判据② 命中在壳里是**当场拒注册 ＋ console.error**；本腿是**提前在作者仓里把同一件事报出来**
 * （作者不必等装上壳才发现自己的 id 被拒）。判据①③ 运行时不管（运行时拒前缀不合规的 id 会把存量插件
 * 当场弄坏——存量靠改名轮 ＋ 迁移表搬运）⇒ 只在这里判。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.appearanceOwnership`）。⚠️ **fail-closed 不参与豁免**：
 * 拿不到 `pluginId` 说的不是「你的 id 怎么写」，而是「你的身份读不到」——那是工程根的问题。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolvePluginIdForCss, type PluginIdSource } from "./plugin-prefix.js";
import { HOST_RESERVED_FILE, loadHostReserved, manifestIdLine, type HostReservedNames } from "./command-ownership.js";
import { isTestOrMockRel, relPath, type CheckViolation } from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

/** 判据命中的三种形态（红 = 占宿主兜底面；黄 = 不带本仓归属 / 同插件跨配方重复配色） */
export type AppearanceIdCode = "host-reserved" | "no-plugin-prefix" | "same-plugin-colorway";

/**
 * 外观 id 的**空间**——判据按空间比，**永不跨空间**（两个名字空间不可合栏，见文件头判据②）。
 * · `recipe`     配方 id（`app.theme` 取值空间）
 * · `colorway`   配色变体 id（`app.themeColor` / colors 域来源取值空间）
 * · `iconTheme`  图标主题 id（`app.iconTheme` 取值空间）
 * · `sharedIcon` 共享图标 id（`contributes.icons` 的键）
 * · `sentinel`   外观哨兵值（壳的取值约定；插件无声明通道 ⇒ 恒空转）
 */
export type AppearanceIdSpace = "recipe" | "colorway" | "iconTheme" | "sharedIcon" | "sentinel";

/** 扫描面：声明面（plugin.json）／主题文件面（themes/*.json） */
export type AppearanceIdFace = "declared" | "themeFile";

/** 一处不合规站点（探针与腿共用同一份数据） */
export interface AppearanceIdSite {
  face: AppearanceIdFace;
  /** 工程相对路径（正斜杠） */
  file: string;
  line: number;
  id: string;
  space: AppearanceIdSpace;
  code: AppearanceIdCode;
  /** 应改成什么：**只换第一段**（`<pluginId>.` ＋ 原 id 第一段之后的全部）——词干零变化 */
  suggested: string;
  /** code = host-reserved 时：撞上的那条宿主兜底 id */
  reserved?: string;
}

export interface AppearanceOwnershipReport {
  root: string;
  pluginId: string | null;
  pluginIdSource: PluginIdSource | null;
  pluginIdNote: string | null;
  /** fail-closed：非 null ⇒ 本腿报红（拿不到身份就无从判归属） */
  error: string | null;
  /** 🔴 必须改的（进腿报点）：占用宿主保留面 ＋ **1.49 起**不带本仓归属 */
  red: AppearanceIdSite[];
  /** 🟡 建议改的（只打印，不拦）：🔴 **1.49 起只剩「同插件跨配方重复配色」**（归属前缀已升红） */
  yellow: AppearanceIdSite[];
  /** 各面的**全部** id（合规 ＋ 不合规，按出现顺序去重）——探针的读数面（口径：名数，非站点数） */
  declaredRecipeIds: string[];
  declaredIconThemeIds: string[];
  declaredSharedIconIds: string[];
  themeFileRecipeIds: string[];
  themeFileColorwayIds: string[];
  /** 主题文件读不出来的个数（不是判据——是"这一面扫了个空"的报警器，必须让作者看见） */
  themeFilesUnparsed: number;
  /** 账的加载实况（账没读到 ⇒ 判据② 空转，报告里必须能看出来） */
  hostLedger: {
    file: string;
    found: boolean;
    appearanceRecipeIds: number;
    appearanceColorwayIds: number;
    appearanceIconThemeIds: number;
    appearanceSentinels: number;
    appearanceIdGrants: number;
  };
  /** 腿报点 = fail-closed ＋ 全部红 */
  violations: CheckViolation[];
  /** 黄灯建议（`lint.ts` 打印用；**不进** `LintLeg.violations` ⇒ 不拦 CI） */
  advisories: CheckViolation[];
}

/** 账里该空间的兜底 id 栏——**按空间取**（⛔ 永不跨空间：两个名字空间合栏 = 假红，见文件头判据②） */
export function reservedIdsForSpace(space: AppearanceIdSpace, reserved: HostReservedNames): string[] {
  switch (space) {
    case "recipe": return reserved.appearanceRecipeIds;
    case "colorway": return reserved.appearanceColorwayIds;
    case "iconTheme": return reserved.appearanceIconThemeIds;
    case "sharedIcon": return []; // 宿主没有兜底共享图标（账里没有这一栏）——本空间只剩"跨插件同 id"那条判据
    case "sentinel": return reserved.appearanceSentinels;
  }
}

/** 该 id 的**证照**持有者（账 `appearanceIdGrants`）——🔴 **按 id 记**，不是白名单（新插件永远不在表里） */
export function grantHoldersFor(id: string, reserved: HostReservedNames): string[] {
  return reserved.appearanceIdGrants[id] ?? [];
}

/**
 * 一个外观 id 的裁决（纯函数——单测与探针共用，别在别处再写一份判据）。
 *
 * 🔴 判据顺序 = **先②后①**：占宿主兜底面是红，能同时命中「不带前缀」的那一半不该把红降级成黄。
 * 🔴 判据① 覆盖 **recipe / colorway / iconTheme / sharedIcon** 四个空间（1.49 起 `iconTheme` 不再豁免，
 *    见文件头「图标主题 id 一并收进判据①」）。
 */
export function judgeAppearanceId(
  id: string,
  space: AppearanceIdSpace,
  pluginId: string,
  reserved: HostReservedNames,
): { code: AppearanceIdCode; suggested: string; reserved?: string } | null {
  const dot = id.indexOf(".");
  const suggested = `${pluginId}.${dot > 0 ? id.slice(dot + 1) : id}`;
  // ② 宿主保留面（**按空间比全等**——保留面是一张逐个列出的 id 清单，不是前缀面）
  if (reservedIdsForSpace(space, reserved).includes(id) && !grantHoldersFor(id, reserved).includes(pluginId)) {
    return { code: "host-reserved", suggested, reserved: id };
  }
  // ① 本仓前缀（🔴 1.49 起含 iconTheme——旧例外已随 [00 §〇c.1] 撤销，见文件头；sentinel 无声明通道，不判）
  if (space === "recipe" || space === "colorway" || space === "iconTheme" || space === "sharedIcon") {
    // 🔴 **宿主兜底 id 本身不判①**（跑官方 18 仓实测抓到的缺陷，见文件头）：它在**本空间**账内 ⇒
    //   要么上面已判红（无证照），要么你是**持证照的实现者**（`light` ⇐ theme-defaults）。给后者建议
    //   `<pluginId>.light` = 让官方实现者去改宿主兜底的名字 ⇒ **断掉「保底 → 官方实现」接替链**
    //   （本轴硬禁区），且那条建议**永远修不得** ⇒ 报它 = 报一个不允许修的洞（与 iconTheme 不判①同理）。
    if (!reservedIdsForSpace(space, reserved).includes(id) && !id.startsWith(`${pluginId}.`)) {
      return { code: "no-plugin-prefix", suggested };
    }
  }
  return null;
}

/** theme JSON / 清单里 `"id": "<value>"` 的行号（1-based；找不到 ⇒ 1，不许当成「不存在」）——**复用命令腿那一份**（同一种 JSON 读取，⛔ 两条腿各写一份 = 迟早漂） */
export const themeIdLine = manifestIdLine;

/** 读 theme JSON（含容错的 JSONC 剥注释 ＋ 去尾逗号；读不出 ⇒ null，由调用方计入 `themeFilesUnparsed`） */
export function readThemeJson(abs: string): { id?: string; colorwayIds: string[] } | null {
  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch {
    return null;
  }
  try {
    const cleaned = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1")
      .replace(/,(\s*[}\]])/g, "$1");
    const data = JSON.parse(cleaned) as { id?: unknown; colorways?: unknown };
    const colorwayIds = Array.isArray(data.colorways)
      ? data.colorways
          .map((c) => (c as { id?: unknown } | null)?.id)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    return { ...(typeof data.id === "string" && data.id ? { id: data.id } : {}), colorwayIds };
  } catch {
    return null;
  }
}

/** 主题实体文件（仓内 `themes/*.json`，含子目录）
 *  ⚠️ `isTestOrMockRel` 只认 `.ts/.tsx/.js/.jsx` **文件名**（`*.test.ts` / `*.fixture.ts`）⇒ 对 `.json` **恒 false**；
 *  这里仍然带着它，只为与另几条腿**同形状**（哪天那个共享谓词学会目录级口径，几条腿一起变）。
 *  🔴 也就是说：**主题文件面目前不跳任何文件**——那不是漏了：主题 JSON 是**发布产物**，出现在 `themes/` 下
 *  就是真声明。在这里另写一个「目录级跳过」= 凭空造第二条口径，只会与另几条腿漂。 */
function themeFilesOf(root: string): string[] {
  const dir = join(root, "themes");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (cur: string): void => {
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const p = join(cur, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".json") && !isTestOrMockRel(relPath(root, p))) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** `contributes` 里的主题声明／图标主题声明／共享图标键（读不出 ⇒ 都空） */
function contributeIdsOf(contributes: Record<string, unknown> | undefined): {
  themeIds: string[];
  iconThemeIds: string[];
  sharedIconIds: string[];
} {
  const idsOf = (node: unknown): string[] =>
    Array.isArray(node)
      ? node.map((x) => (x as { id?: unknown } | null)?.id).filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
  const icons = contributes?.icons;
  return {
    themeIds: idsOf(contributes?.themes),
    iconThemeIds: idsOf(contributes?.iconThemes),
    sharedIconIds: icons && typeof icons === "object" && !Array.isArray(icons) ? Object.keys(icons) : [],
  };
}

/**
 * 跑本仓外观 id 归属判据。返回结构化报告（探针用）＋ 腿报点（`lint.ts` 用）——**同一份实现**。
 */
export function runAppearanceOwnershipCheck(
  root: string,
  reserved: HostReservedNames = loadHostReserved(),
  reservedFile: string = HOST_RESERVED_FILE,
): AppearanceOwnershipReport {
  const absRoot = resolve(root);
  const manifestPath = join(absRoot, "plugin.json");
  const resolution = resolvePluginIdForCss(absRoot);
  const violations: CheckViolation[] = [];
  const report: AppearanceOwnershipReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    pluginIdSource: resolution.source,
    pluginIdNote: resolution.note,
    error: resolution.error,
    red: [],
    yellow: [],
    declaredRecipeIds: [],
    declaredIconThemeIds: [],
    declaredSharedIconIds: [],
    themeFileRecipeIds: [],
    themeFileColorwayIds: [],
    themeFilesUnparsed: 0,
    hostLedger: {
      file: reservedFile,
      found: existsSync(reservedFile),
      appearanceRecipeIds: reserved.appearanceRecipeIds.length,
      appearanceColorwayIds: reserved.appearanceColorwayIds.length,
      appearanceIconThemeIds: reserved.appearanceIconThemeIds.length,
      appearanceSentinels: reserved.appearanceSentinels.length,
      appearanceIdGrants: Object.keys(reserved.appearanceIdGrants).length,
    },
    violations,
    advisories: [],
  };

  // ── fail-closed（不可豁免：拿不到身份 = 判据①② 全部无从谈起）──
  if (resolution.error || !resolution.pluginId) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `拿不到本仓 pluginId：${resolution.error}。外观 id 的归属判据以「本仓身份」为唯一前缀来源——读不到它就无从判` +
        `「这个 id 是不是你的」。在插件工程根修好 plugin.json（或显式声明 pluginId），` +
        `别用 disable 注释绕：这是身份问题，不受豁免注释管辖。`,
    });
    return report;
  }

  const pluginId = resolution.pluginId;
  const prefix = `${pluginId}.`;
  const manifestRaw = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
  const manifestDisabled = buildDisableIndex(manifestRaw, [CHECK_IDS.appearanceOwnership]);

  const push = (
    site: AppearanceIdSite,
    message: string,
    disabled?: { idx: ReturnType<typeof buildDisableIndex>; line: number },
  ): void => {
    if (disabled && isDisabled(disabled.idx, disabled.line, CHECK_IDS.appearanceOwnership)) return;
    /**
     * 🔴 **1.49 起判据①②都进 `violations`**（收紧前：`host-reserved` 红 ／ `no-plugin-prefix` 黄）。
     * 判据③（`same-plugin-colorway`）**仍是黄＋登记**——它是 1.36 §三③ 定的独立判据，不在本格
     * 「归属前缀收紧」的射程内（见 1.49 交接段的「不做／顺延」）。
     * `yellow` / `advisories` 保留为空容器：探针与渲染器的输出形状不变。
     */
    if (site.code === "host-reserved" || site.code === "no-plugin-prefix") {
      report.red.push(site);
      violations.push({ file: site.file, line: site.line, message });
    } else {
      report.yellow.push(site);
      report.advisories.push({ file: site.file, line: site.line, message });
    }
  };

  /** 判据②① 合一的报点（两个面共用） */
  const judgeAndPush = (face: AppearanceIdFace, space: AppearanceIdSpace, id: string, file: string, line: number): void => {
    const verdict = judgeAppearanceId(id, space, pluginId, reserved);
    if (!verdict) return;
    const where =
      face === "declared"
        ? "声明面（plugin.json contributes）"
        : "主题文件面（themes/*.json）";
    const spaceLabel =
      space === "recipe" ? "配方 id" : space === "colorway" ? "配色变体 id" : space === "iconTheme" ? "图标主题 id" : "共享图标 id";
    const message =
      verdict.code === "host-reserved"
        ? `${where}：${spaceLabel} "${id}" 属于**宿主的兜底面**（保留清单见包内 schemas/host-reserved.json 的 ` +
          `appearance${space === "recipe" ? "RecipeIds" : space === "colorway" ? "ColorwayIds" : space === "iconTheme" ? "IconThemeIds" : "Sentinels"}）。` +
          `占用它 = 顶替宿主保底（壳运行时会**当场拒绝注册**这条 id 并报错）——宿主兜底是"全部主题插件卸载后仍能渲染"的那一层。` +
          `改法：改成 "${verdict.suggested}"（只换第一段、词干零变化）；若你确实是宿主兜底的官方实现者，` +
          `需在账的 appearanceIdGrants 里为该 id 记一条证照（一次公共面决策，不是作者自己能加的）。`
        : `${where}：${spaceLabel} "${id}" 不带本仓归属（本插件 pluginId = "${pluginId}"，新 ${spaceLabel}应以 "${prefix}" 开头）` +
          `——外观 id 是**全局名册的键**：同名 id 被两个插件声明时只有一个能生效（壳 1.36 起"先者保留"，后到者被拒），` +
          `跨插件撞名还会在校验层被记一笔。改成 "${verdict.suggested}"（只换第一段、词干零变化）。`;
    push(
      { face, file, line, id, space, code: verdict.code, suggested: verdict.suggested, ...(verdict.reserved !== undefined ? { reserved: verdict.reserved } : {}) },
      message,
      { idx: face === "declared" ? manifestDisabled : buildDisableIndex(readFileSync(join(absRoot, file), "utf8"), [CHECK_IDS.appearanceOwnership]), line },
    );
  };

  // ── ①② 声明面：plugin.json（读不出 ⇒ 跳过——plugin-prefix 腿已对同一件事 fail-closed 报红，不重复报）
  if (manifestRaw) {
    let contributes: Record<string, unknown> | undefined;
    try {
      const manifest = JSON.parse(
        manifestRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1"),
      ) as { contributes?: Record<string, unknown> };
      contributes = manifest.contributes;
    } catch {
      contributes = undefined; // manifest 坏 → 由 plugin-prefix 腿报；这里不重复
    }
    const { themeIds, iconThemeIds, sharedIconIds } = contributeIdsOf(contributes);
    for (const id of themeIds) {
      if (!report.declaredRecipeIds.includes(id)) report.declaredRecipeIds.push(id);
      judgeAndPush("declared", "recipe", id, "plugin.json", themeIdLine(manifestRaw, id));
    }
    for (const id of iconThemeIds) {
      if (!report.declaredIconThemeIds.includes(id)) report.declaredIconThemeIds.push(id);
      judgeAndPush("declared", "iconTheme", id, "plugin.json", themeIdLine(manifestRaw, id));
    }
    for (const id of sharedIconIds) {
      if (!report.declaredSharedIconIds.includes(id)) report.declaredSharedIconIds.push(id);
      judgeAndPush("declared", "sharedIcon", id, "plugin.json", themeIdLine(manifestRaw, id));
    }
  }

  // ── ①② 主题文件面：themes/*.json（顶层 id = 配方；colorways[].id = 配色）
  //   🔴 配色 id **只在这一面出现**——少了它，判据②对配色空间就是瞎子。
  const colorwayFiles = new Map<string, string[]>(); // colorwayId → 声明它的主题文件（判据③用）
  for (const abs of themeFilesOf(absRoot)) {
    const rel = relPath(absRoot, abs);
    const raw = readFileSync(abs, "utf8");
    const data = readThemeJson(abs);
    if (!data) {
      report.themeFilesUnparsed++;
      continue;
    }
    if (data.id) {
      if (!report.themeFileRecipeIds.includes(data.id)) report.themeFileRecipeIds.push(data.id);
      judgeAndPush("themeFile", "recipe", data.id, rel, themeIdLine(raw, data.id));
    }
    for (const cw of data.colorwayIds) {
      if (!report.themeFileColorwayIds.includes(cw)) report.themeFileColorwayIds.push(cw);
      judgeAndPush("themeFile", "colorway", cw, rel, themeIdLine(raw, cw));
      const files = colorwayFiles.get(cw) ?? [];
      if (!files.includes(rel)) files.push(rel);
      colorwayFiles.set(cw, files);
    }
  }

  // ── ③ 同插件跨配方同配色 id（🟡 黄 ＋ 登记）：同一配色 id 出现在**两个不同主题文件**里
  //   契约出处 = 壳 `theme.ts` 的「配色变体 id 须全局唯一」（跨配方重复今天表现为壳 UI 的 React key 碰撞）。
  for (const [cw, files] of colorwayFiles) {
    if (files.length < 2) continue;
    const verdict = judgeAppearanceId(cw, "colorway", pluginId, reserved);
    // 已被判红/黄的 id 不重复报（红的意思已经说过了——同一处报两次只会稀释信号）
    if (verdict) continue;
    for (const file of files.slice(1)) {
      push(
        { face: "themeFile", file, line: themeIdLine(readFileSync(join(absRoot, file), "utf8"), cw), id: cw, space: "colorway", code: "same-plugin-colorway", suggested: `${prefix}${cw.includes(".") ? cw.slice(cw.indexOf(".") + 1) : cw}` },
        `主题文件面：配色变体 id "${cw}" 在本插件被声明了 ${files.length} 次（${files.join(" / ")}）` +
          `——壳的契约是「配色变体 id **全局唯一**」（跨配方重复会让壳 UI 的配色下拉出现重复项/React key 碰撞）。` +
          `改法：每个配方用自己的配色 id（形如 "${prefix}<配方名>.<配色名>"）。`,
      );
    }
  }

  return report;
}
