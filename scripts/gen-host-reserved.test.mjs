/**
 * gen-host-reserved 的内联自测（E6#0.6d 第一刀·自测外迁）。
 *
 * 原先这段（夹具 fixture ＋ 正控 11 ／ 负控 16）住在主文件里。自测是测试、不是生产体量：按仓库
 * 既有惯例（`*.test.*` 不计入门禁）外迁到同名测试模块；主文件只留 `--self-test` 转发，调用面零变化。
 * ⚠️ 判据语义一字未改——逐例实跑 `checkAll()` / 抽取函数断言；夹具全在内存（另有两条真仓重扫正控）。
 */
import {
  APPEARANCE_COLUMNS,
  LEDGER_COMMENT,
  LEDGER_VERSION,
  checkAll,
  collectHostReserved,
  diffGrants,
  extractWhenExpressions,
  renderRuntimeModule,
  whenKeys,
} from "./gen-host-reserved.mjs";

/* ── 自测（正控会绿 / 负控会红）────────────────────────────────────── */
function fixture() {
  const ledger = {
    $comment: LEDGER_COMMENT,
    version: LEDGER_VERSION,
    commandPrefixes: ["app.", "view."],
    configKeys: ["app.theme"],
    pseudoPluginIds: ["app"],
    contextKeysHostOnly: ["activeEditor"],
    contextKeysPublic: ["settingKey"],
    appearanceRecipeIds: ["dark", "light"],
    appearanceColorwayIds: ["dark-fallback", "light"],
    appearanceIconThemeIds: ["default"],
    appearanceSentinels: ["followTheme"],
    appearanceIdGrants: { light: ["theme-defaults"] },
    protocolIds: ["bracket"],
  };
  const raw = JSON.stringify(ledger, null, 2) + "\n";
  return { ledger, raw, actual: JSON.parse(JSON.stringify(ledger)) };
}

