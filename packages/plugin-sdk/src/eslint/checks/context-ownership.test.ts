/**
 * `check-context-ownership` 腿单测（E6#111h · 1.38）。
 *
 * 🔴 覆盖本格的三条判据分级（[1.37 §十六](../../../../../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/07-任务-上下文旗子归属评估.md) 负控 ①②③）：
 *   ① 插件设**宿主专用**旗子 ⇒ 🔴 红（进 `violations`）
 *   ② 插件设**宿主公开约定面**旗子 ⇒ 🟠 **不红也不黄**（只在 `publicFace` 登记）——**分级写错会被这条抓住**
 *   ③ 插件旗子不带本仓归属 ⇒ 🔴 红（进 `violations`）——**1.49 收紧**（1.38 落地时是黄）；理由：官方
 *      18 仓清账完成（需改处 0），且 `contextKeysPublic` 那条**裁定豁免**与判据③ 是两码事
 *   ⑦ 模板字符串拼名 ⇒ **不被抓**（**静态射程边界自证**，是边界不是 bug）
 *
 * ⚠️ `yellow` / `advisories` 两栏**保留为空容器**（探针与报告按原形状读数）——断言它们恒空，
 *    是为了「有人悄悄把判据退回黄」时当场被抓。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeContextKey, runContextOwnershipCheck } from "./context-ownership.js";
import type { HostReservedNames } from "./command-ownership.js";

/** 宿主保留面夹具（形状照真账：旗子**两段各成一格**——合成一格 = `settings` 假红） */
const RESERVED: HostReservedNames = {
  commandPrefixes: [],
  protocolIds: [],
  configKeys: [],
  pseudoPluginIds: [],
  appearanceRecipeIds: [],
  appearanceColorwayIds: [],
  appearanceIconThemeIds: [],
  appearanceSentinels: [],
  appearanceIdGrants: {},
  contextKeysHostOnly: ["activeEditor", "sidebarPosition", "inputFocus"],
  contextKeysPublic: ["settingKey", "settingFollowTheme", "settingResetsToDefault", "settingModified"],
};

const NO_LEDGER = join(tmpdir(), "no-such-host-reserved.json");

function withPlugin(
  opts: { files?: Record<string, string>; dirName?: string; pluginId?: string },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "ctx-owner-"));
  const root = opts.dirName ? join(base, opts.dirName) : base;
  mkdirSync(join(root, "src"), { recursive: true });
  const manifest = { pluginId: opts.pluginId ?? "file-tree", name: "文件树", version: "1.0.0", contributes: {} };
  writeFileSync(join(root, "plugin.json"), `{\n  // 作者允许的注释\n  ${JSON.stringify(manifest).slice(1, -1)},\n}\n`, "utf8");
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

describe("judgeContextKey —— 纯判据（只换第一段的建议名形状）", () => {
  it("🔴 宿主专用 ⇒ host-reserved（含建议名）", () => {
    const v = judgeContextKey("activeEditor", "file-tree", RESERVED);
    expect(v?.code).toBe("host-reserved");
    expect(v?.reserved).toBe("activeEditor");
    expect(v?.suggested).toBe("file-tree.activeEditor");
  });

  it("🟠 宿主公开约定面 ⇒ **null**（既不红也不黄——第三方设它合法）", () => {
    for (const k of RESERVED.contextKeysPublic) {
      expect(judgeContextKey(k, "my-plugin", RESERVED)).toBeNull();
    }
  });

  it("🟡 不带本仓前缀 ⇒ no-plugin-prefix；已带 ⇒ null", () => {
    expect(judgeContextKey("zzzFlag", "file-tree", RESERVED)?.code).toBe("no-plugin-prefix");
    expect(judgeContextKey("file-tree.zzzFlag", "file-tree", RESERVED)).toBeNull();
  });

  it("🔴 建议名**只换第一段**、词干零变化（`a.b.c` ⇒ `<pluginId>.b.c`）", () => {
    expect(judgeContextKey("a.b.c", "p", RESERVED)?.suggested).toBe("p.b.c");
    expect(judgeContextKey("explorerFocus", "p", RESERVED)?.suggested).toBe("p.explorerFocus");
  });
});

