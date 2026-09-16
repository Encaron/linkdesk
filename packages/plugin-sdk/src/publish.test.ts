/**
 * publish 纯函数测试（E6#91e，L3.7 第 3.7.2 轮）——**CHANGELOG 切段的 B1–B10 十条边界**。
 *
 * 为什么值得单列一个文件：这段切段逻辑是「未装插件『更改日志』页签」的**唯一写入方**，切错了
 * 是**发错信息**（把上一版的说明挂到新版本上）——比不显示更坏。故每条边界都钉一个用例。
 *
 * **对照基线**：文件下半 `describe("旧行为对照")` 里的 `naiveSlice` 是**朴素第一版写法**（测试专用，
 * 非生产代码）。它存在的唯一理由是满足 memory `snapshot-shadows-truth-bug-class` 的硬要求——
 * **回归测试必须证明「在旧行为上会红」**。光断言「新实现对」证明不了边界有被守住；断言「朴素写法在这条
 * 用例上给出错误结果」才是。哪些用例两种写法一致、哪些分道扬镳，逐条写明。
 */
import { describe, it, expect } from "vitest";
import {
  buildCatalogEntry,
  createEmptyCatalog,
  judgePublishReadiness,
  parsePorcelainStatus,
  readmeRawUrl,
  sliceChangelogSection,
  upsertCatalogEntry,
  withCatalogIdentity,
  type ManifestView,
} from "./publish.js";

/* ── 样本 ─────────────────────────────────────────────────────────────── */

const SAMPLE = [
  "# 更新日志",
  "",
  "## v1.2.0（2026-09-11）",
  "- 修了某某问题",
  "- 加了某个能力",
  "",
  "## v1.1.0（2026-08-01）",
  "- 旧的一条",
  "",
  "## v1.0.0（2026-07-01）",
  "- 最早的一条",
  "",
].join("\n");

const view = (version: string): ManifestView => ({ id: "demo-plugin", name: "Demo", version });

/* ── B1–B10 十条边界 ─────────────────────────────────────────────────── */

