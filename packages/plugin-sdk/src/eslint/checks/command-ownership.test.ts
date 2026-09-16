/**
 * check-command-ownership 腿·**命令 id / 协议 id 归属判据**（E6#111b · 1.32）单测。
 *
 * 为什么值得一条测试：这条腿的**两条失效方向都是静默的**——
 *   · 太松（放过一条不带归属的 id）⇒ 壳侧按名字第一段找属主 ⇒ 两个插件撞前缀时**静默互相覆盖**
 *     （不报错、只是有一个命令永远不生效），正是本件要杀的形态；
 *   · 太紧（误伤合法 id / 把宿主保留面判错户）⇒ 插件仓白红，作者学会「看到黄就 disable」。
 * 故判据①②（本仓前缀 ／ 宿主保留面）＋ 三面（声明 ／ 运行时 ／ 协议）＋ fail-closed ＋ 豁免
 * **正反两向都钉住**，另加两条元判据：
 *   · **同一份源码 ＋ 不同 pluginId ⇒ 不同裁决**（证明真的在读 manifest，不是恒红/恒绿）；
 *   · **账读不到 ⇒ 判据② 明示空转**（不是静默绿）——账是判据② 的**唯一**输入（不许内联一份）。
 *
 * 命令 id 用**真实形态样本**（`file-tree` 的 `selectForCompare`——H3 那条「借了 `editor.` 前缀」的命令）
 * 与虚构 id 并用：真实形态才抓得到「前缀与属主不是一回事」这类错，虚构 id 用来钉边界。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeCommandId, runCommandOwnershipCheck, manifestIdLine, type HostReservedNames } from "./command-ownership.js";

/** 宿主保留面夹具（不依赖真账内容——真账会被后续轮次加家族；这里只钉判据的形状） */
const RESERVED: HostReservedNames = {
  commandPrefixes: ["workbench.", "view."],
  protocolIds: ["bracket"],
  configKeys: [],
  pseudoPluginIds: [],
  appearanceRecipeIds: [],
  appearanceColorwayIds: [],
  appearanceIconThemeIds: [],
  appearanceSentinels: [],
  appearanceIdGrants: {},
};

