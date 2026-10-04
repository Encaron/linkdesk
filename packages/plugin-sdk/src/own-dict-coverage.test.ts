/**
 * `own-dict-coverage` 判据单测——**作者侧与壳侧共用的那一条腿**（用户的「谁的仓谁译文」）。
 *
 * 覆盖取向（与 `scripts/audit-i18n.mjs` 的壳侧调用点互补，不是复刻）：
 *   ① 判据本体的**正样本 / 负样本**（负控用 E6#161 的真形态：settings 那种「零字典声明」）；
 *   ② **反向对照**：旧字段表（只有 `title`/`label` 那批）必漏 `group`/`subtitle`/`groupDescriptions`/
 *      `enumDescriptions`——不证这一点，「扩了域」就是自说自话（E6#161 根因②）；
 *   ③ **豁免真的豁免**：`commands[].description` / `params[].description`（声明数据 → AI）不进清单；
 *   ④ **subpath 导出面**（按包名 `@linkdesk/plugin-sdk/own-dict-coverage` 引——exports map 一旦写错，
 *      16 个插件仓的 CI 会整片红，本测是那个面在仓内的唯一证人）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import {
  OWN_DICT_CALIBER,
  RENDERABLE_MANIFEST_FIELDS,
  THEME_FILE_NAME_FIELDS,
  checkOwnDictCoverage,
  collectOwnDictDecls,
  collectRenderableManifestStrings,
  collectRenderableThemeStrings,
  collectSourceTKeys,
  formatOwnDictIssue,
  loadOwnDict,
  ownDictHint,
} from "@linkdesk/plugin-sdk/own-dict-coverage";

const roots: string[] = [];
/** 造一只临时插件仓（`files` = 相对路径 → 内容），返回绝对根 */
function fixture(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "ldk-own-dict-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
  }
  return root;
}
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** E6#161 的真形态：设置仓那段声明（中文原文 ＋ 无 i18n 声明） */
const SETTINGS_LIKE = {
  pluginId: "settings",
  name: "设置",
  description: "软件设置——主题、语言、插件管理",
  contributes: {
    viewsContainers: { settings: { title: "设置", location: "auxiliarybar" } },
    views: { settings: [{ id: "settings", title: "设置", render: "src/index.tsx" }] },
    commands: [
      {
        id: "settings.editKeybinding",
        title: "修改快捷键…",
        description: "打开快捷键编辑——声明数据，不是 UI 文字",
        params: [{ name: "command", type: "string", description: "命令 id——同样是声明数据" }],
      },
    ],
    configuration: {
      title: "设置插件",
      subtitle: "这一组管的是设置页自己",
      groupDescriptions: { 打开方式: "第一次打开时的形态" },
      properties: {
        "settings.openForm": {
          type: "string",
          default: "floatingPanel",
          group: "打开方式",
          title: "打开形态",
          description: "打开设置时的形态——悬浮面板 / 标签页",
          enumDescriptions: { floatingPanel: "悬浮面板", tab: "标签页" },
        },
      },
    },
    menus: { "editor/title": [{ command: "settings.editKeybinding", label: "修改快捷键…", children: [{ command: "x", label: "深层子菜单" }] }] },
    titleBar: { right: [{ command: "settings.editKeybinding", label: "设置" }] },
    fileAssociations: [{ extension: "dxf", displayName: "打开方式：DXF 查看器" }],
  },
};

