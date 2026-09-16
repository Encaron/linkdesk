/**
 * check-config-ownership 腿·**配置键归属判据**（E6#111d · 1.34）单测。
 *
 * 为什么值得一条测试：这条腿**两侧都容易错，且错法不同**——
 *   · 太松（放过一个宿主保留键）⇒ 装上壳后那个键被**运行时拒绝注册**，作者却在 lint 里看到全绿
 *     （"本地绿、装上炸"是作者最恨的一类）；太松（放过一个不带前缀的键）⇒ 键归别人名下，
 *     两个插件撞键时一个静默失效。
 *   · 太紧（把弱默认值面的键当"新键"要求前缀）⇒ **把 `configurationDefaults` 这个能力判死**
 *     （它的语义就是给**别人的**键建议弱默认值），作者只能 disable 整条腿。
 * 故：判据①（宿主保留面 ⇒ 红）／判据②（本仓前缀 ⇒ 黄）／**面差异**（`defaults` 面不判②）／
 * fail-closed ／ 豁免 —— 正反两向都钉住，另加三条元判据：
 *   · **同一份源码 ＋ 不同 pluginId ⇒ 不同裁决**（证明真在读 manifest，不是恒红/恒绿）；
 *   · **红与黄在同一例里同时断言**（`violations` 长度与 `advisories` 长度各就各位）——
 *     只测"报出来了"是不够的，**分级写错**（黄判成红）同样是这条腿的失效方向；
 *   · **账读不到 ⇒ 明示空转**（不是静默绿）——账是判据① 的**唯一**输入（不许内联一份清单）。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  judgeConfigKey,
  judgeRegisterIdentity,
  runConfigOwnershipCheck,
  type ConfigKeyFace,
} from "./config-ownership.js";
import type { HostReservedNames } from "./command-ownership.js";

/** 宿主保留面夹具（不依赖真账内容——真账会被后续轮次加家族；这里只钉判据的形状） */
const RESERVED: HostReservedNames = {
  commandPrefixes: ["workbench.", "view."],
  protocolIds: ["bracket"],
  configKeys: ["app.theme", "app.surfaceRadius", "app.schemaVersion"],
  pseudoPluginIds: ["app", "appearance", "update"],
};

const NO_LEDGER = join(tmpdir(), "no-such-host-reserved.json");