describe("sliceChangelogSection——B1–B10 边界", () => {
  it("正常路径：切出目标版本正文，到下一个段标题为止", () => {
    expect(sliceChangelogSection(SAMPLE, "1.2.0")).toBe("- 修了某某问题\n- 加了某个能力");
    expect(sliceChangelogSection(SAMPLE, "1.0.0")).toBe("- 最早的一条");
  });

  it("B1 字段缺省：无 changelog 时不写该键（不是填空串）", () => {
    // 「文件不存在」是 IO 层的事（collectPreview），纯函数层可断言的是**缺省即不写键**这条契约：
    // 渲染层对「字段缺省」与「空串」走同一兜底，但缺省更诚实。
    const entry = buildCatalogEntry(view("1.2.0"), "https://example.invalid/a.zip", 1, "owner", "2026-09-11T00:00:00Z", {});
    expect("changelog" in entry.versions[0]!).toBe(false);
    expect("readmeUrl" in entry).toBe(false);
    // 有值时两个键都在，且 changelog 落在 versions[0] 上（历史由 upsertCatalogEntry 拼）
    const filled = buildCatalogEntry(view("1.2.0"), "https://example.invalid/a.zip", 1, "owner", "2026-09-11T00:00:00Z", {
      readmeUrl: "https://example.invalid/README.md",
      changelog: "- 一条",
    });
    expect(filled.readmeUrl).toBe("https://example.invalid/README.md");
    expect(filled.versions[0]!.changelog).toBe("- 一条");
  });

  it("🔴 E6#109p-b（1.28）minAppVersion 随条目走——市场「拒装」腿的输入（此前生产端从不写它）", () => {
    // 1.27 体检抓到：市场侧读 catalog entry 的 minAppVersion 并据此拒装，而 buildCatalogEntry **不写**该键
    // ⇒ 官方 18 仓条目 0/18 有它 ⇒ 那条腿永远不触发（空转）。本条钉住「manifest → 条目」这一段。
    const withMin: ManifestView = { id: "demo-plugin", name: "Demo", version: "1.0.0", minAppVersion: "0.2.0" };
    const entry = buildCatalogEntry(withMin, "https://example.invalid/a.zip", 1, "owner", "2026-09-11T00:00:00Z", {});
    expect(entry.minAppVersion).toBe("0.2.0");
    // 缺省 ⇒ 不写该键（沿用「缺省即不写键」纪律；市场侧对 undefined 放行，两处同语义）
    expect("minAppVersion" in buildCatalogEntry(view("1.2.0"), "https://example.invalid/a.zip", 1, "owner", "x", {})).toBe(false);
  });

  it("B2 版本切不到 → undefined（绝不回落到「取第一段」）", () => {
    // 回落 = 把上一版的说明挂到新版本上，是发错信息——同 marketCatalog/select.ts「不发错包」的纪律
    expect(sliceChangelogSection(SAMPLE, "9.9.9")).toBeUndefined();
  });

  it("B2b 版本号严格相等：1.0 不吃 1.0.0（不做 semver 松弛匹配）", () => {
    expect(sliceChangelogSection(SAMPLE, "1.0")).toBeUndefined();
    expect(sliceChangelogSection(SAMPLE, "1.2")).toBeUndefined();
  });

  it("B3 段标题下直接跟下一个标题（空正文）→ undefined", () => {
    const text = "## v1.0.0\n\n## v0.9.0\n- 旧\n";
    expect(sliceChangelogSection(text, "1.0.0")).toBeUndefined();
  });

  it("B4 围栏代码块内的假标题必须跳过（贴示例日志是常态）", () => {
    const text = [
      "# 更新日志",
      "",
      "## v1.2.0（2026-09-11）",
      "示例（别当真）：",
      "",
      "```markdown",
      "## v1.1.0",
      "- 这是代码块里的假段标题",
      "```",
      "",
      "真·收尾一行",
      "",
      "## v1.1.0（2026-08-01）",
      "- 真的旧版说明",
      "",
    ].join("\n");
    // 真段标题之后的正文 = 示例块 + 收尾行，**一直到下一个真段标题**——假标题不得截断它
    const got = sliceChangelogSection(text, "1.2.0");
    expect(got).toContain("真·收尾一行");
    expect(got).toContain("- 这是代码块里的假段标题");
    expect(got).not.toContain("- 真的旧版说明");
    // 而 v1.1.0 仍能正确切出真段
    expect(sliceChangelogSection(text, "1.1.0")).toBe("- 真的旧版说明");
  });

  it("B5 CRLF 正文不带 \\r（正文内部也不带，不只是两端）", () => {
    const text = "# 更新日志\r\n\r\n## v1.0.0\r\n- 第一行\r\n- 第二行\r\n\r\n## v0.9.0\r\n- 旧\r\n";
    const got = sliceChangelogSection(text, "1.0.0");
    expect(got).toBe("- 第一行\n- 第二行");
    expect(got).not.toContain("\r");
  });

  it("B6 BOM 剥离——首行就是段标题时也能切到", () => {
    const text = "﻿## v1.0.0\n- 有 BOM 的一段\n";
    expect(sliceChangelogSection(text, "1.0.0")).toBe("- 有 BOM 的一段");
  });

  it("B7 prerelease 后缀整段捕获——不与同文件里的正式版段撞号", () => {
    const text = ["## v1.0.0", "- 正式版", "", "## v1.0.0-beta.1", "- 预发布版", ""].join("\n");
    expect(sliceChangelogSection(text, "1.0.0-beta.1")).toBe("- 预发布版");
    expect(sliceChangelogSection(text, "1.0.0")).toBe("- 正式版");
  });

  it("B8 一级标题 `# 更新日志` 不当段标题（那是文档标题，不是版本号）", () => {
    const text = "# v1.0.0\n- 这不是版本段\n";
    expect(sliceChangelogSection(text, "1.0.0")).toBeUndefined();
  });

  it("B9 标题后无括号日期也正常通过（日期本就可选）", () => {
    expect(sliceChangelogSection("## v1.0.0 后续补记\n- 一条\n", "1.0.0")).toBe("- 一条");
  });

  it("B10 Keep a Changelog 风格 `## [1.0.0] - 日期` 也认（解析器适配作者，不是反过来）", () => {
    const text = ["# Changelog", "", "## [1.2.0] - 2026-09-11", "- 新版", "", "## [1.1.0] - 2026-08-01", "- 旧版", ""].join("\n");
    expect(sliceChangelogSection(text, "1.2.0")).toBe("- 新版");
    expect(sliceChangelogSection(text, "1.1.0")).toBe("- 旧版");
  });

  it("B10b 两种主流写法混排互不干扰", () => {
    const text = ["## [1.2.0] - 2026-09-11", "- 方括号风", "", "## v1.1.0（2026-08-01）", "- 全角括号风", "", "## 1.0.0", "- 裸版本号", ""].join("\n");
    expect(sliceChangelogSection(text, "1.2.0")).toBe("- 方括号风");
    expect(sliceChangelogSection(text, "1.1.0")).toBe("- 全角括号风");
    expect(sliceChangelogSection(text, "1.0.0")).toBe("- 裸版本号");
  });

  it("B11 同版本出现多次 → 取第一个（「最新在最上」是格式约定）", () => {
    const text = ["## v1.0.0", "- 第一次出现（最新）", "", "## v1.0.0", "- 第二次出现（旧）", ""].join("\n");
    expect(sliceChangelogSection(text, "1.0.0")).toBe("- 第一次出现（最新）");
  });

  it("两侧前导 v 等价：段标题带 v、传参不带（或反之）都认", () => {
    expect(sliceChangelogSection("## v1.0.0\n- 一条\n", "v1.0.0")).toBe("- 一条");
    expect(sliceChangelogSection("## 1.0.0\n- 一条\n", "1.0.0")).toBe("- 一条");
  });

  it("`###` / `####` 容忍，`#####` 不算段标题", () => {
    expect(sliceChangelogSection("### v1.0.0\n- 三级\n", "1.0.0")).toBe("- 三级");
    expect(sliceChangelogSection("#### v1.0.0\n- 四级\n", "1.0.0")).toBe("- 四级");
    expect(sliceChangelogSection("##### v1.0.0\n- 五级不该认\n", "1.0.0")).toBeUndefined();
  });
});