describe("collectRenderableManifestStrings（判据字段表）", () => {
  it("扩域后的字段表收得到 settings 那段声明的每一条（E6#161 的真形态）", () => {
    const texts = collectRenderableManifestStrings(SETTINGS_LIKE).map((s) => s.text);
    for (const t of [
      "设置", // name / viewsContainers.title / views[].title / titleBar.left|right[].label
      "软件设置——主题、语言、插件管理", // 顶层 description
      "修改快捷键…", // commands[].title（含菜单 label）
      "设置插件", // configuration.title
      "这一组管的是设置页自己", // configuration.subtitle
      "第一次打开时的形态", // groupDescriptions 的值
      "打开方式", // properties.*.group
      "打开形态", // properties.*.title（配置项短名族，2026-10-04 D1）
      "打开设置时的形态——悬浮面板 / 标签页", // properties.*.description
      "悬浮面板", // enumDescriptions 值（对象形态）
      "深层子菜单", // menus 的 children 递归
      "打开方式：DXF 查看器", // fileAssociations[].displayName
    ]) {
      expect(texts, `漏收：${t}`).toContain(t);
    }
  });

  it("豁免守住：commands[].description / params[].description 是声明数据（→ AI），不进判据", () => {
    const texts = collectRenderableManifestStrings(SETTINGS_LIKE).map((s) => s.text);
    expect(texts).not.toContain("打开快捷键编辑——声明数据，不是 UI 文字");
    expect(texts).not.toContain("命令 id——同样是声明数据");
    // 字段表里也不许出现 description 落在 commands / params 上的规格
    const commandDesc = RENDERABLE_MANIFEST_FIELDS.filter(
      (f) => f.field === "description" && f.steps.includes("commands"),
    );
    expect(commandDesc).toHaveLength(0);
  });

  it("反向对照：旧字段表（只有 title / label 那批）必漏「配置页那四类」——扩域不是自说自话", () => {
    const OLD = new Set(["title", "titleDescription", "titleTooltip", "singleViewPaneContainerTitle", "label"]);
    const all = collectRenderableManifestStrings(SETTINGS_LIKE);
    const missedByOld = all.filter((s) => {
      const leaf = s.field.split(".").pop();
      return !OLD.has(leaf ?? "");
    });
    // 旧名单够不着：configuration.subtitle / groupDescriptions 值 / properties.*.group / enumDescriptions 值 / 顶层 name+description
    expect(missedByOld.map((s) => s.field).join("\n")).toMatch(/configuration\.subtitle/);
    expect(missedByOld.map((s) => s.field).join("\n")).toMatch(/groupDescriptions/);
    expect(missedByOld.length).toBeGreaterThanOrEqual(5);
  });

  it("enumDescriptions 的数组形态（壳侧那种）同样收得到", () => {
    const m = {
      contributes: {
        configuration: { title: "T", properties: { k: { type: "string", default: "a", enum: ["a"], enumDescriptions: ["甲", "乙"] } } },
      },
    };
    const texts = collectRenderableManifestStrings(m).map((s) => s.text);
    expect(texts).toContain("甲");
    expect(texts).toContain("乙");
  });

  it("非中文原文插件不在此列（英文/法文插件 = 设计允许，缺译文静默回退是设计意图）", () => {
    const m = { name: "Hello World", description: "A demo plugin", contributes: { viewsContainers: { x: { title: "Demo" } } } };
    expect(collectRenderableManifestStrings(m)).toHaveLength(0);
  });
});