/** 造一个临时插件工程（manifest 写成 JSONC——作者面允许注释，读 manifest 的代码必须容忍） */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; files?: Record<string, string>; dirName?: string },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "cfg-owner-"));
  const root = opts.dirName ? join(base, opts.dirName) : base;
  mkdirSync(join(root, "src"), { recursive: true });
  if (opts.manifest !== null) {
    const raw = opts.manifest ?? {
      pluginId: "file-tree",
      name: "文件树",
      version: "1.0.0",
      contributes: { configuration: { title: "文件树", properties: { "file-tree.confirmDelete": { type: "boolean" } } } },
    };
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

describe("judgeConfigKey —— 纯判据（只换第一段的建议名形状）", () => {
  const judge = (key: string, face: ConfigKeyFace) => judgeConfigKey(key, "file-tree", RESERVED, face);

  it("宿主保留键 ⇒ host-reserved（红）＋ 建议名只换第一段（词干零变化）", () => {
    expect(judge("app.theme", "declared")).toEqual({
      code: "host-reserved",
      suggested: "file-tree.theme",
      reserved: "app.theme",
    });
  });

  it("退役键 app.schemaVersion 也拦（宿主从不注册它 ⇒ 这里拦它才是判据① 的硬核）", () => {
    expect(judge("app.schemaVersion", "declared")?.code).toBe("host-reserved");
  });

  it("不带本仓前缀（声明面）⇒ no-plugin-prefix（黄）＋ 建议名", () => {
    expect(judge("confirmDelete", "declared")).toEqual({ code: "no-plugin-prefix", suggested: "file-tree.confirmDelete" });
    expect(judge("explorer.confirmDelete", "declared")).toEqual({
      code: "no-plugin-prefix",
      suggested: "file-tree.confirmDelete",
    });
  });

  it("🔴 面差异：弱默认值面**不判**判据②（它的键天然是别人的键）——但判据① 照判", () => {
    expect(judge("editor.fontSize", "defaults")).toBeNull(); // 建议别人的键 = 本能力的正常用法
    expect(judge("app.theme", "defaults")?.code).toBe("host-reserved"); // 顶替宿主设置面 = 照拦
  });

  it("合规：本仓前缀 ⇒ 零命中（任何面）", () => {
    expect(judge("file-tree.confirmDelete", "declared")).toBeNull();
    expect(judge("file-tree.confirmDelete", "defaults")).toBeNull();
  });

  it("judgeRegisterIdentity：宿主伪身份 ⇒ 红；别人的 id ⇒ 黄；自己的 id ⇒ 零命中", () => {
    expect(judgeRegisterIdentity("app", "file-tree", RESERVED)?.code).toBe("host-reserved");
    expect(judgeRegisterIdentity("other-plugin", "file-tree", RESERVED)?.code).toBe("no-plugin-prefix");
    expect(judgeRegisterIdentity("file-tree", "file-tree", RESERVED)).toBeNull();
  });
});

describe("三面（声明 / 弱默认值 / 运行时）＋ 分级", () => {
  it("正控：三面都合规 ⇒ 零红零黄，三面读数各就各位", () => {
    withPlugin(
      {
        manifest: manifest({
          configuration: { title: "文件树", properties: { "file-tree.confirmDelete": { type: "boolean" } } },
          configurationDefaults: { "editor.fontSize": 13 }, // 建议别人的键 = 正常用法，不报
        }),
        files: { "src/config.ts": 'registerConfiguration("file-tree", { title: "x", properties: {} });\n' },
      },
      (root) => {
        const r = runConfigOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(0);
        expect(r.advisories).toHaveLength(0);
        expect(r.declaredKeys).toEqual(["file-tree.confirmDelete"]);
        expect(r.defaultsKeys).toEqual(["editor.fontSize"]);
        expect(r.runtimeIdentities).toEqual(["file-tree"]);
        expect(r.pluginId).toBe("file-tree");
        expect(r.pluginIdSource).toBe("plugin.json");
      },
    );
  });

  it("🔴 判据① 红 ＋ 🟡 判据② 黄 **在同一例里同时断言**（分级写错也要被抓）", () => {
    withPlugin(
      {
        manifest: manifest({
          configuration: {
            title: "文件树",
            properties: {
              "app.theme": { type: "string" },            // 判据① ⇒ 红
              "explorer.confirmDelete": { type: "boolean" }, // 判据② ⇒ 黄
              "file-tree.expandDepth": { type: "number" },   // 合规 ⇒ 不报
            },
          },
        }),
      },
      (root) => {
        const r = runConfigOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(1); // 红：只在 violations 里
        expect(r.advisories).toHaveLength(1); // 黄：只在 advisories 里（没进 violations）
        expect(r.red.map((s) => s.key)).toEqual(["app.theme"]);
        expect(r.yellow.map((s) => s.key)).toEqual(["explorer.confirmDelete"]);
        expect(r.red[0].face).toBe("declared");
        // 红的那条：报点带宿主保留键名 ＋ 建议名；行号是真行号（不是恒 1）
        expect(r.violations[0].file).toBe("plugin.json");
        expect(r.violations[0].line).toBeGreaterThan(1);
        expect(r.violations[0].message).toContain("宿主");
        expect(r.violations[0].message).toContain('改成 "file-tree.theme"');
        expect(r.advisories[0].message).toContain('改成 "file-tree.confirmDelete"');
      },
    );
  });

  it("弱默认值面：宿主键 ⇒ 红；别人的键 ⇒ 不报（同一次声明里两种结果并存）", () => {
    withPlugin(
      {
        manifest: manifest({
          configurationDefaults: { "app.surfaceRadius": 8, "editor.wordWrap": true },
        }),
      },
      (root) => {
        const r = runConfigOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(1);
        expect(r.red[0].face).toBe("defaults");
        expect(r.red[0].key).toBe("app.surfaceRadius");
        expect(r.advisories).toHaveLength(0); // editor.wordWrap 不报（面差异）
      },
    );
  });

  it("运行时面：冒充宿主身份 ⇒ 红；用别人的 id ⇒ 黄；用自己的 id ⇒ 零命中", () => {
    withPlugin(
      {
        files: {
          "src/impersonate.ts": 'registerConfiguration("app", { title: "冒充", properties: {} });\n',
          "src/borrow.ts": 'registerConfigurationDefaults("other-plugin", { "editor.fontSize": 12 });\n',
          "src/own.ts": 'registerConfiguration("file-tree", { title: "自己", properties: {} });\n',
        },
      },
      (root) => {
        const r = runConfigOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(1); // 冒充宿主 = 红
        expect(r.advisories).toHaveLength(1); // 借别人的 id = 黄
        expect(r.red[0].face).toBe("runtime");
        expect(r.red[0].key).toBe("app");
        expect(r.red[0].file).toBe("src/impersonate.ts");
        expect(r.red[0].line).toBe(1);
        expect(r.violations[0].message).toContain("宿主自己的身份");
        expect(r.yellow[0].file).toBe("src/borrow.ts");
        // 三面读数含全部身份名（合规的也在——口径：名数，非站点数）；目录遍历顺序不参与断言（比集合）
        expect([...r.runtimeIdentities].sort()).toEqual(["app", "file-tree", "other-plugin"]);
      },
    );
  });

  it("测试/mock 文件跳过（与另几条腿同口径）——夹具里的 app.* 不报", () => {
    withPlugin(
      { files: { "src/config.test.ts": 'registerConfiguration("app", { title: "夹具", properties: {} });\n' } },
      (root) => {
        const r = runConfigOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(0);
        expect(r.runtimeIdentities).toEqual([]);
      },
    );
  });

  it("fail-closed：没有 plugin.json ⇒ 红一条（不受豁免注释管辖）", () => {
    withPlugin({ manifest: null, dirName: "no-manifest" }, (root) => {
      const r = runConfigOwnershipCheck(root, RESERVED, NO_LEDGER);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
      expect(r.violations[0].message).toContain("拿不到本仓 pluginId");
      expect(r.red).toHaveLength(0); // 红的是 fail-closed 那条，不是判据命中
    });
  });

  it("账读不到 ⇒ hostLedger.found = false ＋ 两栏计数为 0（判据① 明示空转，不许静默绿）", () => {
    withPlugin({}, (root) => {
      const r = runConfigOwnershipCheck(root, { ...RESERVED, configKeys: [], pseudoPluginIds: [] }, NO_LEDGER);
      expect(r.hostLedger.found).toBe(false);
      expect(r.hostLedger.configKeys).toBe(0);
      expect(r.hostLedger.pseudoPluginIds).toBe(0);
      expect(r.violations).toHaveLength(0); // 账空 ⇒ 判据① 无从命中（这正是"空转"的样子）
    });
  });

  it("元判据：同一份源码 ＋ 不同 pluginId ⇒ 不同裁决（真在读 manifest，不是恒红）", () => {
    const body = manifest({
      configuration: { title: "x", properties: { "file-tree.confirmDelete": { type: "boolean" } } },
    });
    withPlugin({ manifest: body }, (root) => {
      expect(runConfigOwnershipCheck(root, RESERVED, NO_LEDGER).violations).toHaveLength(0);
    });
    withPlugin(
      {
        manifest: manifest({
          configuration: { title: "x", properties: { "file-tree.confirmDelete": { type: "boolean" } } },
        }, "marketplace"),
      },
      (root) => {
        const r = runConfigOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.advisories).toHaveLength(1); // 换身份后同一个键成了"不带本仓前缀"
        expect(r.advisories[0].message).toContain('应以 "marketplace." 开头');
      },
    );
  });

  it("知情绕行：行级 disable 注释 ⇒ 该行整体静默（红也不亮）", () => {
    withPlugin(
      {
        manifest: manifest({
          configuration: {
            title: "x",
            properties: {
              // disable 注释必须紧邻违规行的上一行
              "app.theme": { type: "string" },
            },
          },
        }),
      },
      (root) => {
        // 先在**没有**豁免时确认它真的会红（否则本控什么都没证明）
        expect(runConfigOwnershipCheck(root, RESERVED, NO_LEDGER).violations).toHaveLength(1);
      },
    );
    const raw = JSON.stringify(
      manifest({ configuration: { title: "x", properties: { "app.theme": { type: "string" } } } }),
    );
    const base = mkdtempSync(join(tmpdir(), "cfg-owner-"));
    try {
      writeFileSync(
        join(base, "plugin.json"),
        `{\n  // eslint-disable-next-line ${"linkdesk/no-unowned-config-key"} -- 本仓键名迁移留待下个版本\n  ${raw.slice(1)}\n`,
        "utf8",
      );
      const r = runConfigOwnershipCheck(base, RESERVED, NO_LEDGER);
      expect(r.violations).toHaveLength(0); // 豁免生效
      expect(r.red).toHaveLength(0);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
