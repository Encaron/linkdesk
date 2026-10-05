/**
 * `import-icon-theme` —— 上游图标主题包（VS Code `iconTheme` 格式）→ LinkDesk `contributes.iconThemes` 映射。
 *
 * **为什么这条命令住在 SDK**：图标集插件的产物是「几百个 SVG ＋ 一张映射表」，手写不现实；而从上游
 * 批量导入是**任何**图标集作者都会走的一步机制，不是某一只插件的私事。从前这一步只有一个维护者仓里的
 * 一次性脚本 ⇒ 第三方作者拿不到，只能来问维护者。
 *
 * 🔴 **分工（本命令的设计前提）**：**编辑决定住作者仓，转换机制住这里**。
 *   - 选哪些扩展名 / 文件名 / 文件夹、哪些图标改指上游另一枚、哪些是自绘资产 —— 全在清单文件
 *     （`--list`，住作者本仓，随仓评审、随仓历史、随仓回滚）；
 *   - 不传清单 = 导入上游声明的**全部**映射（从零起步的默认路径，不用先学会清单格式）。
 *
 * **转换口径**（与 VS Code `iconTheme` 的差异，逐条）：
 *   1. `iconDefinitions[key].iconPath` → `{ imagePath: "<资产目录>/<文件名>" }`（LinkDesk 的图像资产形态）；
 *      上游若只有 `fontCharacter`（字体字形形态）⇒ 该键跳过（本命令不做字体→SVG 的转换）；
 *   2. 上游 `fileExtensions` 的键**无点**（`ts`）→ LinkDesk `extensions` 的键**带点**（`.ts`）；
 *      `fileNames` / `folderNames` 的大小写照上游（上游已小写，LinkDesk 侧按小写比对）；
 *   3. 上游顶层 `file` / `folder` / `folderExpanded` / `rootFolder` / `rootFolderExpanded` 五个默认图标
 *      原样带过来（只写上游确实声明了的那几个，缺的留给壳的保底图标）；
 *   4. **只拷贝被映射引用的 SVG**（上游整包一千多个，日常用不到那么多）；
 *   5. 生成的映射文件里 `$schema` 指向 npm 包内的 `schemas/icon-theme.schema.json` ⇒ 作者 IDE 里有补全。
 *
 * ⚠️ **许可（作者的事，但命令要提醒）**：上游图标包多为 MIT。把上游 LICENSE 一并放进插件目录——
 * 本命令只做转换与拷贝，不替你处理署名。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";

/** 生成的映射文件里写死的 IntelliSense 引用（npm 包内路径；与作者文档 §3.7 的示例一致）。 */
export const ICON_THEME_SCHEMA_REF = "./node_modules/@linkdesk/plugin-sdk/schemas/icon-theme.schema.json";

/** 作者清单文件（`--list`）——只放**编辑决定**，不放机制。五个键全部可选。 */
export interface IconImportList {
  /** 上游 `fileExtensions` 的原键（**无点**，如 `ts`）。缺省 = 上游全部。 */
  extensions?: string[];
  /** 上游 `fileNames` 的原键（小写，如 `package.json`）。缺省 = 上游全部。 */
  fileNames?: string[];
  /** 上游 `folderNames` 的原键（如 `src`）。缺省 = 上游全部。 */
  folders?: string[];
  /** 扩展名 → 改指上游另一枚 `iconDefinitions` 键（上游归类不合本仓语境时用）。 */
  overrides?: Record<string, string>;
  /** 扩展名 → 仓内自绘资产名；资产须已在 `<资产目录>/<名>.svg`（**不从上游拷**，缺了直接报错）。 */
  localIcons?: Record<string, string>;
}

interface UpstreamTheme {
  iconDefinitions?: Record<string, { iconPath?: string; fontCharacter?: string }>;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
}

type IconMapping = { imagePath: string };

