/**
 * check-reserved-names-doc-sync 的内联自测（E6#0.6d 第一刀·自测外迁）。
 *
 * 原先这段（夹具 fixture／hostFixture ＋ 正控 6 ／ 负控 19）住在主文件里。自测是测试、不是生产体量：
 * 按仓库既有惯例（`*.test.*` 不计入门禁）外迁到同名测试模块；主文件只留 `--self-test` 转发，
 * 调用面零变化。判据语义一字未改——逐例实跑断言，零工作区副作用。
 */
import {
  checkHostDocs,
  checkSync,
} from "./check-reserved-names-doc-sync.mjs";

const fixture = ({
  hostCell = "`.ldk-input`",
  ldk = "`ldk-badge`, `ldk-titlebar`",
  kfCell = "`ldk-selectbox-in`",
  kfEnCell = null,
  kfRegistry = ["ldk-selectbox-in"],
  kfTable = true,
}) => {
  const kfZh = kfTable ? `| 保留的关键帧名 | 说明 |\n|---|---|\n| ${kfCell} | 共享组件下拉入场动画 |\n\n` : "";
  const kfEn = kfTable
    ? `| Reserved keyframe names | Notes |\n|---|---|\n| ${kfEnCell ?? kfCell} | the shared dropdown's entrance animation |\n\n`
    : "";
  return {
    docs: [
      {
        label: "zh-fixture",
        text: `## 12. CSS 类名\n\n| 来源 | 保留名 | 说明 |\n|---|---|---|\n| 宿主全局工具类 | ${hostCell} | 说明一 |\n| 共享组件类名 | ${ldk} | 说明二 |\n\n${kfZh}### 12.1 迁移\n\n升级后拿这八个旧基名 \`.badge\`、\`.toggle\` grep 自己的 CSS。\n`,
      },
      {
        label: "en-fixture",
        text: `## 12. CSS Class Names\n\n| Source | Reserved names | Notes |\n|---|---|---|\n| Host global utility classes | ${hostCell} | note one |\n| Shared component classes | ${ldk} | note two, e.g. the badge one |\n\n${kfEn}### 12.1 Upgrading\n\ngrep your CSS for the eight old base names \`.badge\`, \`.toggle\`.\n`,
      },
    ],
    registeredKeyframes: new Map(kfRegistry.map((n) => [n, "fixture"])),
    ldkTokens: new Set(["ldk-badge", "ldk-badge--accent", "ldk-titlebar", "ldk-titlebar-btn", "ldk-input"]),
  };
};

/* 非样式家族那一段的自测夹具（账 ＋ 两棵树的总表 ＋ 规则句） */
const hostFixture = ({
  famZh = "宿主命令前缀",
  famEn = "Host command prefix",
  nameZh = "`app.`",
  nameEn = null,
  ledger = { commandPrefixes: ["app."] },
  rule = true,
  table = true,
  extraTable = "",
} = {}) => {
  const ruleZh = rule ? "**一句话规则：宿主保留的名字不许占；插件自己写的名字必须带 `<pluginId>` 前缀。**\n\n" : "";
  const ruleEn = rule
    ? "**The one-sentence rule: names the host reserves are off limits; every name you invent must carry your `<pluginId>` prefix.**\n\n"
    : "";
  const tblZh = table ? `| 家族 | 保留的名字 | 你会撞上什么 |\n|---|---|---|\n| ${famZh} | ${nameZh} | 说明 |\n\n` : "";
  const tblEn = table
    ? `| Family | Reserved name | What happens if you take it |\n|---|---|---|\n| ${famEn} | ${nameEn ?? nameZh} | note |\n\n`
    : "";
  return {
    docs: [
      { lang: "zh", label: "zh-fixture", text: `${extraTable}## 七、宿主保留的名字\n\n${ruleZh}${tblZh}` },
      { lang: "en", label: "en-fixture", text: `## 7. Names the host reserves\n\n${ruleEn}${tblEn}` },
    ],
    ledger,
  };
};

