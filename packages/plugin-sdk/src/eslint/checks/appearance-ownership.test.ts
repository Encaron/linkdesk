/**
 * check-appearance-ownership 腿·**外观族 id 归属判据**（E6#111f · 1.36）单测。
 *
 * 这条腿两侧都容易错，且错法**与另两条归属腿不同**：
 *   · 太松（放过一个宿主兜底外观 id）⇒ 装上壳后那个 id 被**运行时当场拒绝注册**，作者却在 lint 里看到全绿
 *     （"本地绿、装上炸"）；
 *   · 太紧 —— 🔴 **本腿独有的失效方向：跨空间比**。配方 id 与配色 id 是**两个名字空间**（`light`
 *     同时是两者），把四栏合成一栏比会把官方 `theme-defaults` 的配色 `light` 判成顶替配方 `light`
 *     ——**假红**，而它恰恰是宿主亮兜底的**官方实现者**（持 `light` 证照）。假红比漏报更贵：真红会跟着失效。
 *   · 太紧之二：**图标主题 id 判前缀**。§二.2 ⑦ 明令本轮不改名（改名 = 设置页可见文字变化，违「操作体验零变化」）
 *     ⇒ 报它就是报一个**不允许修**的洞。
 *   · 太紧之三（跑官方 18 仓才显形）：**宿主兜底 id 本身不判①**。给它建议 `<pluginId>.light` = 让官方实现者
 *     去改宿主的兜底名 ⇒ 断接替链，且那条建议**永远修不得**（真账形状的正控：修前 3 黄 → 修后 1 黄）。
 * 故本测试钉住：判据② 三栏按空间比 ＋ 证照放行 ／ 判据① **不判图标主题、不判兜底栏内的 id** ／ 判据① 是**黄**（★回退条件 ＋ 排序纪律）
 * ／ ③ 跨配方重复配色 ／ 两面（声明面 ＋ **主题文件面**）／ fail-closed ／ 豁免 ／ 读不出的主题文件不许变成假红。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeAppearanceId, readThemeJson, runAppearanceOwnershipCheck, themeIdLine } from "./appearance-ownership.js";
import type { HostReservedNames } from "./command-ownership.js";

/** 宿主保留面夹具（形状照真账：四栏**各成一格** ＋ 一条 `light` → `theme-defaults` 证照） */
const RESERVED: HostReservedNames = {
  commandPrefixes: [],
  protocolIds: [],
  configKeys: [],
  pseudoPluginIds: [],
  appearanceRecipeIds: ["dark", "light"],
  appearanceColorwayIds: ["dark-fallback", "light"],
  appearanceIconThemeIds: ["default"],
  appearanceSentinels: ["followTheme"],
  appearanceIdGrants: { light: ["theme-defaults"] },
  contextKeysHostOnly: [],
  contextKeysPublic: [],
};

const NO_LEDGER = join(tmpdir(), "no-such-host-reserved.json");