/* ── readmeUrl 形态 ──────────────────────────────────────────────────── */

describe("readmeRawUrl", () => {
  it("固定形态 = raw.githubusercontent.com/{owner}/{repo}/{tag}/README.md", () => {
    expect(readmeRawUrl({ owner: "demo-owner", repo: "demo-repo" }, "v1.2.0")).toBe(
      "https://raw.githubusercontent.com/demo-owner/demo-repo/v1.2.0/README.md",
    );
  });

  it("用 tag 不用 default_branch——未装看到的与装上后看到的同源", () => {
    expect(readmeRawUrl({ owner: "o", repo: "r" }, "v1.0.0")).not.toContain("/main/");
  });
});

/* ── 旧行为对照（证明上面这些边界在朴素写法上会红）──────────────────── */

/**
 * 朴素第一版写法——**测试专用，非生产代码**。特征：按 `##` 行找段标题、正则**只捕三段版本号**、
 * 不剥 BOM、不跳围栏、`split("\n")` 不兼容 CRLF。这是真正会有人写出来的第一版，不是稻草人。
 */
function naiveSlice(text: string, version: string): string | undefined {
  const lines = text.split("\n");
  // 🔴 关键缺陷就在这条正则：只捕 `\d+.\d+.\d+` 三段——预发布号与方括号风格都漏
  const heading = /^##\s+v?(\d+\.\d+\.\d+)/;
  const target = version.replace(/^v/, "");
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const m = heading.exec(lines[i] ?? "");
    if (!m) continue;
    if (start < 0) {
      if (m[1] === target) start = i + 1;
    } else {
      end = i;
      break;
    }
  }
  if (start < 0) return undefined;
  return lines.slice(start, end).join("\n").trim() || undefined;
}