/** 造一个临时插件工程（manifest 写成 JSONC——作者面允许注释，读 manifest 的代码必须容忍） */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; files?: Record<string, string>; dirName?: string },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "cmd-owner-"));
  const root = opts.dirName ? join(base, opts.dirName) : base;
  mkdirSync(join(root, "src"), { recursive: true });
  if (opts.manifest !== null) {
    const raw = opts.manifest ?? {
      pluginId: "file-tree",
      name: "文件树",
      version: "1.0.0",
      contributes: { commands: [{ id: "file-tree.revealInExplorer", title: "在资源管理器中显示" }] },
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

/** 账的假路径（不存在 ⇒ 报告里 hostLedger.found = false）——用于「账读不到」这一控 */
const NO_LEDGER = join(tmpdir(), "no-such-host-reserved.json");

describe("判据①② 三面（声明 / 运行时 / 协议）", () => {
  it("正控：三面都带本仓前缀 ⇒ 零违规，且三面读数各就各位", () => {
    withPlugin(
      {
        files: {
          "src/register.ts":
            'lk.commands.registerCommand("file-tree.selectForCompare", () => 0);\n' +
            'registerProtocol({ id: "file-tree.codec", name: "编解码", pluginId: "file-tree", mode: "text" });\n',
        },
      },
      (root) => {
        const r = runCommandOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(0);
        expect(r.declaredIds).toEqual(["file-tree.revealInExplorer"]);
        expect(r.runtimeIds).toEqual(["file-tree.selectForCompare"]);
        expect(r.protocolIds).toEqual(["file-tree.codec"]);
        expect(r.pluginId).toBe("file-tree");
        expect(r.pluginIdSource).toBe("plugin.json");
      },
    );
  });

  it("N1 负控：声明面 id 前缀被删掉 ⇒ 红，报点带 文件:行 ＋「应以 file-tree. 开头」＋ 建议名", () => {
    withPlugin(
      { manifest: { pluginId: "file-tree", name: "文件树", version: "1.0.0", contributes: { commands: [{ id: "selectForCompare", title: "对比" }] } } },
      (root) => {
        const r = runCommandOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(1);
        const v = r.violations[0];
        expect(v.file).toBe("plugin.json");
        expect(v.line).toBeGreaterThan(1); // 真实行号（不是恒 1）
        expect(v.message).toContain('id "selectForCompare"');
        expect(v.message).toContain('应以 "file-tree." 开头');
        expect(r.sites[0].code).toBe("no-plugin-prefix");
        expect(r.sites[0].suggested).toBe("file-tree.selectForCompare"); // 改名映射可直接用
      },
    );
    // 还原（加回前缀）⇒ 逐字节同一份源码回到零违规
    withPlugin(
      { manifest: { pluginId: "file-tree", name: "文件树", version: "1.0.0", contributes: { commands: [{ id: "file-tree.selectForCompare", title: "对比" }] } } },
      (root) => {
        expect(runCommandOwnershipCheck(root, RESERVED, NO_LEDGER).violations).toHaveLength(0);
      },
    );
  });

  it("N2 负控：命令 id 落在宿主保留前缀里 ⇒ 红，且点名撞上哪一条", () => {
    withPlugin(
      {
        manifest: {
          pluginId: "file-tree",
          name: "文件树",
          version: "1.0.0",
          contributes: { commands: [{ id: "workbench.action.showCommands", title: "命令面板" }] },
        },
      },
      (root) => {
        const r = runCommandOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(1);
        expect(r.sites[0].code).toBe("host-reserved");
        expect(r.sites[0].reserved).toBe("workbench.");
        expect(r.violations[0].message).toContain("宿主保留面");
        // 🔴 建议值 = **只换第一段**（`workbench.` 换成自己的前缀，词干一个字不改）——
        //   与报点里的措辞必须是同一件事：措辞说「前缀只插入」而建议值把 `workbench.` 删了，
        //   第三方作者按文字做会与按建议值做得到两个不同结果（E6#111b 发布 0.1.30 修的就是这处）。
        expect(r.sites[0].suggested).toBe("file-tree.action.showCommands");
        expect(r.violations[0].message).toContain("只换第一段");
        expect(r.violations[0].message).not.toContain("前缀只插入");
      },
    );
  });

  it("N3 负控：运行时面 ＋ 真实形态样本（借了 editor. 前缀的命令）⇒ 红", () => {
    withPlugin(
      {
        files: { "src/views/Editor.ts": 'lk.commands.registerCommand("editor.selectForCompare", () => 0);\n' },
      },
      (root) => {
        const r = runCommandOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(1);
        expect(r.violations[0].file).toBe("src/views/Editor.ts");
        expect(r.violations[0].line).toBe(1);
        expect(r.sites[0].face).toBe("runtime");
        expect(r.sites[0].suggested).toBe("file-tree.selectForCompare");
      },
    );
  });

  it("协议面负控：协议 id 撞宿主内置协议 ⇒ 红（协议面比**全等**，不是前缀）", () => {
    withPlugin(
      {
        files: {
          "src/protocol.ts":
            'registerProtocol({ id: "bracket", name: "方括号", pluginId: "file-tree", mode: "text" });\n' +
            'registerProtocol({ id: "bracket-ext", name: "扩展方括号", pluginId: "file-tree", mode: "text" });\n',
        },
      },
      (root) => {
        const r = runCommandOwnershipCheck(root, RESERVED, NO_LEDGER);
        // `bracket` 撞宿主内置 ⇒ 红；`bracket-ext` 只是**不带本仓前缀**（不以 "bracket" 为保留前缀判定）
        expect(r.sites.map((s) => [s.id, s.code])).toEqual([
          ["bracket", "host-reserved"],
          ["bracket-ext", "no-plugin-prefix"],
        ]);
        expect(r.violations[0].message).toContain("宿主保留面");
      },
    );
  });

  it("元判据：同一份源码 ＋ 不同 pluginId ⇒ 不同裁决（读的是 manifest，不是恒红/恒绿）", () => {
    const files = { "src/a.ts": 'lk.commands.registerCommand("alpha.do", () => 0);\n' };
    withPlugin({ manifest: { pluginId: "alpha", name: "A", version: "1.0.0" }, files }, (root) => {
      expect(runCommandOwnershipCheck(root, RESERVED, NO_LEDGER).violations).toHaveLength(0);
    });
    withPlugin({ manifest: { pluginId: "beta", name: "B", version: "1.0.0" }, files }, (root) => {
      expect(runCommandOwnershipCheck(root, RESERVED, NO_LEDGER).violations).toHaveLength(1);
    });
  });

  it("测试/mock 文件里的字面量不报（与另几条腿同口径，免得插件仓白噪声）", () => {
    withPlugin(
      { files: { "src/a.test.ts": 'registerCommand("editor.nope", () => 0);\n' } },
      (root) => {
        const r = runCommandOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(0);
        expect(r.runtimeIds).toEqual([]);
      },
    );
  });
});

describe("fail-closed / 豁免 / 账的加载实况", () => {
  it("fail-closed：没有 plugin.json ⇒ 红一条（拿不到身份就无从判归属）", () => {
    withPlugin({ manifest: null, files: { "src/a.ts": 'registerCommand("who.knows", () => 0);\n' } }, (root) => {
      const r = runCommandOwnershipCheck(root, RESERVED, NO_LEDGER);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
      expect(r.violations[0].message).toContain("拿不到本仓 pluginId");
      expect(r.runtimeIds).toEqual([]); // 身份不明 ⇒ 不继续扫（免得把「无主」报成「不合规」）
    });
  });

  it("豁免：标准 disable 注释盖住一条运行时面报点 ⇒ 静默（知情绕行语义）", () => {
    withPlugin(
      {
        files: {
          "src/a.ts":
            "// eslint-disable-next-line linkdesk/no-unowned-command-id -- 兼容旧名，1.42 改名轮统一处理\n" +
            'lk.commands.registerCommand("editor.selectForCompare", () => 0);\n',
        },
      },
      (root) => {
        const r = runCommandOwnershipCheck(root, RESERVED, NO_LEDGER);
        expect(r.violations).toHaveLength(0);
        expect(r.runtimeIds).toEqual(["editor.selectForCompare"]); // 读数照记（豁免只影响报点）
      },
    );
  });

  it("账读不到 ⇒ 报告里明确标记（判据② 空转，不是静默绿）", () => {
    withPlugin(
      { files: { "src/a.ts": 'registerCommand("workbench.x", () => 0);\n' } },
      (root) => {
        const r = runCommandOwnershipCheck(
          root,
          { commandPrefixes: [], protocolIds: [], configKeys: [], pseudoPluginIds: [], appearanceRecipeIds: [], appearanceColorwayIds: [], appearanceIconThemeIds: [], appearanceSentinels: [], appearanceIdGrants: {} },
          NO_LEDGER,
        );
        expect(r.hostLedger.found).toBe(false);
        // 账空 ⇒ 判据② 无输入；`workbench.x` 仍因**不带本仓前缀**被 ① 报出来
        expect(r.sites[0].code).toBe("no-plugin-prefix");
      },
    );
  });
});

describe("辅助（探针与腿共用的纯函数）", () => {
  it("judgeCommandId：顺序 = 先判宿主保留面、后判本仓前缀（撞保留面时报告更严重的那条）", () => {
    expect(judgeCommandId("workbench.a", "workbench", RESERVED, "declared")?.code).toBe("host-reserved");
    expect(judgeCommandId("file-tree.a", "file-tree", RESERVED, "declared")).toBeNull();
    expect(judgeCommandId("bracket", "file-tree", RESERVED, "protocol")?.reserved).toBe("bracket");
  });

  it("manifestIdLine：找得到 ⇒ 真实行号；找不到 ⇒ 1（不抛错、不当成「不存在」）", () => {
    const raw = '{\n  "contributes": {\n    "commands": [\n      { "id": "file-tree.x" }\n    ]\n  }\n}\n';
    expect(manifestIdLine(raw, "file-tree.x")).toBe(4);
    expect(manifestIdLine(raw, "nope.y")).toBe(1);
  });
});
