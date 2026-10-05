/**
 * check-scaffold 的内联自测（E6#0.6d 第一刀·自测外迁）。
 *
 * 原先这三段（`prefixSelfTestCases` 真变异负控／`setupPointerSelfTestCases` 指针形态负控／
 * `runSelfTest` 桩 CLI 建仓负控 ＋ 内部符号脏净样本）住在主文件里，把 CLI 顶到 879 行。
 * 自测是测试、不是生产体量：按仓库既有惯例（`*.test.*` 不计入门禁）外迁到同名测试模块；
 * 主文件只留 `--self-test` 转发，调用面零变化。
 *
 * ⚠️ 判据语义一字未改——它逐条**真跑**（真生成 CLI／真建 git 仓／真变异 CSS 再还原），故主文件
 *    为此导出 9 个生产符号供本模块调用（`export` 只为测试，无外部消费者；见 CLAUDE.md 判据）。
 * ⚠️ 夹具落 `SCRATCH_ROOT/scaffold-selftest`（仓外一次性目录），跑完 `rmSync` 清掉。
 */
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  PROBE_NAME,
  SCRATCH_ROOT,
  TEMPLATE_DIR,
  checkGitBehavior,
  checkMinAppVersionFloor,
  checkSetupPointer,
  failures,
  generate,
  getPrefixCheck,
  getUiFloorApi,
  scanInternalSymbols,
} from "./check-scaffold.mjs";

/**
 * 断言 11 的**真变异**负控（不靠推理——照断言 10 的先例）：
 *
 *   ① 正控：**真跑 CLI** 出来的工程 ⇒ 判据必须 0 违规
 *   ② 变异：把生成物 `src/index.css` 里的 `<名>-starter` 改回裸 `.starter` ⇒ 判据必须红，
 *      且报点里带文件 ＋ 现名 ＋「应以 `<id>-` 开头」（即改模板把前缀删掉，门禁会拦住）
 *   ③ 还原：写回原字节 ⇒ 判据回到 0，且 sha256 与原始**逐字节相同**
 *
 * ⇒ 证明这条断言**不是恒真的**（恒真的断言 = 没有断言）。只动**生成物**、不碰仓内模板。
 */
function prefixSelfTestCases() {
  const out = [];
  const push = (file, ok, n, why, first) => out.push({ file, ok, n, why, ...(first ? { first } : {}) });

  const genDir = generate(); // 真跑 CLI（不模拟）
  const check = getPrefixCheck(); // 懒加载：dist 缺失/过旧时先构建
  if (!genDir || !check) {
    push(
      "断言 11（负控）",
      false,
      failures.length,
      "真生成 / 判据加载失败——断言 11 无从验证（原因见上）",
      failures.splice(0).join("；"),
    );
    return out;
  }

  // ① 正控：真生成物零违规
  const clean = check(genDir);
  push(
    "断言 11 正控（真生成物）",
    clean.violations.length === 0,
    clean.violations.length,
    "真跑 CLI 出来的工程必须零裸类名/关键帧",
    clean.violations[0]?.message,
  );

  // ② 变异：CSS 改回裸名 ⇒ 判据必须红
  const cssRel = "src/index.css";
  const cssPath = join(genDir, cssRel);
  const original = readFileSync(cssPath, "utf8");
  const mutated = original.split(`${PROBE_NAME}-starter`).join("starter");
  const didMutate = mutated !== original;
  writeFileSync(cssPath, mutated);
  const bad = check(genDir);
  const hit = bad.violations.find((v) => v.file === cssRel && v.message.includes(`应以 "${PROBE_NAME}-" 开头`));
  /** 裸定义站点数 = **6**：模板 CSS 的 7 处类名里，`.<名>-starter__hint code` 是 scoped 后代选择器、不占名
   *  ⇒ 判据只报 6 个站点（详案/详案表说的「N 处」是**类名出现次数**，两把尺子，别混）。
   *  ⚠️ 模板示例改动了类名数量 ⇒ 同笔更新这个期望值（期望是契约，显式写死）。 */
  const EXPECTED_SITES = 6;
  push(
    "断言 11 负控（真变异：CSS 改回裸 .starter）",
    didMutate && hit !== undefined && bad.violations.length === EXPECTED_SITES,
    bad.violations.length,
    `把 ${PROBE_NAME}-starter 改回裸 .starter ⇒ 判据必须红 ${EXPECTED_SITES} 条、且报点带「应以 "${PROBE_NAME}-" 开头」`,
    didMutate
      ? `红了 ${bad.violations.length} 条（期望 ${EXPECTED_SITES}）${hit ? "，但有一条正是期望形态" : `；没有一条是期望形态：${bad.violations[0]?.message ?? "（零违规）"}`}`
      : `变异没生效——生成物 ${cssRel} 里没有 ${PROBE_NAME}-starter（模板被改过了？）`,
  );

  // ③ 还原：逐字节相同 + 判据回零
  writeFileSync(cssPath, original);
  const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
  const byteIdentical = sha(readFileSync(cssPath, "utf8")) === sha(original);
  const again = check(genDir);
  push(
    "断言 11 还原（写回原字节）",
    byteIdentical && again.violations.length === 0,
    again.violations.length,
    "还原后判据回绿，且文件 sha256 与变异前**逐字节相同**",
    byteIdentical ? `还原后仍有 ${again.violations.length} 条违规` : "还原后 sha256 与原始不同",
  );

  return out;
}