describe("旧行为对照——朴素写法在这几条上会红", () => {
  it("B4 围栏：朴素写法把代码块里的假标题当真段标题，正文被提前截断", () => {
    const text = ["## v1.2.0", "正文甲", "```", "## v1.1.0", "```", "正文乙", "", "## v1.1.0", "- 真旧版", ""].join("\n");
    expect(sliceChangelogSection(text, "1.2.0")).toBe("正文甲\n```\n## v1.1.0\n```\n正文乙");
    // 朴素：在块内的假标题处就 break → 正文腰斩（实测值 = 正文甲 + 围栏起止行；「正文乙」整段丢失）
    expect(naiveSlice(text, "1.2.0")).toBe("正文甲\n```");
  });

  it("B5 CRLF：朴素写法在正文内部留下 \\r", () => {
    const text = "## v1.0.0\r\n- 第一行\r\n- 第二行\r\n";
    expect(sliceChangelogSection(text, "1.0.0")).toBe("- 第一行\n- 第二行");
    expect(naiveSlice(text, "1.0.0")).toContain("\r");
  });

  it("B6 BOM：朴素写法匹配不到首行段标题 → 整段丢失", () => {
    const text = "﻿## v1.0.0\n- 有 BOM 的一段\n";
    expect(sliceChangelogSection(text, "1.0.0")).toBe("- 有 BOM 的一段");
    expect(naiveSlice(text, "1.0.0")).toBeUndefined();
  });

  it("B7 预发布：朴素写法只捕三段 → 预发布版整段切不到（两条段撞成同一个版本号）", () => {
    const text = ["## v1.0.0", "- 正式版", "", "## v1.0.0-beta.1", "- 预发布版", ""].join("\n");
    expect(sliceChangelogSection(text, "1.0.0-beta.1")).toBe("- 预发布版");
    // 朴素：两段都被捕成 "1.0.0"，预发布版这一版**永远切不到**（真机症状 = 该版显示「此版本未提供变更说明」）
    expect(naiveSlice(text, "1.0.0-beta.1")).toBeUndefined();
  });

  it("B10 Keep a Changelog：朴素写法认不得方括号 → 整段丢失", () => {
    const text = "## [1.0.0] - 2026-09-11\n- 方括号风\n";
    expect(sliceChangelogSection(text, "1.0.0")).toBe("- 方括号风");
    expect(naiveSlice(text, "1.0.0")).toBeUndefined();
  });

  it("诚实记账：这几条朴素写法与生产写法**一致**（不假装它们也是边界）", () => {
    // B1/B3/B8/B9 以及「切不到→undefined」在朴素写法上本来就对——写出来免得读者以为十条都靠新写法救
    expect(naiveSlice(SAMPLE, "9.9.9")).toBeUndefined(); // B2：两边都 undefined
    expect(naiveSlice(SAMPLE, "1.0.0")).toBe("- 最早的一条"); // 常规路径：两边都对
    expect(naiveSlice("## v1.0.0\n\n## v0.9.0\n- 旧\n", "1.0.0")).toBeUndefined(); // B3：两边都 undefined
  });
});

/* ── E6#106（身份图上架链路）：目录条目的图标字段必须是「未装态可解析」形态 ──────────────
 * 这一组的另一半在插件仓 marketplace 侧（CatalogRow 已装优先 + img onError 兜底）——
 * 但**「选哪张图」这件事只有 plugin.json 知道**，所以本组是根因那一侧的钉子。 */

