/**
 * check-menu-slots-doc-sync 的内联自测（外迁形态，与 `check-reserved-names-doc-sync.test.mjs` 同款）。
 *
 * 逐例实跑断言、零工作区副作用：主文件只留 `--self-test` 转发。判据见主文件文件头。
 */
import { checkMenuSlotsDocs, extractSlots, parseSlotTable } from "./check-menu-slots-doc-sync.mjs";

const LEDGER = ["fileContext", "menuBar", "settingItemGear"];

/** 两棵树的夹具（表头中英各一，列序故意不同——顺带守「不写死列序」） */
const fixture = ({ slotsZh = ["fileContext", "menuBar", "settingItemGear"], slotsEn = null, tableZh = true, tableEn = true } = {}) => {
  const en = slotsEn ?? slotsZh;
  const co = (xs) => xs.map((s) => `\`${s}\``).join("、");
  const tblZh = tableZh ? `| 槽位值 | 出现在哪 |\n|---|---|\n| ${co(slotsZh)} | 各处 |\n\n` : "";
  const tblEn = tableEn ? `| Where it appears | Slot value |\n|---|---|\n| everywhere | ${co(en)} |\n\n` : "";
  return {
    docs: [
      { lang: "zh", label: "zh-fixture", text: `# 菜单贡献点\n\n## 二、槽位\n\n${tblZh}正文。\n` },
      { lang: "en", label: "en-fixture", text: `# Menu contribution points\n\n## 2. Slots\n\n${tblEn}Body.\n` },
    ],
    slotValues: LEDGER,
  };
};

export function selfTest() {
  const cases = [];
  const H = (name, input = {}, expectKinds = []) => {
    const got = checkMenuSlotsDocs(input.docs ? input : fixture(input));
    const kinds = got.map((v) => v.kind);
    const ok = expectKinds.length === 0 ? got.length === 0 : expectKinds.every((k) => kinds.includes(k));
    cases.push([name, ok, kinds]);
  };

  // ── 正控 ──
  H("正控：账 ↔ 两棵树槽位表双向一致 ⇒ 绿");
  H("正控：一个格子列多个槽位（顿号分隔）照样抽得出 ⇒ 绿");
  H("正控：表里槽位顺序与账不同（顺序不判）⇒ 绿", { slotsZh: ["settingItemGear", "fileContext", "menuBar"] });

  // ── 负控 ──
  H("负控①：账里有、表里没有（只查一个方向的对账在这里是绿的）⇒ 红", { slotsZh: ["fileContext", "menuBar"] }, [
    "slot-not-in-doc",
  ]);
  H("负控②：表里多一个账里没有的值 ⇒ 红", { slotsZh: [...LEDGER, "panelContext"] }, ["slot-not-in-ledger"]);
  H("负控③：表里写成了成员名 `FileContext`（只差大小写）⇒ 红", { slotsZh: ["FileContext", "menuBar", "settingItemGear"] }, [
    "slot-not-in-ledger",
  ]);
  H("负控④：中英两棵树不一致（英文树漏一个）⇒ 红", { slotsEn: ["fileContext", "menuBar"] }, ["doc-drift"]);
  H("负控⑤：槽位表整张消失（表头被改名/结构变了）⇒ 红", { tableZh: false, tableEn: false }, ["table-missing"]);
  H("负控⑥：只有一棵树有表（另一棵整张没有）⇒ 红", { tableEn: false }, ["table-missing"]);

  // ── 解析器微测（表头锚与抽词）──
  const p = parseSlotTable("| 槽位值 | 出现在哪 |\n|---|---|\n| `a`、`b` | x |\n");
  cases.push(["微测：`parseSlotTable` 按表头定位且抽出多个槽位", !!p && p.rows[0].slots.join(",") === "a,b", p?.rows?.[0]?.slots]);
  const pEn = parseSlotTable("| Where | Slot value |\n|---|---|\n| x | `c` |\n");
  cases.push(["微测：英文表头（列序不同）同样命中", !!pEn && pEn.rows[0].slots.join(",") === "c", pEn?.rows?.[0]?.slots]);
  cases.push(["微测：`extractSlots` 只抽反引号 token（散文里的裸词不算）", extractSlots("看 fileContext 与 `menuBar` 两处").join(",") === "menuBar", null]);

  let bad = 0;
  for (const [name, ok, kinds] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `　← 实际违规 ${JSON.stringify(kinds)}`}`);
  }
  console.log(`check-menu-slots-doc-sync self-test ${bad === 0 ? "✔️ 全部符合预期（正控绿 / 负控红）" : `❌ 有 ${bad} 条不符预期`}`);
  return bad === 0 ? 0 : 1;
}
