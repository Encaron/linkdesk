/**
 * 机械门禁：**死代码审计腿**（G-N3 前置）——knip 的固定入口 ＋ 自证。
 *
 * 用法：
 *   node scripts/check-dead-code.mjs              # 跑真审计（等价 `npm run knip`，但带环境/配置前置断言）
 *   node scripts/check-dead-code.mjs --self-test  # 负控：往 kit 里塞一个死文件，必须被报出来
 * 退出码 0 = 审计通过；1 = 有死代码/配置坏了/自证失败。
 *
 * ── 为什么要有这层包皮（不是多此一举）──
 *   出处：`06-归一化与AI友好化-本次复盘门禁提案.md` G-N3 ＋ §4.4「审计腿本身长期不可用」。
 *   2026-11-23 实测：`knip.json` 的 `ignoreWorkspaces: ["packages/*"]` 把 **marketplace-kit 整包**
 *   挡在审计外面——kit 是作者机器的正典工具链（validate / init / keygen / sign-license），
 *   里面留一条死导出＝作者照文档调不到的东西，而**没有任何灯会亮**。
 *   故本腿做三件事：
 *     ① 断言「kit 在审计域内」（配置层负控：谁把 `packages/*` 通配写回来，这里当场红）；
 *     ② 跑 knip（真审计）；
 *     ③ `--self-test`：往 kit 的 src/ 塞一个死文件，knip **必须**报出它（证明腿不是假绿），
 *        跑完删干净（`finally` 兜底，⛔ 不留探针残骸）。
 *
 * ── 为什么自测只塞 kit、不塞壳 ──
 *   壳域（`src/**`）每次真审计都在场，且 `check` 链后续 eslint/vitest 还会再碰它；
 *   本腿要防的**具体复发**是「某个 workspaces 包被静默漏审」。自测只跑一次 knip（约 3s），
 *   是为 `check-gate-health --self-test` 的「全部自测真跑一遍」保留预算——⛔ 别再加第二次全仓 knip。
 *
 * ── 失败信息口径（06 §六「可被 AI 用」）──
 *   配置类失败一律输出「文件:期望 → 实际 → 示例修法」三段；knip 自己的输出原样透传（它就是清单）。
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KNIP_JSON = join(ROOT, "knip.json");
const KNIP_BIN = join(ROOT, "node_modules", "knip", "bin", "knip.js");
const KIT_PROBE = join(ROOT, "packages", "marketplace-kit", "src", "__knip_selftest_probe.ts");
const KIT_PROBE_REL = "packages/marketplace-kit/src/__knip_selftest_probe.ts";

/** 失败即抛，统一由 main 打印「文件:期望 → 实际 → 示例修法」。 */
class GateError extends Error {
  constructor(file, expected, actual, fix) {
    super([`${file}`, `  期望：${expected}`, `  实际：${actual}`, `  示例修法：${fix}`].join("\n"));
    this.name = "GateError";
  }
}

/** 读 `knip.json`（JSONC：剥行注释后再解析；本仓配置只用 `//`）。 */
function readKnipConfig() {
  const raw = readFileSync(KNIP_JSON, "utf8");
  // 字符串感知太贵——本文件注释都以行首空白 + `//` 起，字符串字面量里没有 `//`。
  const noComments = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  return JSON.parse(noComments);
}

/** 配置层负控：kit 必须在审计域内，且缺陷的原始形态（`packages/*` 通配）不许回来。 */
function assertKitAudited(cfg) {
  const ignored = cfg.ignoreWorkspaces ?? [];
  const wildcard = ignored.find((p) => p === "packages/*" || p === "*" || p === "packages/**");
  if (wildcard) {
    throw new GateError(
      "knip.json",
      "ignoreWorkspaces 不得用通配把 workspace 整类挡在审计外（kit 就是这样被漏审的）",
      `ignoreWorkspaces 里仍有 ${JSON.stringify(wildcard)}`,
      '改成逐包列举：需要豁免的包写具体路径；新增包必须显式决定「进审计 or 写理由豁免」。',
    );
  }
  if (ignored.some((p) => p.includes("marketplace-kit"))) {
    throw new GateError(
      "knip.json",
      "packages/marketplace-kit 必须进死代码审计（它是作者机器的正典工具链）",
      "它仍在 ignoreWorkspaces 里",
      '从 ignoreWorkspaces 移除 "packages/marketplace-kit"，并在 workspaces 里给它 project 配置。',
    );
  }
  const kitCfg = cfg.workspaces?.["packages/marketplace-kit"];
  if (!kitCfg) {
    throw new GateError(
      "knip.json",
      'workspaces 里必须有 "packages/marketplace-kit" 的审计配置',
      "缺这一项（knip 会按 package.json 的 dist 入口审构建产物，等于没审源码）",
      '照现有写法加：{"entry": ["src/*.test.ts"], "project": ["src/**/*.ts"]}。',
    );
  }
  if (!(kitCfg.project ?? []).some((p) => p.includes("src/"))) {
    throw new GateError(
      "knip.json",
      "kit 的 project 必须覆盖 src/ 源码",
      `project = ${JSON.stringify(kitCfg.project ?? [])}`,
      '写成 "src/**/*.ts"（⛔ 别指向 dist/：那是 tsc 产物）。',
    );
  }
}

function runKnip(args) {
  const r = spawnSync(process.execPath, [KNIP_BIN, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return {
    status: r.status ?? 1,
    out: `${r.stdout ?? ""}${r.stderr ?? ""}`,
  };
}

function main() {
  if (!existsSync(KNIP_BIN)) {
    throw new GateError(
      "node_modules/knip",
      "knip 必须已安装（check 链依赖它）",
      "找不到 node_modules/knip/bin/knip.js",
      "跑 npm install（lockfile 已钉版本）。",
    );
  }

  const cfg = readKnipConfig();
  assertKitAudited(cfg);

  if (process.argv.includes("--self-test")) {
    let result;
    try {
      writeFileSync(KIT_PROBE, "// 自测探针：本文件必须被 knip 报为 unused，跑完即删。\nexport const __knipSelftestProbe = 1;\n");
      result = runKnip(["--include", "files", "--no-progress"]);
    } finally {
      rmSync(KIT_PROBE, { force: true });
    }
    if (existsSync(KIT_PROBE)) {
      throw new GateError(KIT_PROBE_REL, "自测跑完必须删掉探针", "文件仍在磁盘上", "检查本脚本 finally 分支。");
    }
    const reported = result.out.includes(KIT_PROBE_REL);
    if (!reported) {
      throw new GateError(
        KIT_PROBE_REL,
        `knip 必须把 kit 内的死文件报为 unused（退出码非 0）`,
        `退出码 ${result.status}，输出里没有该文件`,
        "检查 knip.json 的 ignoreWorkspaces/workspaces 是否又把 kit 漏掉；命令：node scripts/check-dead-code.mjs",
      );
    }
    console.log("[self-test] PASS：kit 在审计域内，塞入的死文件被 knip 报出（并已清理）。");
    return 0;
  }

  const { status, out } = runKnip(["--no-progress"]);
  if (out.trim()) process.stdout.write(out);
  return status;
}

try {
  process.exit(main());
} catch (error) {
  if (error instanceof GateError) {
    console.error(`\n[check-dead-code] 门禁红：\n${error.message}\n`);
  } else {
    console.error(`\n[check-dead-code] 意外错误：${error?.stack ?? error}\n`);
  }
  process.exit(1);
}