describe("E6#106 withCatalogIdentity——图标字段转未装态可解析形态", () => {
  const remote = { owner: "Encaron", repo: "linkdesk-plugin-demo" };
  const tag = "v1.0.0";

  it("包内相对路径 → 远端 raw 直链 + iconSource:\"url\"（两条字段都转）", () => {
    const out = withCatalogIdentity(
      { id: "demo", name: "Demo", version: "1.0.0", icon: "resources/icon-bar.svg", marketIcon: "resources/icon.svg" },
      remote,
      tag,
    );
    expect(out.icon).toBe("https://raw.githubusercontent.com/Encaron/linkdesk-plugin-demo/v1.0.0/resources/icon-bar.svg");
    expect(out.marketIcon).toBe("https://raw.githubusercontent.com/Encaron/linkdesk-plugin-demo/v1.0.0/resources/icon.svg");
    // 🔴 source 必须显式 "url"：消费端 resolvePluginIcon 对「无 source 的绝对 URL」会当包内路径拼 linkdesk://
    expect(out.iconSource).toBe("url");
    expect(out.marketIconSource).toBe("url");
  });

  it("本仓真正要修的那一格：图标栏插件（icon = Type-1 剪影 + marketIcon = Type-2 身份图）两条都进条目", () => {
    const entry = buildCatalogEntry(
      withCatalogIdentity(
        { id: "serial", name: "串口", version: "1.0.9", icon: "resources/icon-bar.svg", marketIcon: "resources/icon.svg" },
        remote,
        tag,
      ),
      "https://example.invalid/a.zip",
      1,
      remote.owner,
      "2026-09-14T00:00:00Z",
      {},
    );
    expect(entry.marketIcon).toContain("/v1.0.0/resources/icon.svg");
    expect(entry.marketIconSource).toBe("url");
  });

  it("作者自填 http(s) 绝对 URL → 原样留 + 补 iconSource:\"url\"", () => {
    const out = withCatalogIdentity(
      { id: "demo", name: "Demo", version: "1.0.0", icon: "https://cdn.example.invalid/i.svg" },
      remote,
      tag,
    );
    expect(out.icon).toBe("https://cdn.example.invalid/i.svg");
    expect(out.iconSource).toBe("url");
  });

  it("lucide / codicon 图标名 → 原样留（不当路径拼 URL）；来源照声明，声明缺省照缺省", () => {
    const withSource = withCatalogIdentity({ id: "demo", name: "Demo", version: "1.0.0", icon: "Smile", iconSource: "lucide" }, remote, tag);
    expect(withSource.icon).toBe("Smile");
    expect(withSource.iconSource).toBe("lucide");
    const noSource = withCatalogIdentity({ id: "demo", name: "Demo", version: "1.0.0", icon: "terminal" }, remote, tag);
    expect(noSource.icon).toBe("terminal"); // 消费端按值推断 codicon——两处判据同源，SDK 不替它决定
    expect(noSource.iconSource).toBeUndefined();
  });

  it("无声明 → 不写键（零图可发：市场落统一默认彩色块，不塞空串）", () => {
    const out = withCatalogIdentity({ id: "demo", name: "Demo", version: "1.0.0" }, remote, tag);
    expect("icon" in out).toBe(false);
    expect("marketIcon" in out).toBe(false);
    const entry = buildCatalogEntry(out, "https://example.invalid/a.zip", 1, remote.owner, "2026-09-14T00:00:00Z", {});
    expect("marketIcon" in entry).toBe(false);
    expect("icon" in entry).toBe(false);
  });

  it("合并保历史：新版没声明 marketIcon 时，不让已收录条目塌成默认块", () => {
    const first = buildCatalogEntry(
      withCatalogIdentity({ id: "demo", name: "Demo", version: "1.0.0", marketIcon: "resources/icon.svg" }, remote, tag),
      "https://example.invalid/v1.zip", 1, remote.owner, "2026-09-14T00:00:00Z", {},
    );
    const second = buildCatalogEntry(
      withCatalogIdentity({ id: "demo", name: "Demo", version: "1.1.0" }, remote, "v1.1.0"),
      "https://example.invalid/v11.zip", 1, remote.owner, "2026-09-15T00:00:00Z", {},
    );
    const merged = upsertCatalogEntry(upsertCatalogEntry(createEmptyCatalog(), first), second);
    expect(merged.plugins[0]!.marketIcon).toBe(first.marketIcon);
  });
});

/* ────────────────────────────────────────────────────────────────────────
   发布前置断言（E6#68c，2026-09-15 用户拍板「做成机械门禁」）。
   实测来源：本机代理进程死掉那段时间，`git push` 失败而 `publish` **照样成功** ⇒
   Release 与 asset 都对（asset 取自本地工作区），但 tag 打在**没推上去的旧 HEAD** 上
   ⇒ 目录条目里的 icon / readmeUrl 直链（raw/…/v<版本>/…）全 404。
   下面每条用例对应一个真实会发生的形态，不是凑覆盖率。
   ──────────────────────────────────────────────────────────────────────── */