export function selfTest() {
  const cases = [];
  const T = (name, mutate, kinds = []) => {
    const f = fixture(mutate ?? {});
    const got = checkSync(f);
    const ok = kinds.length === 0 ? got.length === 0 : kinds.every((k) => got.some((v) => v.kind === k));
    cases.push([name, ok, got.map((v) => v.kind)]);
  };
  // 第二段（非样式家族）那条尺子的同一套收发
  const H = (name, mutate, kinds = []) => {
    const got = checkHostDocs(hostFixture(mutate ?? {}));
    const ok = kinds.length === 0 ? got.length === 0 : kinds.every((k) => got.some((v) => v.kind === k));
    cases.push([name, ok, got.map((v) => v.kind)]);
  };

  // 🔴 正控：三份一致 ⇒ 零违规（顺带钉住「英文散文里的 `e.g.` 不会被当成类名 `.g`」这条口径）
  T("正控：两棵树一致 ＋ 关键帧与登记表一致 ⇒ 绿");
  T("正控：列内散文里的 `e.g.` 不被误判成类名 ⇒ 绿", { hostCell: "`.ldk-input` (e.g. the plain one)" });
  T("正控：写成 `.ldk-badge` 也算 `ldk-` 形态 ⇒ 绿", { ldk: "`.ldk-badge`, `ldk-titlebar`" });

  // 🔴 负控①（**已翻面**）：这一列**只放 `ldk-` 名**——裸名（`.input`）从此是错的
  //   （E6#109l-b 前它是「裸保留名」类别、要查登记表；`classes` 退役后该类别不存在 ⇒ 直接判红）
  T("负控①：列里出现裸名 `.input` ⇒ 红（裸保留名类别已退役）", { hostCell: "`.input`" }, ["doc-name-unclassified"]);

  // 负控②：这一列里出现既非裸名、也非 `ldk-` 命名的第三种形态（`.some-widget`）
  T("负控②：列里出现 `.some-widget` ⇒ 红", { hostCell: "`.ldk-input`, `.some-widget`" }, ["doc-name-unclassified"]);

  // 负控③：两棵树各自为政（中英手抄漂移——改英文树那一份，中文不动）
  {
    const f = fixture({});
    f.docs[1].text = f.docs[1].text.replace("`ldk-titlebar`", "`ldk-toolbar`");
    const got = checkSync(f);
    cases.push(["负控③：中英两棵树名字不一致 ⇒ 红", got.some((v) => v.kind === "doc-drift"), got.map((v) => v.kind)]);
  }

  // 负控④：表里列了宿主源码里不存在的 `ldk-` 名
  T("负控④：表里 ldk- 名在宿主源码里不存在 ⇒ 红", { ldk: "`ldk-badge`, `ldk-toolbar`" }, ["ldk-name-not-found"]);

  // 负控⑤：§12 节整段消失
  {
    const f = fixture({});
    f.docs[0].text = f.docs[0].text.replace("## 12. CSS 类名", "## 11. 别的");
    const got = checkSync(f);
    cases.push(["负控⑤：§12 节找不到 ⇒ 红", got.some((v) => v.kind === "table-missing"), got.map((v) => v.kind)]);
  }

  // 负控⑥：表头那一列被改名（表格还在，但门禁认不出这一列）
  {
    const f = fixture({});
    f.docs[0].text = f.docs[0].text.replace("| 来源 | 保留名 | 说明 |", "| 来源 | 名字 | 说明 |");
    f.docs[1].text = f.docs[1].text.replace("| Source | Reserved names | Notes |", "| Source | Names | Notes |");
    const got = checkSync(f);
    cases.push(["负控⑥：保留名列被改名 ⇒ 红", got.some((v) => v.kind === "table-missing"), got.map((v) => v.kind)]);
  }

  // ── 关键帧列（E6#109k-b 补：1.15 的门禁只守了类名那一列）──
  T("正控：关键帧表与登记表 `keyframes` 一致 ⇒ 绿", { kfCell: "`ldk-notif-icon-spin`", kfRegistry: ["ldk-notif-icon-spin"] });
  T(
    "负控⑦：文档侧关键帧被改名 ⇒ 红",
    { kfCell: "`ldk-selectbox-out`" },
    ["keyframe-unregistered", "keyframe-not-in-doc"],
  );
  T("负控⑧：登记表多一个关键帧、表里没有 ⇒ 红", { kfRegistry: ["ldk-selectbox-in", "ldk-brand-x-in"] }, ["keyframe-not-in-doc"]);
  T("负控⑨：关键帧表整张消失 ⇒ 红", { kfTable: false }, ["table-missing"]);
  T("负控⑩：关键帧列里混进 `.foo` 形态 ⇒ 红", { kfCell: "`.foo`" }, ["keyframe-name-unclassified"]);
  T("负控⑪：登记表一条关键帧都没有（=`keyframes` 段被清空）⇒ 红", { kfRegistry: [] }, ["keyframe-unregistered"]);
  {
    // 负控⑫：两棵树关键帧各自为政（只改英文树那一份）
    const f = fixture({ kfEnCell: "`ldk-selectbox-enter`" });
    const got = checkSync(f);
    cases.push(["负控⑫：中英两棵树关键帧不一致 ⇒ 红", got.some((v) => v.kind === "doc-drift"), got.map((v) => v.kind)]);
  }

  // ── 第二段：非样式家族的「宿主保留的名字」总表 ↔ 账（E6#111k／1.49 追加）──
  H("正控：账 ↔ 两棵树总表双向一致 ＋ 规则句在 ⇒ 绿");
  H("正控：篇内另有同形表（`| 名字 | 真源在哪 |`）不被误吃 ⇒ 绿", {
    extraTable: "| 名字 | 真源在哪 |\n|---|---|\n| 插件身份 id | `plugin.json` |\n\n",
  });
  H("正控：族名为 `**` 强调形态（`**宿主命令前缀**`）与账仍对得上 ⇒ 绿", { famZh: "**宿主命令前缀**" });
  // 负控⑬：表里多一个账里没有的名字（作者白白避让 / 或账漏了一条）
  H("负控⑬：表里 `core.` 不在账里 ⇒ 红", { nameZh: "`app.`、`core.`" }, ["host-name-not-in-ledger"]);
  // 负控⑭：**反向**——账里有、表里没有（只查一个方向的对账在这里是绿的）
  H("负控⑭：账里 `core.` 表里没有 ⇒ 红", { ledger: { commandPrefixes: ["app.", "core."] } }, [
    "host-name-unregistered",
  ]);
  // 负控⑮：族名不在双语映射里（例如英文树把族名改了个说法）
  H("负控⑮：族名「Host command prefixes」不在映射里 ⇒ 红", { famEn: "Host command prefixes" }, [
    "host-family-unknown",
  ]);
  // 负控⑯：账里冒出映射外的新家族（账是生成式的 ⇒ 加家族不同笔喂作者面就静默落后）
  H("负控⑯：账里多一个映射外的新家族 ⇒ 红", { ledger: { commandPrefixes: ["app."], newReservedThing: ["x"] } }, [
    "host-family-unmapped",
  ]);
  // 负控⑰：总表整张消失（含表头被改名/列被拿掉）
  H("负控⑰：两棵树的总表整张消失 ⇒ 红", { table: false }, ["host-table-missing"]);
  // 负控⑱：一句话规则句被删（表还在）
  H("负控⑱：一句话规则句被删 ⇒ 红", { rule: false }, ["host-rule-missing"]);
  // 负控⑲：两棵树各自为政（同一家族、不同名字）
  H("负控⑲：中英两棵树名字不一致 ⇒ 红", { nameEn: "`core.`", ledger: { commandPrefixes: ["app.", "core."] } }, [
    "doc-drift",
  ]);

  let bad = 0;
  for (const [name, ok, kinds] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `　← 实际违规 ${JSON.stringify(kinds)}`}`);
  }
  console.log(`check-reserved-names-doc-sync self-test ${bad === 0 ? "✔️ 全部符合预期（正控绿 / 负控红）" : `❌ 有 ${bad} 条不符预期`}`);
  return bad === 0 ? 0 : 1;
}