/**
 * 断言 12 的负控（纯函数，不需要 CLI——判据全在 `checkSetupPointer` 里，同一段代码不是抄一遍）：
 *
 *   ① 正控：**仓内模板真身** ⇒ 判据必须 0 问题
 *   ② 负控：把 mock 体抄回来（旧形态：无指针行 ＋ 标志串 ＋ 超过 5 行）⇒ **三条判据全中**
 *
 * ⇒ 证明这条断言不是恒真的。只读模板、不写任何文件。
 */
function setupPointerSelfTestCases() {
  const out = [];
  const push = (file, ok, n, why, first) => out.push({ file, ok, n, why, ...(first ? { first } : {}) });

  const real = readFileSync(join(TEMPLATE_DIR, "vitest.setup.ts"), "utf8");
  const okProblems = checkSetupPointer(real);
  push(
    "断言 12 正控（仓内模板真身）",
    okProblems.length === 0,
    okProblems.length,
    "模板的 vitest.setup.ts 必须是指针形态（含 subpath / 无 mock 标志串 / 行数 ≤ 5）",
    okProblems[0],
  );

  // 旧形态（＝收敛之前那份 mock 体）：三条判据该各咬一条
  const oldStyle = [
    "// path 纯函数——直接实现，不走 IPC",
    "const pathMock = { normalize: (p) => p.replace(/\\/g, '/') };",
    "const configurationMock = { get: async () => null };",
    "const workspaceMock = {};",
    "const filesystemMock = {};",
    "const tabsMock = {};",
    "globalThis.window.linkdesk = { path: pathMock, configuration: configurationMock };",
  ].join("\n");
  const badProblems = checkSetupPointer(oldStyle);
  const caught = {
    缺指针: badProblems.some((p) => p.includes("没有指向共享测试地基")),
    mock体: badProblems.some((p) => p.includes("mock 体")),
    行数: badProblems.some((p) => p.includes("行数")),
  };
  const allCaught = Object.values(caught).every(Boolean);
  push(
    "断言 12 负控（把 mock 体抄回来）",
    allCaught,
    badProblems.length,
    "旧形态（无指针行 ＋ mock 标志串 ＋ 超行数）⇒ 三条判据必须全中",
    allCaught ? undefined : `实得 ${JSON.stringify(caught)}（红了 ${badProblems.length} 条）`,
  );

  return out;
}

/**
 * 断言 13 的负控（**真变异**，照断言 11 的先例——只动生成物、不碰仓内模板）：
 *
 *   ① 正控：真跑 CLI 出来的工程 ⇒ `minAppVersion` **正好等于**按它自己导入算出的地板（0 问题）
 *   ② 负控 A：把生成物的 `minAppVersion` 改回一个**旧号**（本格事故的形态：抄上一个数）⇒ 必须红
 *   ③ 负控 B：把生成物的导入名换成一个**更晚才有**的导出（声明不动）⇒ 必须红，且报出新的地板
 *      —— ②③ 一起证明这条断言**不是恒真的**、也不是拿常量判的（地板跟着账本走）
 *   ④ 还原：两个文件写回原字节 ⇒ 判据回绿，且 sha256 与变异前**逐字节相同**
 */