describe("judgePublishReadiness——发布前置断言", () => {
  it("本地 HEAD == 远端 HEAD 且工作区干净 → 放行", () => {
    expect(judgePublishReadiness({ localHead: "a".repeat(40), remoteHead: "a".repeat(40), dirtyFiles: [] })).toEqual({ ok: true });
  });

  it("本地 HEAD ≠ 远端 HEAD（那笔提交没推上去）→ 拦，且必须给出修法", () => {
    const v = judgePublishReadiness({ localHead: "a".repeat(40), remoteHead: "b".repeat(40), dirtyFiles: [] });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.kind).toBe("unpushed");
      expect(v.message).toContain("本地 HEAD 还没推上去");
      expect(v.message).toContain("git push");
      expect(v.message).toContain("404"); // 讲清后果，不只是「不许」
    }
  });

  it("工作区脏（已跟踪文件有未提交改动）→ 拦，且把文件名念出来", () => {
    const v = judgePublishReadiness({ localHead: "a".repeat(40), remoteHead: "a".repeat(40), dirtyFiles: [" M plugin.json", "M  README.md"] });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.kind).toBe("dirty");
      expect(v.message).toContain(" M plugin.json");
      expect(v.message).toContain("M  README.md");
    }
  });

  it("两个都犯 → 先报脏（更上游：脏工作区打出来的包根本不在任何提交里）", () => {
    const v = judgePublishReadiness({ localHead: "a".repeat(40), remoteHead: "b".repeat(40), dirtyFiles: [" M x"] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.kind).toBe("dirty");
  });

  it("读不到远端 HEAD（空仓 / 权限 / API 抖）→ **放行 + 说明**，不判红（假红让真红失效）", () => {
    const v = judgePublishReadiness({ localHead: "a".repeat(40), remoteHead: null, dirtyFiles: [] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.skipped).toContain("远端 HEAD");
  });

  it("读不到本地 HEAD（非 git / git 不在 PATH）→ 同样放行 + 说明", () => {
    const v = judgePublishReadiness({ localHead: null, remoteHead: "b".repeat(40), dirtyFiles: [] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.skipped).toContain("本地 HEAD");
  });

  it("分叉（两笔互不在对方历史里）也是 local≠remote ⇒ 拦——tag 同样指向缺文件的那个提交", () => {
    const v = judgePublishReadiness({ localHead: "abc1234".padEnd(40, "0"), remoteHead: "def5678".padEnd(40, "0"), dirtyFiles: [] });
    expect(v.ok).toBe(false);
  });

  it("报错里只印 7 位短 sha（40 位原样倒出来扫一眼读不出）", () => {
    const v = judgePublishReadiness({ localHead: "1234567" + "0".repeat(33), remoteHead: "7654321" + "0".repeat(33), dirtyFiles: [] });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.message).toContain("1234567");
      expect(v.message).toContain("7654321");
      expect(v.message).not.toContain("0".repeat(20)); // 没把 40 位原样倒出来
    }
  });
});

describe("parsePorcelainStatus——git status 解析", () => {
  it("空输出 / 只有换行 → 空数组（不是「脏了一条空路径」）", () => {
    expect(parsePorcelainStatus("")).toEqual([]);
    expect(parsePorcelainStatus("\n")).toEqual([]);
    expect(parsePorcelainStatus("\r\n\r\n")).toEqual([]);
  });

  it("CRLF 与 LF 两种 git 输出都解析得出", () => {
    expect(parsePorcelainStatus(" M a.ts\nM  b.json\n")).toHaveLength(2);
    expect(parsePorcelainStatus(" M a.ts\r\nM  b.json\r\n")).toHaveLength(2);
  });

  it("原样保留 XY 状态码（作者靠它看懂是「改了没暂存」还是「已暂存」）", () => {
    expect(parsePorcelainStatus("MM plugin.json")).toEqual(["MM plugin.json"]);
  });
});