/** 生成的映射文件形态（契约见 `schemas/icon-theme.schema.json`）。 */
export interface IconThemeMappings {
  $schema: string;
  file?: IconMapping;
  folder?: IconMapping;
  folderExpanded?: IconMapping;
  rootFolder?: IconMapping;
  rootFolderExpanded?: IconMapping;
  extensions: Record<string, IconMapping>;
  files: Record<string, IconMapping>;
  folders: Record<string, IconMapping>;
  foldersExpanded: Record<string, IconMapping>;
}

export interface BuiltIconTheme {
  mappings: IconThemeMappings;
  /** 被映射引用、需从上游拷贝的资产**文件名**（去重；自绘资产不在其中）。 */
  upstreamAssetFiles: string[];
  /** 上游没有这个键 ⇒ 静默跳过，但如实报给作者（清单里可能真写错了）。 */
  skippedKeys: string[];
}

/** 上游顶层默认图标 → LinkDesk 键（顺序即产物里的书写顺序，别改）。 */
const DEFAULT_ICON_KEYS: ReadonlyArray<readonly [keyof UpstreamTheme, keyof IconThemeMappings]> = [
  ["file", "file"],
  ["folder", "folder"],
  ["folderExpanded", "folderExpanded"],
  ["rootFolder", "rootFolder"],
  ["rootFolderExpanded", "rootFolderExpanded"],
];

/**
 * 纯函数：上游主题 ＋ 清单 → 映射表 ＋ 待拷资产清单。不碰磁盘（IO 在 {@link importIconTheme}）。
 *
 * @param assetsDirRel 资产目录的**相对插件根**路径，posix 分隔（如 `icons/material`）——写进 `imagePath`。
 */
export function buildIconThemeMappings(
  theme: UpstreamTheme,
  list: IconImportList | null,
  assetsDirRel: string,
): BuiltIconTheme {
  const defs = theme.iconDefinitions ?? {};
  const upstreamAssetFiles = new Set<string>();
  const skippedKeys: string[] = [];

  const imageOf = (defKey: string | undefined): IconMapping | null => {
    if (!defKey) return null;
    const iconPath = defs[defKey]?.iconPath;
    if (!iconPath) return null; // fontCharacter-only 定义（或键不存在）——不是本命令的射程
    const fileName = basename(iconPath.replace(/\\/g, "/"));
    upstreamAssetFiles.add(fileName);
    return { imagePath: `${assetsDirRel}/${fileName}` };
  };

  const table = (
    upstream: Record<string, string> | undefined,
    wanted: string[] | undefined,
    keyTransform: (k: string) => string,
    resolveDef: (k: string) => string | undefined,
  ): Record<string, IconMapping> => {
    const keys = wanted ?? Object.keys(upstream ?? {});
    const out: Record<string, IconMapping> = {};
    for (const k of keys) {
      const image = imageOf(resolveDef(k));
      if (image) out[keyTransform(k)] = image;
      else skippedKeys.push(k);
    }
    return out;
  };

  // 逐表写入（缺省＝上游全部；给了清单＝按清单过滤，清单里上游没有的键进 skippedKeys 如实报出）
  const defaults: Record<string, IconMapping> = {};
  for (const [upKey, lkKey] of DEFAULT_ICON_KEYS) {
    const defKey = theme[upKey] as string | undefined;
    const image = defKey ? imageOf(defKey) : null;
    if (image) defaults[lkKey] = image;
  }

  const overrides = list?.overrides ?? {};
  const mappings: IconThemeMappings = {
    $schema: ICON_THEME_SCHEMA_REF,
    ...defaults,
    extensions: table(
      theme.fileExtensions,
      list?.extensions,
      (k) => `.${k}`,
      (k) => overrides[k] ?? theme.fileExtensions?.[k],
    ),
    files: table(theme.fileNames, list?.fileNames, (k) => k, (k) => theme.fileNames?.[k]),
    folders: table(theme.folderNames, list?.folders, (k) => k, (k) => theme.folderNames?.[k]),
    foldersExpanded: table(theme.folderNamesExpanded, list?.folders, (k) => k, (k) => theme.folderNamesExpanded?.[k]),
  };

  // 自绘资产：只写映射、不从上游拷；资产在不在由 IO 侧验（那是真会坏的事，必须报错而不是静默）
  const localNames = new Set<string>();
  for (const [ext, name] of Object.entries(list?.localIcons ?? {})) {
    mappings.extensions[`.${ext}`] = { imagePath: `${assetsDirRel}/${name}.svg` };
    localNames.add(`${name}.svg`);
  }
  for (const n of localNames) upstreamAssetFiles.delete(n);

  return { mappings, upstreamAssetFiles: [...upstreamAssetFiles].sort(), skippedKeys };
}