function floorSelfTestCases() {
  const out = [];
  const push = (file, ok, n, why, first) => out.push({ file, ok, n, why, ...(first ? { first } : {}) });

  const genDir = generate(); // 真跑 CLI（不模拟）
  const api = getUiFloorApi();
  if (!genDir || !api) {
    push(
      "断言 13（负控）",
      false,
      failures.length,
      "真生成 / 判据加载失败——断言 13 无从验证（原因见上）",
      failures.splice(0).join("；"),
    );
    return out;
  }

  const manifestPath = join(genDir, "plugin.json");
  const srcPath = join(genDir, "src", "index.tsx");
  const originals = { manifest: readFileSync(manifestPath, "utf8"), src: readFileSync(srcPath, "utf8") };
  const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

  // ① 正控：真生成物 —— 声明值必须 == 算出来的地板（不是「≥ 就行」：抄高也会被拦）
  const clean = checkMinAppVersionFloor(genDir, api);
  push(
    "断言 13 正控（真生成物）",
    clean.problems.length === 0 && clean.declared !== null && clean.declared === clean.floor,
    clean.problems.length,
    `真跑 CLI 出来的工程：minAppVersion 必须 == 按模板自身导入算出的地板（实得 ${clean.declared} / 地板 ${clean.floor}）`,
    clean.problems[0],
  );

  // ② 负控 A：声明改回旧号 ⇒ 必须红（报点里要有真正的那个地板）
  const oldDeclared = originals.manifest.replace(/("minAppVersion"\s*:\s*")[^"]*(")/, "$10.2.13$2");
  const mutatedDeclare = oldDeclared !== originals.manifest;
  writeFileSync(manifestPath, oldDeclared);
  const badDeclare = checkMinAppVersionFloor(genDir, api);
  const gotFloor = badDeclare.problems.some((p) => p.includes(`地板是 ${clean.floor}`));
  push(
    "断言 13 负控 A（声明抄成旧号 0.2.13）",
    mutatedDeclare && gotFloor,
    badDeclare.problems.length,
    `把 minAppVersion 抄成一个旧号 ⇒ 必须红，且报出真地板 ${clean.floor}`,
    mutatedDeclare
      ? `红了 ${badDeclare.problems.length} 条${gotFloor ? "" : `，但没报「地板是 ${clean.floor}」：${badDeclare.problems.join("；")}`}`
      : "变异没生效——生成物 plugin.json 里找不到 minAppVersion（模板改形了？）",
  );
  writeFileSync(manifestPath, originals.manifest); // 先还原声明，让 ③ 只考验导入轴

  // ③ 负控 B：导入名换成一个更晚才有的导出（声明不动）⇒ 地板必须跟着账本变、判据必须红
  const swapped = originals.src.replace(/(import\s*\{)[^}]*(\}\s*from\s*"@linkdesk\/ui")/, "$1 PluginCard $2");
  const mutatedImport = swapped !== originals.src;
  writeFileSync(srcPath, swapped);
  const badImport = checkMinAppVersionFloor(genDir, api);
  const movedFloor = badImport.floor !== clean.floor;
  push(
    "断言 13 负控 B（换成一个更晚的导出 PluginCard）",
    mutatedImport && movedFloor && badImport.problems.length > 0,
    badImport.problems.length,
    `换掉导入名（声明不动）⇒ 地板必须从 ${clean.floor} 抬到 ${badImport.floor} 并判红——证明地板跟着账本走、不是常量`,
    mutatedImport
      ? `实得地板 ${badImport.floor}（原 ${clean.floor}），红了 ${badImport.problems.length} 条`
      : "变异没生效——生成物 src/index.tsx 里找不到对 @linkdesk/ui 的具名导入（模板改形了？同笔改这里）",
  );

  // ④ 还原：逐字节 + 判据回绿
  writeFileSync(srcPath, originals.src);
  const byteIdentical =
    sha(readFileSync(manifestPath, "utf8")) === sha(originals.manifest) &&
    sha(readFileSync(srcPath, "utf8")) === sha(originals.src);
  const again = checkMinAppVersionFloor(genDir, api);
  push(
    "断言 13 还原（写回原字节）",
    byteIdentical && again.problems.length === 0,
    again.problems.length,
    "两个文件还原后判据回绿，且 sha256 与变异前**逐字节相同**",
    byteIdentical ? `还原后仍有 ${again.problems.length} 条问题` : "还原后 sha256 与原始不同",
  );

  return out;
}

/**
 * `--self-test`：**负控**——把断言 9 拿去喂两个「坏 CLI」，证明它不是恒真的。
 *
 *   桩 A「从不建仓」（= 7.6 之前的老行为）⇒ 情形① 必须红
 *   桩 B「无脑建仓」（连「已在仓内」也照建）⇒ 情形② 必须红
 *
 * 两个桩都只造最小骨架，判据全在 `checkGitBehavior` 里（同一段代码，不是抄一遍）。
 * 负控不过 = 门禁恒真 = 假门禁，**必须 exit 1**。
 */
export function runSelfTest() {
  const root = join(SCRATCH_ROOT, "scaffold-selftest");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  /** 桩的公共前半段：造出断言 ③ 会查的那几件产物 */
  const SKELETON = `
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("-"));
mkdirSync(join(name, "src"), { recursive: true });
for (const f of ["plugin.json", "package.json", ".gitignore"]) writeFileSync(join(name, f), "{}");
writeFileSync(join(name, "src/index.tsx"), "");
`;
  const stubs = {
    // A：老行为（从不建仓）——情形① 必红
    "no-init.mjs": `${SKELETON}`,
    // B：无脑建仓（照抄真 CLI，只拿掉「已在仓内 ⇒ 不 init」那道守卫）——情形② 必红
    "always-init.mjs": `${SKELETON}
import { spawnSync } from "node:child_process";
if (!args.includes("--no-git")) {
  const g = (a) => spawnSync("git", a, { cwd: name });
  g(["init", "-q", "-b", "main"]);
  g(["add", "-A"]);
  g(["commit", "--no-verify", "-m", "stub"]);
}
`,
  };

  const expect = {
    "no-init.mjs": { must: "没有建 git 仓", why: "把建仓拿掉 ⇒ 情形① 必须红" },
    "always-init.mjs": { must: "建出了嵌套仓", why: "拿掉「已在仓内不 init」守卫 ⇒ 情形② 必须红" },
  };

  const cases = [];
  for (const [file, body] of Object.entries(stubs)) {
    const stubPath = join(root, file);
    writeFileSync(stubPath, body);
    const fails = checkGitBehavior(stubPath, join(root, file.replace(/\.mjs$/, "")));
    const hit = fails.filter((f) => f.includes(expect[file].must));
    cases.push({ file, ok: hit.length > 0, n: fails.length, why: expect[file].why, first: fails[0] });
  }

  // 断言 10 的负控（纯函数，不需要 CLI）：脏样本必须命中、干净样本必须零命中
  const dirtyDir = join(root, "symbols-dirty");
  const cleanDir = join(root, "symbols-clean");
  mkdirSync(dirtyDir, { recursive: true });
  mkdirSync(cleanDir, { recursive: true });
  writeFileSync(join(dirtyDir, "a.ts"), "// 见 E6#102 与 E5.7#98 两处坐标\n");
  writeFileSync(join(cleanDir, "a.ts"), "// 色 #0078d4、锚 [x](#api-速查表)、日期 2026-09-14 —— 都不是内部符号\n");
  const dirtyHits = scanInternalSymbols(dirtyDir).length;
  const cleanHits = scanInternalSymbols(cleanDir).length;
  const symOk = dirtyHits === 2 && cleanHits === 0;
  cases.push({
    file: "symbols（断言 10 负控）",
    ok: symOk,
    n: dirtyHits,
    why: "脏样本命中 2 处、干净样本 0 处（十六进制色与 markdown 锚不算）",
    first: symOk ? undefined : `实得 dirty=${dirtyHits}（期望 2）· clean=${cleanHits}（期望 0）`,
  });

  // 断言 11 的负控：真跑 CLI 生成 → 变异 CSS → 判据必红 → 还原逐字节
  cases.push(...prefixSelfTestCases());

  // 断言 12 的负控：真模板必须过；把 mock 体抄回来必须红（三条判据全中）
  cases.push(...setupPointerSelfTestCases());

  // 断言 13 的负控：真生成物地板齐平 → 声明抄旧号必红 → 换更晚的导出地板跟着变 → 还原逐字节
  cases.push(...floorSelfTestCases());

  const failed = cases.filter((c) => !c.ok);
  for (const c of cases) {
    console.log(`  ${c.ok ? "✔" : "❌"} ${c.file}：${c.why}（判据红了 ${c.n} 条）`);
  }
  rmSync(root, { recursive: true, force: true });
  if (failed.length > 0) {
    console.error(
      `\n❌ check-scaffold 自检未过（${failed.length}/${cases.length}）：负控**没有**变红 ⇒ 断言恒真的假门禁。`,
    );
    for (const f of failed) {
      // ⚠️ 不是每个用例都在 `expect` 里（断言 10/11 的用例自带 why）——不判空会在这里抛 TypeError
      const e = expect[f.file];
      console.error(`  · ${f.file}：${e ? `期望红在「${e.must}」` : f.why}，实际没有`);
      if (f.first) console.error(`      ↳ 它只红了：${String(f.first).split("\n")[0]}`);
    }
    return 1;
  }
  console.log(
    `\ncheck-scaffold self-test ✔️ ${cases.length}/${cases.length} 例全过` +
      `（建仓两条相反路径 + 内部符号脏/净两样本 + 断言 11 的真变异：改回裸类名必红、还原逐字节相同` +
      ` + 断言 12 指针形态：真模板过、把 mock 体抄回来必红` +
      ` + 断言 13 地板：真生成物齐平、声明抄旧号必红、换更晚的导出地板跟着账本抬）`,
  );
  return 0;
}