describe("runContextOwnershipCheck —— 负控 ①（宿主专用 ⇒ 红）", () => {
  it("🔴 插件设宿主专用旗子 ⇒ 进 violations ＋ red", () => {
    withPlugin({ files: { "src/a.ts": 'contextKey.set("activeEditor", null);\n' } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.violations).toHaveLength(1);
      expect(r.red).toHaveLength(1);
      expect(r.red[0].code).toBe("host-reserved");
      expect(r.red[0].file).toBe("src/a.ts");
      expect(r.red[0].line).toBe(1);
      expect(r.violations[0].message).toContain("宿主专用");
      // 🔴 报点文案必须说清「两边都不报错」的形态（1.37 §10.2 的措辞）
      expect(r.violations[0].message).toContain("两边都不报错");
    });
  });

  it("🔴 壳侧写法 ContextKeyService.setValue 同样被抓（同一件事的两张脸，只扫一支 = 漏一半）", () => {
    withPlugin({ files: { "src/b.ts": 'ContextKeyService.setValue("sidebarPosition", "left");\n' } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.red).toHaveLength(1);
      expect(r.red[0].reserved).toBe("sidebarPosition");
    });
  });
});

describe("runContextOwnershipCheck —— 负控 ②（约定面 ⇒ 不红）", () => {
  it("🟠 插件设宿主公开约定面旗子 ⇒ **零红零黄**，只在 publicFace 登记", () => {
    withPlugin({ files: { "src/a.ts": 'contextKey.set("settingFollowTheme", true);\n' } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.violations).toHaveLength(0);
      expect(r.advisories).toHaveLength(0);
      expect(r.red).toHaveLength(0);
      expect(r.yellow).toHaveLength(0);
      expect(r.publicFace).toHaveLength(1);
      expect(r.publicFace[0].key).toBe("settingFollowTheme");
      // 名数口径：设过就算扫到（探针读数用）
      expect(r.keys).toContain("settingFollowTheme");
    });
  });

  it("🔴 元判据：官方 `settings` 的 4 个约定面旗子**一个都不报红**（合成一段会在这里假红）", () => {
    const src = RESERVED.contextKeysPublic.map((k) => `contextKey.set("${k}", true);`).join("\n");
    withPlugin({ files: { "src/gearMenu.ts": src + "\n" }, pluginId: "settings" }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.violations).toHaveLength(0);
      expect(r.publicFace).toHaveLength(4);
    });
  });
});

describe("runContextOwnershipCheck —— 负控 ③（不带归属 ⇒ 🔴 红，1.49 起）", () => {
  it("🔴 插件设裸名旗子 ⇒ 进 violations ＋ red（`advisories`/`yellow` 恒空）", () => {
    withPlugin({ files: { "src/a.ts": 'contextKey.set("zzzFlag", true);\n' } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.violations).toHaveLength(1);
      expect(r.red).toHaveLength(1);
      expect(r.red[0].code).toBe("no-plugin-prefix");
      expect(r.red[0].suggested).toBe("file-tree.zzzFlag");
      // 🔴 收紧的形状断言：黄/建议两栏保留但恒空——退回黄 = 这里立刻红
      expect(r.advisories).toHaveLength(0);
      expect(r.yellow).toHaveLength(0);
    });
  });

  it("已带本仓前缀的旗子 ⇒ 全绿（判据不是在恒红）", () => {
    withPlugin({ files: { "src/a.ts": 'contextKey.set("file-tree.explorerFocus", true);\n' } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.violations).toHaveLength(0);
      expect(r.advisories).toHaveLength(0);
      expect(r.keys).toEqual(["file-tree.explorerFocus"]);
    });
  });
});