export interface ImportIconThemeOptions {
  /** 插件工程根（CLI 传 process.cwd()）。 */
  root: string;
  /** 上游主题 JSON（`material-icons.json` / 任何 VS Code iconTheme 的 JSON）。 */
  source: string;
  /** 主题名：决定缺省输出文件与缺省资产目录。缺省 = 源文件主名。 */
  name?: string;
  /** 映射输出（相对 root 或绝对）。缺省 `icons/<name>.json`。 */
  out?: string;
  /** 资产目录（相对 root 或绝对）。缺省 `icons/<name>/`。 */
  assets?: string;
  /** 作者清单文件。不传 = 上游全部。 */
  list?: string;
  /** 上游 SVG 所在目录。缺省 = 源 JSON 同级 `../icons`（npm 包 `dist/` 形态）或源 JSON 同级。 */
  iconsDir?: string;
}

export interface ImportIconThemeResult {
  themeName: string;
  outPath: string;
  assetsPath: string;
  upstreamIconsDir: string;
  copied: number;
  /** 上游缺资产（映射引用了但源文件不存在）——保留映射，运行时走保底图标。 */
  missingAssetFiles: string[];
  skippedKeys: string[];
  counts: { extensions: number; files: number; folders: number; foldersExpanded: number; defaults: number };
  jsonBytes: number;
  /** 工程里有 plugin.json 就带上它的 pluginId，报告里直接给出可粘贴的贡献点片段。 */
  pluginId?: string;
}

const posixRel = (root: string, abs: string): string => relative(root, abs).split(/[\\/]/).join("/");

const loadJsonc = <T>(file: string): T => parseJsonc(readFileSync(file, "utf8")) as T;

function resolveUpstreamIconsDir(source: string, explicit?: string): string {
  if (explicit) return resolve(explicit);
  const beside = join(dirname(source), "..", "icons"); // npm pack 形态：package/dist/x.json + package/icons/
  if (existsSync(beside)) return resolve(beside);
  return dirname(resolve(source));
}