/** 造一个临时插件工程（manifest 写成 JSONC——作者面允许注释，读 manifest 的代码必须容忍） */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; files?: Record<string, string>; dirName?: string },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "app-owner-"));
  const root = opts.dirName ? join(base, opts.dirName) : base;
  mkdirSync(join(root, "src"), { recursive: true });
  if (opts.manifest !== null) {
    const raw = opts.manifest ?? manifest({});
    writeFileSync(join(root, "plugin.json"), `{\n  // 作者允许的注释\n  ${JSON.stringify(raw).slice(1, -1)},\n}\n`, "utf8");
  }
  for (const [rel, body] of Object.entries(opts.files ?? {})) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  try {
    fn(root);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const manifest = (contributes: Record<string, unknown>, pluginId = "file-tree"): Record<string, unknown> => ({
  pluginId,
  name: "文件树",
  version: "1.0.0",
  contributes,
});

/** 一份合规的主题 JSON（配方 `file-tree.aurora` ＋ 一个自有前缀的配色） */
const THEME_OK = JSON.stringify({
  id: "file-tree.aurora",
  name: "极光",
  type: "dark",
  colorways: [{ id: "file-tree.aurora.mint", label: "薄荷" }],
});

describe("judgeAppearanceId —— 纯判据（按空间比 ＋ 证照放行）", () => {
  const judge = (id: string, space: Parameters<typeof judgeAppearanceId>[1], pluginId = "file-tree") =>
    judgeAppearanceId(id, space, pluginId, RESERVED);

  it("判据②：占宿主兜底配方 id ⇒ host-reserved（红）＋ 建议名只换第一段", () => {
    expect(judge("light", "recipe")).toEqual({ code: "host-reserved", suggested: "file-tree.light", reserved: "light" });
    expect(judge("dark", "recipe")?.code).toBe("host-reserved");
  });

  it("🔴 假红负控：**跨空间不算命中**（配色 `light` 不是配方 `light`；反之亦然）", () => {
    // `light` 同时在两栏里 —— 在**配色**空间判它，比的是配色栏 ⇒ 命中（真账里它确在配色栏）
    expect(judge("light", "colorway")?.code).toBe("host-reserved");
    // `dark` 只在配方栏：在配色空间判它 ⇒ **不命中**（若误合成一栏，这里会红 —— 假红正控）
    expect(judge("dark", "colorway")).toEqual({ code: "no-plugin-prefix", suggested: "file-tree.dark" });
    // `dark-fallback` 只在配色栏：在配方空间判它 ⇒ 不命中
    expect(judge("dark-fallback", "recipe")).toEqual({ code: "no-plugin-prefix", suggested: "file-tree.dark-fallback" });
  });

  it("🔴 假红负控（真账那条）：`theme-defaults` 声明配方 `light` ⇒ **不是红**，也**不该给前缀建议**", () => {
    // 🔴 跑官方 18 仓实测抓到的缺陷（见文件头第二条例外）：`light` 在**配方栏**内 ⇒ 宿主兜底 id 本身不判①。
    // 修前这里报 `no-plugin-prefix` ⇒ 建议 `theme-defaults.light` ⇒ **让官方实现者去改宿主的兜底名**
    // ⇒ 断掉「保底 → 官方实现」接替链（本轴硬禁区），而那条建议**永远修不得**（报一个不允许修的洞）。
    expect(judge("light", "recipe", "theme-defaults")).toBeNull();
    expect(judge("light", "colorway", "theme-defaults")).toBeNull(); // 配色栏同理
    // 证照**只给持证者**：换个插件声明同一个 `light` ⇒ 照红
    expect(judge("light", "recipe", "theme-aurora")?.code).toBe("host-reserved");
  });

  it("🔴 判据① 对 `iconTheme` 空间**不判**（§二.2 ⑦：本轮不改名——报它 = 报一个不允许修的洞）", () => {
    expect(judge("ld-iconset-pastel", "iconTheme")).toBeNull();
  });

  it("但判据② 对 `iconTheme` 照判：占宿主保底 `default` ⇒ 红", () => {
    expect(judge("default", "iconTheme")).toEqual({ code: "host-reserved", suggested: "file-tree.default", reserved: "default" });
  });

  it("`sharedIcon` 空间**没有**宿主兜底栏 ⇒ 名字撞 `default` 也不红（宿主没有兜底共享图标）", () => {
    expect(judge("default", "sharedIcon")).toEqual({ code: "no-plugin-prefix", suggested: "file-tree.default" });
    expect(judge("file-tree.default", "sharedIcon")).toBeNull();
  });

  it("哨兵空间：按账判（插件无声明通道 ⇒ 扫描面恒不产生它，纯判据仍成立）", () => {
    expect(judge("followTheme", "sentinel")?.code).toBe("host-reserved");
  });

  it("合规：带本仓前缀 ⇒ 四个空间都零命中", () => {
    expect(judge("file-tree.aurora", "recipe")).toBeNull();
    expect(judge("file-tree.aurora.mint", "colorway")).toBeNull();
    expect(judge("file-tree.pastel", "iconTheme")).toBeNull();
    expect(judge("file-tree.logo", "sharedIcon")).toBeNull();
  });
});

describe("两面（声明面 / 主题文件面）＋ 分级", () => {
  it("正控：两面都合规 ⇒ 零红零黄，各面读数各就各位", () => {
    withPlugin(
      {
        manifest: manifest({
          themes: [{ id: "file-tree.aurora", label: "极光", path: "themes/aurora.json" }],
          iconThemes: [{ id: "ld-iconset-pastel", label: "粉彩" }],
          icons: { "file-tree.logo": { path: "icons/logo.svg" } },
        }),
        files: { "themes/aurora.json": THEME_OK },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(0);
        expect(r.advisories).toHaveLength(0);
        expect(r.declaredRecipeIds).toEqual(["file-tree.aurora"]);
        expect(r.declaredIconThemeIds).toEqual(["ld-iconset-pastel"]);
        expect(r.declaredSharedIconIds).toEqual(["file-tree.logo"]);
        expect(r.themeFileRecipeIds).toEqual(["file-tree.aurora"]);
        expect(r.themeFileColorwayIds).toEqual(["file-tree.aurora.mint"]);
        expect(r.pluginId).toBe("file-tree");
        expect(r.pluginIdSource).toBe("plugin.json");
      },
    );
  });

  it("🔴 判据② 红 ＋ 🟡 判据① 黄 **在同一例里同时断言**（分级写错也要被抓）", () => {
    withPlugin(
      {
        manifest: manifest({
          themes: [
            { id: "light", label: "亮", path: "themes/light.json" },        // 判据② ⇒ 红
            { id: "aurora-glass", label: "极光", path: "themes/ag.json" },  // 判据① ⇒ 黄
            { id: "file-tree.aurora", label: "极光2", path: "themes/a.json" }, // 合规 ⇒ 不报
          ],
        }),
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(1); // 红：只在 violations 里
        expect(r.advisories).toHaveLength(1); // 黄：只在 advisories 里（没进 violations）
        expect(r.red.map((s) => s.id)).toEqual(["light"]);
        expect(r.yellow.map((s) => s.id)).toEqual(["aurora-glass"]);
        expect(r.red[0].space).toBe("recipe");
        expect(r.red[0].face).toBe("declared");
        // 红的那条：报点带空间名 ＋ 建议名；行号是真行号（不是恒 1）
        expect(r.violations[0].file).toBe("plugin.json");
        expect(r.violations[0].line).toBeGreaterThan(1);
        expect(r.violations[0].message).toContain("配方 id");
        expect(r.violations[0].message).toContain('改成 "file-tree.light"');
        expect(r.advisories[0].message).toContain('改成 "file-tree.aurora-glass"');
      },
    );
  });

  it("🔴 真账形状的正控：`theme-defaults` 声明配方 `light` ＋ 主题文件配色 `light`/`dark` ⇒ **零红**，只剩一条黄", () => {
    withPlugin(
      {
        manifest: manifest({ themes: [{ id: "light", label: "亮", path: "themes/light.json" }] }, "theme-defaults"),
        files: {
          "themes/light.json": JSON.stringify({
            id: "light",
            name: "亮",
            type: "light",
            // `light` 撞**兜底栏** ⇒ 既是该桶的官方实现者（持证照），也不该收前缀建议（见文件头）；
            // `dark` **是** theme-defaults 自己的配色变体（不在任何兜底栏）⇒ 这条黄是**该报的**。
            colorways: [{ id: "light", label: "亮" }, { id: "dark", label: "暗" }],
          }),
        },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.red).toHaveLength(0); // ★ 1.36 立项时要除的就是这条假红
        // 修前 3 条黄（全是 `light`——三条**修不得**的建议）；修后只剩 `dark` 一条，
        // 与跑官方 18 仓的实测读数一致（theme-defaults：4 黄 → 1 黄，见文件头）。
        expect(r.yellow).toHaveLength(1);
        expect(r.yellow[0].id).toBe("dark");
        expect(r.yellow[0].space).toBe("colorway");
        expect(r.yellow[0].code).toBe("no-plugin-prefix");
        expect(r.advisories[0].message).toContain('改成 "theme-defaults.dark"');
      },
    );
  });

  it("主题文件面：配色占宿主兜底配色 id ⇒ 红（🔴 配色 id **只在主题文件里出现**——这一面缺了判据②就是瞎子）", () => {
    withPlugin(
      {
        files: {
          "themes/aurora.json": JSON.stringify(
            {
              id: "file-tree.aurora",
              name: "极光",
              type: "dark",
              colorways: [{ id: "file-tree.aurora.mint", label: "薄荷" }, { id: "dark-fallback", label: "回退" }],
            },
            null,
            2,
          ),
        },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(1);
        expect(r.red[0].space).toBe("colorway");
        expect(r.red[0].face).toBe("themeFile");
        expect(r.red[0].file).toBe("themes/aurora.json");
        expect(r.red[0].line).toBe(11); // 行号落在真出现的那一行（多行 JSON 里 `"id": "dark-fallback"` 恰在第 11 行）
        expect(r.violations[0].message).toContain("配色变体 id");
        expect(r.violations[0].message).toContain("appearanceColorwayIds");
      },
    );
  });

  it("判据③：同一插件两个配方声明同一配色 id ⇒ 黄 ＋ 登记（只在后一个文件上报）", () => {
    withPlugin(
      {
        files: {
          "themes/a.json": JSON.stringify({ id: "file-tree.a", name: "A", type: "dark", colorways: [{ id: "file-tree.mint" }] }),
          "themes/b.json": JSON.stringify({ id: "file-tree.b", name: "B", type: "dark", colorways: [{ id: "file-tree.mint" }] }),
        },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(0);
        expect(r.advisories).toHaveLength(1);
        expect(r.yellow[0].code).toBe("same-plugin-colorway");
        expect(r.yellow[0].id).toBe("file-tree.mint");
        expect(r.yellow[0].file).toBe("themes/b.json");
        expect(r.advisories[0].message).toContain("全局唯一"); // message 在 advisories 上（site 只带结构，不带文案）
      },
    );
  });

  it("🔴 已判红/黄的配色 **不** 再报判据③（同一处报两次只会稀释信号）", () => {
    withPlugin(
      {
        files: {
          "themes/a.json": JSON.stringify({ id: "file-tree.a", name: "A", type: "dark", colorways: [{ id: "mint-soda" }] }),
          "themes/b.json": JSON.stringify({ id: "file-tree.b", name: "B", type: "dark", colorways: [{ id: "mint-soda" }] }),
        },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        // `mint-soda` 不带前缀 ⇒ 两个文件各报一次判据①（黄），**没有**第三条判据③的重复
        expect(r.yellow.map((s) => s.code)).toEqual(["no-plugin-prefix", "no-plugin-prefix"]);
      },
    );
  });

  it("读不出的主题文件 ⇒ 计数报警（`themeFilesUnparsed`），**不**变成假红", () => {
    withPlugin(
      {
        files: {
          "themes/broken.json": "{ id: 这不是 JSON }\n",
          "themes/aurora.json": THEME_OK,
        },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.themeFilesUnparsed).toBe(1);
        expect(r.violations).toHaveLength(0);
        expect(r.themeFileRecipeIds).toEqual(["file-tree.aurora"]);
      },
    );
  });

  it("主题 JSON 允许注释与尾逗号（作者面同待遇）——读得出，不是「读不出就跳过」", () => {
    withPlugin(
      {
        files: {
          "themes/aurora.json": '{\n  // 极光\n  "id": "file-tree.aurora",\n  "colorways": [{ "id": "file-tree.mint", }],\n}\n',
        },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.themeFilesUnparsed).toBe(0);
        expect(r.themeFileRecipeIds).toEqual(["file-tree.aurora"]);
        expect(r.themeFileColorwayIds).toEqual(["file-tree.mint"]);
        expect(r.violations).toHaveLength(0);
      },
    );
  });

  it("🔴 主题文件面**不跳** `mock` 名文件：共享谓词 isTestOrMockRel 只认 .ts/.js 文件名（对 .json 恒 false）", () => {
    withPlugin(
      {
        files: { "themes/mock.json": JSON.stringify({ id: "light", colorways: [{ id: "dark-fallback" }] }) },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        // 出现在 `themes/` 下的 JSON 就是**真声明**（发布产物），占了宿主兜底 id 照样红
        expect(r.violations).toHaveLength(2);
        expect(r.red.map((s) => s.id)).toEqual(["light", "dark-fallback"]);
      },
    );
  });

  it("fail-closed：没有 plugin.json ⇒ 红一条（不受豁免注释管辖）", () => {
    withPlugin({ manifest: null, dirName: "no-manifest" }, (root) => {
      const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
      expect(r.violations[0].message).toContain("拿不到本仓 pluginId");
      expect(r.red).toHaveLength(0); // 红的是 fail-closed 那条，不是判据命中
    });
  });

  it("账读不到 ⇒ hostLedger.found = false ＋ 四栏计数为 0（判据② 明示空转，不许静默绿）", () => {
    withPlugin({}, (root) => {
      const empty: HostReservedNames = {
        ...RESERVED,
        appearanceRecipeIds: [],
        appearanceColorwayIds: [],
        appearanceIconThemeIds: [],
        appearanceSentinels: [],
        appearanceIdGrants: {},
      };
      const r = runAppearanceOwnershipCheck(root, empty, NO_LEDGER);
      expect(r.hostLedger.found).toBe(false);
      expect(r.hostLedger.appearanceRecipeIds).toBe(0);
      expect(r.hostLedger.appearanceIconThemeIds).toBe(0);
      expect(r.hostLedger.appearanceIdGrants).toBe(0);
      expect(r.violations).toHaveLength(0); // 账空 ⇒ 判据② 无从命中（这正是"空转"的样子）
    });
  });

  it("元判据：同一份源码 ＋ 不同 pluginId ⇒ 不同裁决（真在读 manifest，不是恒红/恒绿）", () => {
    withPlugin(
      { files: { "themes/a.json": JSON.stringify({ id: "file-tree.aurora", colorways: [{ id: "file-tree.mint" }] }) } },
      (root) => {
        expect(runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER).advisories).toHaveLength(0);
      },
    );
    withPlugin(
      {
        manifest: manifest({}, "theme-aurora"),
        files: { "themes/a.json": JSON.stringify({ id: "file-tree.aurora", colorways: [{ id: "file-tree.mint" }] }) },
      },
      (root) => {
        const r = runAppearanceOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.advisories).toHaveLength(2); // 换身份后两个 id 都成了"不带本仓前缀"
        expect(r.advisories[0].message).toContain('应以 "theme-aurora." 开头');
      },
    );
  });

  it("知情绕行：行级 disable 注释 ⇒ 该行整体静默（红也不亮）", () => {
    const raw = JSON.stringify(manifest({ themes: [{ id: "light", label: "亮" }] }));
    const base = mkdtempSync(join(tmpdir(), "app-owner-"));
    try {
      writeFileSync(
        join(base, "plugin.json"),
        `{\n  // eslint-disable-next-line linkdesk/no-unowned-appearance-id -- 本仓外观 id 迁移留待下个版本\n  ${raw.slice(1)}\n`,
        "utf8",
      );
      const r = runAppearanceOwnershipCheck(base, RESERVED, NO_LEDGER);
      expect(r.violations).toHaveLength(0); // 豁免生效
      expect(r.red).toHaveLength(0);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("小工具", () => {
  it("themeIdLine：找 `\"id\": \"<值>\"` 的真行号；找不到 ⇒ 1（不当成「不存在」）", () => {
    const raw = '{\n  "name": "x",\n  "id": "file-tree.aurora",\n  "colorways": [\n    { "id": "file-tree.mint" }\n  ]\n}\n';
    expect(themeIdLine(raw, "file-tree.aurora")).toBe(3);
    expect(themeIdLine(raw, "file-tree.mint")).toBe(5);
    expect(themeIdLine(raw, "没这个 id")).toBe(1);
  });

  it("readThemeJson：JSONC 容错 ＋ colorways 缺省为空 ＋ 坏文件 ⇒ null", () => {
    const base = mkdtempSync(join(tmpdir(), "app-owner-"));
    try {
      writeFileSync(join(base, "ok.json"), '{\n  // c\n  "id": "x",\n  "colorways": [{ "id": "y" }, { "label": "无 id" }],\n}\n', "utf8");
      writeFileSync(join(base, "bare.json"), '{"colorways": []}', "utf8");
      writeFileSync(join(base, "bad.json"), "{ 坏", "utf8");
      expect(readThemeJson(join(base, "ok.json"))).toEqual({ id: "x", colorwayIds: ["y"] });
      expect(readThemeJson(join(base, "bare.json"))).toEqual({ colorwayIds: [] });
      expect(readThemeJson(join(base, "bad.json"))).toBeNull();
      expect(readThemeJson(join(base, "缺失.json"))).toBeNull();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