describe("射程边界（负控 ⑦：断言**不被抓**——是边界不是 bug）", () => {
  it("模板字符串**拼名** ⇒ 扫不到（登记为残余边界）", () => {
    withPlugin({ files: { "src/a.ts": "contextKey.set(`exp${x}`, 1);\n" } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.keys).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
      expect(r.advisories).toHaveLength(0);
    });
  });

  it("🔴 **无插值**的模板 = 字面量 ⇒ 要扫得到（与上一条是两只脚，缺一个就是漏一半）", () => {
    withPlugin({ files: { "src/a.ts": "contextKey.set(`activeEditor`, 1);\ncontextKey.set(`mine`, 2);\n" } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      // 第一行：宿主专用 ⇒ 红；第二行：无前缀 ⇒ 也红（1.49 起两条判据同进 violations）。**一条都不许少**
      expect(r.red.map((s) => s.code)).toEqual(["host-reserved", "no-plugin-prefix"]);
      expect(r.red.map((s) => s.key)).toEqual(["activeEditor", "mine"]);
      expect(r.yellow).toHaveLength(0);
    });
  });

  it("拼名模板**不许**被当成一个字面旗子名报出来（假红比漏报更坏）", () => {
    withPlugin({ files: { "src/a.ts": "contextKey.set(`exp${x}`, 1);\n" } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.keys.some((k) => k.includes("${"))).toBe(false);
    });
  });

  it("**常量写入**（`const K = \"...\"` 再 set(K)）⇒ 同样扫不到（与宿主侧同款边界）", () => {
    withPlugin({ files: { "src/a.ts": 'const K = "activeEditor";\ncontextKey.set(K, null);\n' } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.keys).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("测试 / mock 文件跳过（与另几条腿同口径）", () => {
    withPlugin({ files: { "src/a.test.ts": 'contextKey.set("activeEditor", null);\n' } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.violations).toHaveLength(0);
    });
  });
});

describe("fail-closed ＋ 账加载实况", () => {
  it("拿不到 pluginId ⇒ 报红且**不参与豁免**（身份问题）", () => {
    withPlugin({ dirName: "anon", pluginId: "", files: { "src/a.ts": "export const x = 1;\n" } }, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.violations.length).toBeGreaterThan(0);
      expect(r.violations[0].message).toContain("拿不到本仓 pluginId");
      expect(r.red).toHaveLength(0); // 红的是 fail-closed 那条，不是判据命中
    });
  });

  it("账读不到 ⇒ hostLedger.found = false ＋ 两段计数为 0（判据① 明示空转，不许静默绿）", () => {
    withPlugin({ files: { "src/a.ts": 'contextKey.set("activeEditor", null);\n' } }, (root) => {
      const r = runContextOwnershipCheck(root, { ...RESERVED, contextKeysHostOnly: [], contextKeysPublic: [] }, NO_LEDGER);
      expect(r.hostLedger.found).toBe(false);
      expect(r.hostLedger.contextKeysHostOnly).toBe(0);
      expect(r.hostLedger.contextKeysPublic).toBe(0);
      // 账空 ⇒ 判据① 无从命中（这正是"空转"的样子）。⚠️ 但**判据③ 照样报红**——那颗旗子裸名无归属，
      // 与账读不读到无关（1.49 起判据③ 也是红）⇒ 红的那条必须是 `no-plugin-prefix`，**不许**是 `host-reserved`
      expect(r.violations).toHaveLength(1);
      expect(r.red).toHaveLength(1);
      expect(r.red[0].code).toBe("no-plugin-prefix");
    });
  });

  it("账两段都被报告（探针要能看出两段各自的规模）", () => {
    withPlugin({}, (root) => {
      const r = runContextOwnershipCheck(root, RESERVED);
      expect(r.hostLedger.contextKeysHostOnly).toBe(3);
      expect(r.hostLedger.contextKeysPublic).toBe(4);
    });
  });
});

describe("知情绕行（disable 注释）", () => {
  it("行级 disable ⇒ 该行红站点被豁免（但名数照样记账）", () => {
    withPlugin(
      { files: { "src/a.ts": '// eslint-disable-next-line linkdesk/no-unowned-context-key -- 迁移中\ncontextKey.set("activeEditor", null);\n' } },
      (root) => {
        const r = runContextOwnershipCheck(root, RESERVED);
        expect(r.violations).toHaveLength(0);
        expect(r.keys).toContain("activeEditor");
      },
    );
  });
});