/** IO 侧：转换 + 拷资产 + 写文件。致命问题（清单点名了不存在的自绘资产）抛错，其余如实进报告。 */
export function importIconTheme(opts: ImportIconThemeOptions): ImportIconThemeResult {
  const root = resolve(opts.root);
  const source = resolve(root, opts.source);
  if (!existsSync(source)) throw new Error(`找不到上游主题文件：${source}`);

  const themeName = opts.name ?? basename(source).replace(/\.jsonc?$/i, "");
  const outPath = opts.out ? resolve(root, opts.out) : join(root, "icons", `${themeName}.json`);
  const assetsPath = opts.assets ? resolve(root, opts.assets) : join(root, "icons", themeName);
  const assetsDirRel = posixRel(root, assetsPath);
  if (assetsDirRel.startsWith("..")) throw new Error(`资产目录必须落在插件工程内（当前：${assetsPath}）`);

  const list = opts.list ? loadJsonc<IconImportList>(resolve(root, opts.list)) : null;
  const theme = loadJsonc<UpstreamTheme>(source);
  if (!theme.iconDefinitions || Object.keys(theme.iconDefinitions).length === 0) {
    throw new Error(`${source} 里没有 iconDefinitions —— 不是合法的 VS Code iconTheme？`);
  }

  const { mappings, upstreamAssetFiles, skippedKeys } = buildIconThemeMappings(theme, list, assetsDirRel);

  // 自绘资产先在位、再改盘：缺资产要在写任何东西之前报错（半写状态的仓最难收拾）
  const localMissing = Object.values(list?.localIcons ?? {})
    .map((n) => `${assetsDirRel}/${n}.svg`)
    .filter((rel) => !existsSync(join(root, rel)));
  if (localMissing.length > 0) {
    throw new Error(`清单点名了自绘资产，但仓里没有：${localMissing.join("、")}（映射指着它，装上也只会 404）`);
  }

  mkdirSync(assetsPath, { recursive: true });
  const upstreamIconsDir = resolveUpstreamIconsDir(source, opts.iconsDir);
  const missingAssetFiles: string[] = [];
  let copied = 0;
  for (const fileName of upstreamAssetFiles) {
    const src = join(upstreamIconsDir, fileName);
    if (!existsSync(src)) {
      missingAssetFiles.push(fileName);
      continue;
    }
    copyFileSync(src, join(assetsPath, fileName));
    copied++;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(mappings, null, 2) + "\n");

  const pluginJson = join(root, "plugin.json");
  const pluginId = existsSync(pluginJson) ? (loadJsonc<{ pluginId?: string }>(pluginJson).pluginId ?? undefined) : undefined;

  return {
    themeName,
    outPath,
    assetsPath,
    upstreamIconsDir,
    copied,
    missingAssetFiles,
    skippedKeys,
    counts: {
      extensions: Object.keys(mappings.extensions).length,
      files: Object.keys(mappings.files).length,
      folders: Object.keys(mappings.folders).length,
      foldersExpanded: Object.keys(mappings.foldersExpanded).length,
      defaults: DEFAULT_ICON_KEYS.filter(([, lk]) => lk in mappings).length,
    },
    jsonBytes: statSync(outPath).size,
    pluginId,
  };
}

/** 报告（作者要照着改 plugin.json，所以连可粘贴的片段一起给）。 */
export function renderImportReport(r: ImportIconThemeResult, root: string): string {
  const rel = (p: string) => posixRel(resolve(root), p) || p;
  const total = r.counts.extensions + r.counts.files + r.counts.folders + r.counts.foldersExpanded;
  const lines = [
    `✔ 图标主题映射已生成 → ${rel(r.outPath)}`,
    `  默认图标 ${r.counts.defaults}/5 · 映射 extensions ${r.counts.extensions} / files ${r.counts.files} /` +
      ` folders ${r.counts.folders} / foldersExpanded ${r.counts.foldersExpanded} = ${total} 条`,
    `  SVG 拷贝 ${r.copied} 个 → ${rel(r.assetsPath)}/`,
    `  体积 ${(r.jsonBytes / 1024).toFixed(1)} KB`,
  ];
  if (r.missingAssetFiles.length > 0) {
    lines.push(
      `  ⚠ 上游缺这些资产 ${r.missingAssetFiles.length} 个（映射保留，运行时 404 走保底图标）：` +
        `${r.missingAssetFiles.slice(0, 5).join("、")}${r.missingAssetFiles.length > 5 ? " …" : ""}`,
    );
  }
  if (r.skippedKeys.length > 0) {
    const keys = r.skippedKeys.slice(0, 8);
    lines.push(
      `  ⚠ 上游对不上这些键 ${r.skippedKeys.length} 个（清单里可能写错，或上游只有字体字形）：` +
        `${keys.join("、")}${r.skippedKeys.length > keys.length ? " …" : ""}`,
    );
  }
  lines.push(
    `  ⚠ 上游图标包的 LICENSE 要一并放进插件目录（多为 MIT：署名是你的事，本命令不代做）`,
    ``,
    `  接着在 plugin.json 的 contributes 里挂上它：`,
    `    "iconThemes": [{ "id": "${r.pluginId ?? "<pluginId>"}.ld-iconset-${r.themeName}",` +
      ` "label": "…", "path": "${rel(r.outPath)}" }]`,
  );
  return lines.join("\n");
}