describe("checkOwnDictCoverage（两条判据 ＋ 严重度）", () => {
  it("零字典声明 ⇒ 每条可渲染串都是 manifest 缺口（settings 的真形态：一份自己的字典都没有）", () => {
    const root = fixture({ "plugin.json": SETTINGS_LIKE });
    const r = checkOwnDictCoverage(root, { manifest: SETTINGS_LIKE });
    expect(r.dict.files).toHaveLength(0);
    expect(r.manifestGap.length).toBeGreaterThan(0);
    expect(r.manifestGap.map((g) => g.text)).toContain("打开方式");
    expect(r.degraded).toBe(false); // 「没声明」不是「读不动」——照判，不回退
  });

  it("正样本：自有字典补齐后缺口清零（作者仓的验收形态）", () => {
    const dict = Object.fromEntries(
      collectRenderableManifestStrings(SETTINGS_LIKE).map((s) => [s.text, `en:${s.text}`]),
    );
    const manifest = { ...SETTINGS_LIKE, contributes: { ...SETTINGS_LIKE.contributes, i18n: { en: "i18n/en.json" } } };
    const root = fixture({ "plugin.json": manifest, "i18n/en.json": dict });
    const r = checkOwnDictCoverage(root, { manifest });
    expect(r.manifestGap).toHaveLength(0);
    expect(r.dict.files).toHaveLength(1);
    expect(r.dict.files[0].rel).toBe("i18n/en.json");
  });

  it("源码腿是黄灯：本仓 t(\"中文\") 没住自有字典 ⇒ sourceGap 里，但不动 manifest 腿", () => {
    const manifest = { pluginId: "p", contributes: { viewsContainers: { p: { title: "面板" } }, i18n: { en: "i18n/en.json" } } };
    const root = fixture({
      "plugin.json": manifest,
      "i18n/en.json": { 面板: "Panel" },
      "src/view.tsx": `export const A = () => t("保存失败：");\nconst b = t("Panel");\nconst c = t("保存失败：");`,
      "src/view.test.tsx": `it("x", () => t("测试串不该进判据"));`,
    });
    const r = checkOwnDictCoverage(root, { manifest });
    expect(r.manifestGap).toHaveLength(0);
    expect(r.sourceGap.map((g) => g.key)).toEqual(["保存失败："]);
    expect(r.sourceGap[0].at).toEqual(["src/view.tsx"]); // 同 key 多处只记一行，测试文件不扫
    expect(collectSourceTKeys(root).some((k) => k.key === "测试串不该进判据")).toBe(false);
  });

  it("字典声明的文件读不到 ⇒ degraded（调用方据此跳过判红——「全是 gap」是假红）", () => {
    const manifest = { contributes: { i18n: { en: "i18n/en.json" }, viewsContainers: { p: { title: "面板" } } } };
    const root = fixture({ "plugin.json": manifest });
    const r = checkOwnDictCoverage(root, { manifest });
    expect(r.degraded).toBe(true);
    expect(r.problems[0]).toMatch(/i18n\/en\.json/);
    expect(r.manifestGap.length).toBeGreaterThan(0); // 数据照给，判不判红由调用方定
  });

  it("contributes.languages[].path 也算自有字典（语言包形态）", () => {
    const m = { contributes: { languages: [{ id: "en", label: "English", path: "lang/en.json" }] } };
    expect(collectOwnDictDecls(m).map((d) => d.rel)).toEqual(["lang/en.json"]);
    const root = fixture({ "plugin.json": m, "lang/en.json": { 甲: "A" } });
    expect(loadOwnDict(root, m).keys.has("甲")).toBe(true);
  });
});

describe("口径与报错文案（两轴同款）", () => {
  it("formatOwnDictIssue / ownDictHint 两条腿各给各的说法", () => {
    const manifestIssue = { text: "打开方式", field: "contributes.configuration.properties.settings.openForm.group", consumer: "设置页二级标题" };
    const sourceIssue = { key: "保存失败：", at: ["src/a.ts", "src/b.ts"] };
    expect(formatOwnDictIssue(manifestIssue)).toMatch(/打开方式.*设置页二级标题/);
    expect(formatOwnDictIssue(sourceIssue)).toMatch(/保存失败：.*t\(\)/);
    expect(ownDictHint(manifestIssue)).toMatch(/contributes\.i18n/);
    expect(ownDictHint(manifestIssue)).toMatch(/别去改官方语言包/);
    expect(ownDictHint(sourceIssue)).toMatch(/黄灯不拦/);
    expect(OWN_DICT_CALIBER).toMatch(/谁的仓/);
    expect(OWN_DICT_CALIBER).toMatch(/主题数据文件里的名字/); // 2026-10-01 扩域：口径句跟着改
  });
});

