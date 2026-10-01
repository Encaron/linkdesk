/**
 * generate-contract 的判据自测（E6#0.6d 第一刀 · 补上这颗「虚掩的门」）。
 *
 * 🔴 要证明的是 **「`--check` 不是恒绿的」**——它是 `npm run check` 的**第一道**闸，
 *    恒绿 ⇒ 三产物漂移无人看见（`contracts/linkdesk.d.ts` 是外部工程与第三方作者的契约源）。
 *    三条负控都是**真变异**（不是推理），且走的是**门禁同一把尺子** `driftOf`：
 *      ① 产物内容差**一个字符** ⇒ 必须报漂移
 *      ② 产物**缺失**（读回 null） ⇒ 必须报漂移（干净检出漏产物的情形）
 *      ③ 只差**行尾**（LF ↔ CRLF） ⇒ **不许**报漂移（2026-09-11 那条「干净检出恒红」假红的回归锁）
 *    ＋ 正控：**今天真实仓库**的三产物与磁盘逐字相同（证明这把尺子不是「恒报漂移」）。
 *    ＋ 结构下界：三产物各带**自己的签名标记**且非空——堵「生成器空转 ⇒ 磁盘也空 ⇒ `--check` 恒绿」。
 */
import { existsSync, readFileSync } from "node:fs";

/** 三产物各自的签名标记（**盯内容形态**，与生成器的具体行数解耦） */
const MARKERS = [
  ["content", "declare global"],
  ["content", "export {}"],
  ["runtimeContent", "export function validateWire("],
  ["mockContent", "export const linkdeskMock"],
];

export function selfTest({ buildAll, driftOf, OUTS }) {
  const cases = [];
  const t = (name, pass, detail) => cases.push([name, pass, detail]);
  const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);

  const built = buildAll();
  const specs = OUTS.map((s) => ({ name: s.name, file: s.file, built: built[s.key] }));

  // ── 正控：今天真仓库三产物与磁盘逐字相同（同一把尺子）──
  const fresh = driftOf(specs, read);
  t(
    "正控：三产物与磁盘逐字相同（driftOf 必须报 0 件）",
    fresh.length === 0,
    fresh.map((s) => s.name).join(", "),
  );

  // ── 负控①：内容差一个字符 ⇒ 必须报漂移（真变异）──
  const drifted = driftOf([{ ...specs[0], built: specs[0].built + " " }], () => specs[0].built);
  t(
    "负控①：产物多一个字符 ⇒ 必须报漂移（内容层真变异）",
    drifted.length === 1,
    `实得 ${drifted.length} 件`,
  );

  // ── 负控②：产物缺失（null） ⇒ 必须报漂移 ──
  const missing = driftOf([specs[0]], () => null);
  t("负控②：产物缺失（读回 null）⇒ 必须报漂移", missing.length === 1, `实得 ${missing.length} 件`);

  // ── 负控③：只差行尾 ⇒ **不许**报漂移（假红回归锁）──
  const eolOnly = driftOf([{ name: "x", file: "-", built: "a\nb\n" }], () => "a\r\nb\r\n");
  t("负控③：只差行尾（LF↔CRLF）⇒ 不许报漂移（否则干净检出恒红）", eolOnly.length === 0, `实得 ${eolOnly.length} 件`);

  // ── 结构下界：三产物各带签名标记且非空（防生成器空转 + 磁盘同空）──
  const missingMarkers = MARKERS.filter(([key, m]) => !String(built[key]).includes(m));
  const tooShort = ["content", "runtimeContent", "mockContent"].filter((k) => String(built[k]).length < 5000);
  t(
    "结构下界：三产物各带签名标记且 >5000 字符（防空转产物骗过 --check）",
    missingMarkers.length === 0 && tooShort.length === 0,
    `缺标记 ${JSON.stringify(missingMarkers)} · 过短 ${JSON.stringify(tooShort)}`,
  );

  let ok = true;
  for (const [name, pass, detail] of cases) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}${pass || !detail ? "" : `  —— ${detail}`}`);
    if (!pass) ok = false;
  }
  console.log(
    `generate-contract self-test ${ok ? "✔️ 全部符合预期（正控绿 / 三条负控红）" : "❌ 有判据不符预期"}` +
      `（${cases.filter((c) => c[1]).length}/${cases.length}）`,
  );
  return ok ? 0 : 1;
}