export function selfTest() {
  const cases = [];
  const T = (name, mutate = () => ({}), kinds = []) => {
    const f = fixture();
    const r = mutate(f) ?? {};
    const ledger = r.ledger ?? f.ledger;
    const actual = r.actual ?? f.actual;
    const sdkRaw = r.sdkRaw === undefined ? f.raw : r.sdkRaw;
    const ledgerRaw = r.ledgerRaw ?? f.raw;
    // 运行时副本默认与（可能被改过的）账同步——只有专门测第四向的负控才显式传 runtimeRaw
    const runtimeRaw = r.runtimeRaw === undefined ? renderRuntimeModule(ledger) : r.runtimeRaw;
    const got = checkAll({ ledger, actual, sdkRaw, ledgerRaw, runtimeRaw });
    const ok = kinds.length === 0 ? got.length === 0 : kinds.every((k) => got.some((v) => v.kind === k));
    cases.push([name, ok, got.map((v) => v.kind)]);
  };

  // 🔴 正控
  T("正控①：账 = 实况 = SDK 副本 = 运行时模块 ⇒ 绿");
  T("正控②：账里家族内顺序颠倒（集合不变）⇒ 绿（比的是集合，不是顺序）", (f) => {
    f.ledger.commandPrefixes = [...f.ledger.commandPrefixes].reverse();
    return {};
  });
  T("正控③：运行时模块与账逐元素相同（第四向基线）⇒ 绿", (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger) }));
  /* 🔴 1.49 新增：`version` 字段本身（正控 ＋ 两条负控）——见 `diffVersion` 的注释：没有它，
   *  「两边一起被手改成同一个错值」在四向对账里全绿。 */
  T("正控③-b：账带正整数 version（与生成器常量一致）⇒ 绿");
  T(
    "负控③-c：账缺 version ⇒ 红（version-bad）",
    (f) => {
      delete f.ledger.version;
      return { sdkRaw: JSON.stringify(f.ledger, null, 2) + "\n", ledgerRaw: JSON.stringify(f.ledger, null, 2) + "\n" };
    },
    ["version-bad"],
  );
  T(
    "负控③-d：账 version 被手改（两侧一起改 ⇒ 逐字节那向看不出来）⇒ 红（version-drift）",
    (f) => {
      f.ledger.version = 99;
      const raw = JSON.stringify(f.ledger, null, 2) + "\n";
      return { sdkRaw: raw, ledgerRaw: raw };
    },
    ["version-drift"],
  );

  // 🔴 负控①：实况多一条（改了宿主面忘重跑）
  T(
    "负控①：实况多一条命令前缀 ⇒ 红（ledger-missing）",
    (f) => {
      f.actual.commandPrefixes = [...f.actual.commandPrefixes, "core."];
      return {};
    },
    ["ledger-missing"],
  );
  // 🔴 负控②：账多一条（陈旧 / 手改）
  T(
    "负控②：账多一条配置键 ⇒ 红（ledger-stale）",
    (f) => {
      f.ledger.configKeys = [...f.ledger.configKeys, "app.ghost"];
      return {};
    },
    ["ledger-stale"],
  );
  // 🔴 负控③：家族整段被删（后面逐条比对已无意义）
  T(
    "负控③：账里 contextKeysHostOnly 段被删 ⇒ 红（family-missing）",
    (f) => {
      delete f.ledger.contextKeysHostOnly;
      return {};
    },
    ["family-missing"],
  );
  // 🔴 负控④：实况某家族为空（扫描目录被搬走 ⇒ 空家族会假装通过）
  T(
    "负控④：实况某家族为空 ⇒ 红（family-empty）",
    (f) => {
      f.actual.appearanceColorwayIds = [];
      return {};
    },
    ["family-empty"],
  );
  // 🔴 负控⑤：SDK 副本不存在
  T("负控⑤：SDK 副本缺失 ⇒ 红（sdk-missing）", () => ({ sdkRaw: null }), ["sdk-missing"]);
  // 🔴 负控⑥：SDK 副本漂移（改一个字）
  T(
    "负控⑥：SDK 副本与壳账不同 ⇒ 红（sdk-drift）",
    () => ({ sdkRaw: JSON.stringify(fixture().ledger, null, 2).replace('"dark"', '"light"') + "\n" }),
    ["sdk-drift"],
  );
  // 🔴 负控⑦：运行时模块漂一个键（第四向——最坏的那种漂：两边都"绿"）
  T(
    "负控⑦：运行时模块里一个配置键被改 ⇒ 红（runtime-drift）",
    (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger).replace('"app.theme"', '"app.themeX"') }),
    ["runtime-drift"],
  );
  // 🔴 负控⑧：运行时模块不存在
  T("负控⑧：运行时模块缺失 ⇒ 红（runtime-missing）", () => ({ runtimeRaw: null }), ["runtime-missing"]);

  /* ── 1.36 新增：外观四栏 ＋ 证照 ─────────────────────────────────── */
  // 🔴 负控⑨：账里没有证照段（外观判据的「正当持有者」无从判定）
  T(
    "负控⑨：账里没有 appearanceIdGrants ⇒ 红（grant-missing）",
    (f) => {
      delete f.ledger.appearanceIdGrants;
      return {};
    },
    ["grant-missing"],
  );
  // 🔴 负控⑩：证照指向不在四栏里的 id（id 改名后证照留原地 = 一条永不生效的宽恕）
  T(
    "负控⑩：证照指向不在四栏里的 id ⇒ 红（grant-dangling）",
    (f) => {
      f.ledger.appearanceIdGrants = { ghost: ["theme-defaults"] };
      return {};
    },
    ["grant-dangling"],
  );
  // 🔴 负控⑪：证照没有持有者（「有证照」却不写持有人 = 宽恕一切）
  T(
    "负控⑪：证照持有者为空数组 ⇒ 红（grant-empty）",
    (f) => {
      f.ledger.appearanceIdGrants = { light: [] };
      f.actual.appearanceIdGrants = { light: [] };
      return {};
    },
    ["grant-empty"],
  );
  // 🔴 负控⑫：运行时模块漏掉一个外观 id（第五向——按空间渲染后仍逐字节比对）
  T(
    "负控⑫：运行时模块漏一个外观配色 id ⇒ 红（runtime-drift）",
    (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger).replace('"dark-fallback", ', "") }),
    ["runtime-drift"],
  );
  // 🔴 负控⑬：实况**配方栏**被配色 id 灌进来（拆栏失效 = 官方 theme-defaults 配色 id `dark` 假红的成因）
  T(
    "负控⑬：配色 id 混进配方栏 ⇒ 红（ledger-missing）",
    (f) => {
      f.actual.appearanceRecipeIds = [...f.actual.appearanceRecipeIds, "mint-soda"];
      return {};
    },
    ["ledger-missing"],
  );

  /* 🔴 正控④：**真仓重扫**——外观四栏非空 ＋ 证照自洽（拆栏后"四栏悄悄空掉"必须当场可见） */
  {
    const real = collectHostReserved();
    const bad = diffGrants(real).map((v) => v.kind);
    for (const k of APPEARANCE_COLUMNS) {
      if (!Array.isArray(real[k]) || real[k].length === 0) bad.push(`family-empty:${k}`);
    }
    cases.push(["正控④：真仓重扫——外观四栏非空 ＋ 证照自洽 ⇒ 绿", bad.length === 0, bad]);
  }

  /* ── 1.38 新增：context key 两段 ＋ `when:` 抽取修复 ───────────────── */
  // 🔴 负控⑭：两段之间串味（约定面的名字出现在宿主专用段 ⇒ 插件设「宿主约定面」会被误判成红）
  T(
    "负控⑭：约定面旗子混进宿主专用段 ⇒ 红（ledger-missing）",
    (f) => {
      f.actual.contextKeysHostOnly = [...f.actual.contextKeysHostOnly, "settingKey"];
      return {};
    },
    ["ledger-missing"],
  );
  // 🔴 负控⑮：约定面段整段被删（拆段后退化回「一栏」的形态——分级又不可区分了）
  T(
    "负控⑮：账里 contextKeysPublic 段被删 ⇒ 红（family-missing）",
    (f) => {
      delete f.ledger.contextKeysPublic;
      return {};
    },
    ["family-missing"],
  );
  // 🔴 负控⑯：运行时模块漏掉宿主专用段里的一个旗子（第五向——运行时与门禁读的不是同一本账）
  T(
    "负控⑯：运行时模块漏一个宿主专用 context key ⇒ 红（runtime-drift）",
    (f) => ({ runtimeRaw: renderRuntimeModule(f.ledger).replace('"activeEditor",', "") }),
    ["runtime-drift"],
  );
  /* 🔴 正控⑤/⑥/⑦：`when:` 抽取——**旧实现在这里会漏**（本格头号缺陷的守门）。
   *  ⚠️ 这三条**必须直测抽取函数**，不能走 `collectHostReserved()`：真仓的 `when` 恰好都是
   *   「比较值在末尾」的形态，旧实现在真仓上**照样给出正确的账**（账对、理由错）⇒ 用真仓当守门等于没测。 */
  {
    const extract = (s) => extractWhenExpressions(s).flatMap(whenKeys);
    const cases5 = [
      ["正控⑤：`== 'left'` 的右值不进账（比较值显式过滤）", extract(`when: "sidebarPosition == 'left'"`), ["sidebarPosition"]],
      ["正控⑥：无引号字面量的表达式完整进账", extract(`when: "explorerFocus && !inputFocus"`), ["explorerFocus", "inputFocus"]],
      [
        "🔴 正控⑦（本格头号缺陷守门）：`== 'x' && myFlag` ⇒ myFlag 必须进账（旧实现会漏）",
        extract(`when: "settingKey == 'x' && myFlag"`),
        ["settingKey", "myFlag"],
      ],
      ["正控⑧：比较值在中间、后面还有旗子 ⇒ 后面的旗子必须进账", extract(`when: "a && b == 'x' || c"`), ["a", "b", "c"]],
      ["正控⑨：单引号包表达式（合法写法）⇒ 内容完整", extract(`when: 'sidebarPosition == "left"'`), ["sidebarPosition"]],
      ["正控⑩：`a.x` 形态取左边（属性名不是旗子名）", extract(`when: "panel.visible && b"`), ["panel", "b"]],
    ];
    for (const [name, got, want] of cases5) {
      const ok = JSON.stringify(got) === JSON.stringify(want);
      cases.push([`${name} ⇒ ${JSON.stringify(want)}`, ok, ok ? [] : [`实际 ${JSON.stringify(got)}`]]);
    }
  }
  // 🔴 正控⑪：真仓两段都对 —— 宿主专用/约定面各自非空 ＋ **两段不相交**（交集非空 = 分级本身就没意义）
  {
    const real = collectHostReserved();
    const bad = [];
    if (!real.contextKeysHostOnly?.length) bad.push("family-empty:contextKeysHostOnly");
    if (!real.contextKeysPublic?.length) bad.push("family-empty:contextKeysPublic");
    const overlap = (real.contextKeysHostOnly ?? []).filter((k) => (real.contextKeysPublic ?? []).includes(k));
    if (overlap.length) bad.push(`两段相交:${overlap.join(",")}`);
    cases.push(["正控⑪：真仓重扫——context key 两段非空且不相交 ⇒ 绿", bad.length === 0, bad]);
  }

  let bad = 0;
  for (const [name, ok, kinds] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `　← 实际违规 ${JSON.stringify(kinds)}`}`);
  }
  console.log(`gen-host-reserved self-test ${bad === 0 ? "✔️ 全部符合预期（正控绿 / 负控红）" : `❌ 有 ${bad} 条不符预期`}`);
  return bad === 0 ? 0 : 1;
}