describe("主题数据文件名（2026-10-01「不要双语了」扩域）", () => {
  /** 真形态：`contributes.themes[].label` ＋ 数据文件 `name` / `colorways[].name` */
  const themeManifest = (label: string) => ({
    name: "薄荷苏打",
    contributes: {
      themes: [{ id: "p.mint", label, uiTheme: "light", path: "themes/mint.json" }],
      i18n: { en: "i18n/en.json" },
    },
  });
  const themeData = {
    id: "p.mint",
    name: "薄荷苏打",
    type: "light",
    colorways: [{ id: "p.mint", name: "薄荷冰露" }],
  };

  it("数据文件里的配方名 / 配色名进判域，且报错指路到文件（旧判据从不读数据文件）", () => {
    const manifest = themeManifest("薄荷苏打 Mint Soda");
    const root = fixture({
      "plugin.json": manifest,
      "themes/mint.json": themeData,
      "i18n/en.json": { 薄荷苏打: "Mint Soda" },
    });
    const r = checkOwnDictCoverage(root, { manifest });
    const texts = r.manifestGap.map((g) => g.text);
    expect(texts).toContain("薄荷苏打 Mint Soda"); // 双语字面量：字典里没有这一条 ⇒ 红
    expect(texts).toContain("薄荷冰露"); // 数据文件配色名
    expect(r.scanned.themeStrings).toBeGreaterThan(0);
    expect(r.manifestGap.find((g) => g.text === "薄荷冰露")?.field).toBe("themes/mint.json.colorways[].name");
    // 「薄荷苏打」在 label / 数据文件 name / 顶层 name 三处同串，字典里有 ⇒ 一条缺口都不报
    expect(r.manifestGap.filter((g) => g.text === "薄荷苏打")).toHaveLength(0);
  });

  it("去双语后的验收形态：字面量纯中文 ＋ 本仓字典补齐 ⇒ 缺口清零", () => {
    const manifest = themeManifest("薄荷苏打");
    const root = fixture({
      "plugin.json": manifest,
      "themes/mint.json": themeData,
      "i18n/en.json": { 薄荷苏打: "Mint Soda", 薄荷冰露: "Mint Frost" },
    });
    const r = checkOwnDictCoverage(root, { manifest });
    expect(r.manifestGap).toHaveLength(0);
    expect(r.degraded).toBe(false);
    expect(collectRenderableThemeStrings(root, manifest).strings.map((s) => s.text)).toEqual(["薄荷苏打", "薄荷冰露"]);
  });

  it("数据文件读不动 ⇒ degraded（「读不着」不是「没译」，判红就是假红）", () => {
    const manifest = themeManifest("薄荷苏打");
    const root = fixture({ "plugin.json": manifest, "i18n/en.json": { 薄荷苏打: "Mint Soda" } });
    const r = checkOwnDictCoverage(root, { manifest });
    expect(r.degraded).toBe(true);
    expect(r.problems.join(" ")).toMatch(/themes\/mint\.json/);
  });

  it("图标主题 label 进判域（2026-10-01 显示面打通 ⇒ 同笔纳入）：住字典放行、没住判红", () => {
    const iconThemes = [{ id: "p.icons", label: "粉彩图标集", path: "icons/pastel.json" }];
    const withDict = { contributes: { iconThemes, i18n: { en: "i18n/en.json" } } };
    const noDict = { contributes: { iconThemes } };
    // ① 已被收成可渲染串，落点/消费方写清（下拉那条字）
    const strings = collectRenderableManifestStrings(noDict);
    expect(strings.map((s) => s.text)).toEqual(["粉彩图标集"]);
    expect(strings[0].field).toBe("contributes.iconThemes[].label");
    expect(strings[0].consumer).toContain("图标主题");
    // ② 住本仓字典 ⇒ 放行（图标数据文件是 mappings、无显示名字段——不进判域，故 fixture 随便给）
    const ok = fixture({
      "plugin.json": withDict,
      "icons/pastel.json": { file: { imagePath: "a.svg" } },
      "i18n/en.json": { 粉彩图标集: "Pastel Icon Set" },
    });
    expect(checkOwnDictCoverage(ok, { manifest: withDict }).manifestGap).toHaveLength(0);
    // ③ 反向负控（E6#165 的真病灶形态）：文案在本仓声明、译名却在别的仓（或没有）⇒ 必判红
    const bad = fixture({ "plugin.json": noDict, "icons/pastel.json": { file: { imagePath: "a.svg" } } });
    expect(checkOwnDictCoverage(bad, { manifest: noDict }).manifestGap.map((g) => g.text)).toEqual(["粉彩图标集"]);
  });

  it("THEME_FILE_NAME_FIELDS = 数据文件那条腿的判据表（配方名 ＋ 配色名）", () => {
    expect(THEME_FILE_NAME_FIELDS.map((f) => f.field)).toEqual(["name", "name"]);
    expect(THEME_FILE_NAME_FIELDS[1].steps).toEqual(["colorways", "[]"]);
    // 没声明 path ⇒ 没有数据文件可判，不当缺口报（自洽性归作者仓 ci-verify ④ 段）
    const noPath = { contributes: { themes: [{ id: "x", label: "纯净主题" }], i18n: { en: "i18n/en.json" } } };
    const root = fixture({ "plugin.json": noPath, "i18n/en.json": { 纯净主题: "Pure" } });
    expect(checkOwnDictCoverage(root, { manifest: noPath }).manifestGap).toHaveLength(0);
  });
});
