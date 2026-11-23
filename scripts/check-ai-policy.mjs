#!/usr/bin/env node
/**
 * 机械门禁：**AI 权限档位与提权**（`01-设计/02` ＋ `03-门禁与验收/01-机械门禁.md`）。
 *
 * 用法：
 *   node scripts/check-ai-policy.mjs            # 判据本体
 *   node scripts/check-ai-policy.mjs --self-test # 自测（负控真跑打坏版）
 * 退出码 0 = 全绿；1 = 有 error。
 *
 * ── 在跑哪些判据（本批落地的）──
 *   P1 **OPS 全覆盖**：`whitelist.ts` 的每个 op 在 `policy/risk.ts` 的 `OP_RISK` 有登记；
 *      反向也查（登记了不存在的 op = 死条目）。error。
 *   P3 **`userOnly` 不可被 AI 调**：`runShellCommand` 必须在 `decide()` **之前**做
 *      `isUserOnlyCommand` 判定并抛 `PROTECTED`（静态判据；真行为由
 *      `policy/__tests__/elevation.test.ts` 的负控钉）。error。
 *   P4 **档位写入单一入口**：`ai.policy.mode` 字面量只许出现在 `policy/policyState.ts`（唯一读侧）
 *      与 `src/App/config/aiBridge.ts`（设置声明）；且声明文件里不许出现写配置的函数调用。error。
 *   P5 **策略键不散落**：`ai.policy.` 前缀字面量只许出现在上述两个落点。error。
 *   P9 **第二套名单禁令**：源码里不许再出现 `ASK_FIRST_`（旧静态名单已并入风险表）。error。
 *
 * ── 本批**不**在跑的（如实登记，别当漏扫）──
 *   · P2 运行期命令面比对（`COMMAND_RISK` 无死条目）：需要活实例的 `describe` 快照 ⇒ 归批 2
 *     （`aiPolicy.getState` 上线后接）。
 *   · P6/P7 插件仓语义/话术：跨仓（`E:/linkdesk-plugins`），SDK lint 侧管；本仓判不了也不该判。
 *   · P8 池侧订阅单源：`src/core/services/aiPolicy/` 尚未存在 ⇒ 批 2 同笔接。
 *
 * 纪律：每条判据都有负控（`--self-test` 真跑打坏版）；失败信息给「文件:判据 → 期望 → 修法」。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WHITELIST = join(ROOT, "electron", "services", "aiBridge", "whitelist.ts");
const RISK = join(ROOT, "electron", "services", "aiBridge", "policy", "risk.ts");
const POLICY_STATE = join(ROOT, "electron", "services", "aiBridge", "policy", "policyState.ts");
const CONFIG_DECL = join(ROOT, "src", "App", "config", "aiBridge.ts");

const POLICY_KEY_PREFIX = "ai.policy.";
const POLICY_MODE_KEY = "ai.policy.mode";
const WRITE_CALL_RE = /\b(setConfigurationValue|updateUserSettings|writeSettings|saveSettings)\s*\(/;

/** 去注释——判的是**代码**，不在注释里逮人（注释里解释「旧名单已删」不该判红） */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 从一个 `export const X: Record<...> = {` 块里取键（缩进 2 的 `key:` / `"key":`） */
function keysOfBlock(source, headerRe) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => headerRe.test(line));
  if (start < 0) return null;
  const keys = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === "};" || /^\}\s*;/.test(line)) break;
    const m = line.match(/^ {2}"?([A-Za-z_][\w.-]*)"?\s*:\s*\{/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/** 取一个函数体（从 `header` 起，到下一个顶格 `}`） */
function functionBody(source, header) {
  const start = source.indexOf(header);
  if (start < 0) return null;
  const from = source.slice(start);
  const end = from.search(/\n\}\n/);
  return end < 0 ? from : from.slice(0, end + 2);
}

/** 递归收集源码（.ts/.tsx，排除测试与 d.ts） */
function collectSources(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === "dist-electron" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSources(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.(test|spec)\./.test(name) || name.endsWith(".d.ts")) continue;
    out.push(full);
  }
  return out;
}

/** 归一化路径便于白名单比较（win32 反斜杠 / 大小写） */
const norm = (p) => p.replace(/\\/g, "/").toLowerCase();

/**
 * 判据本体——纯函数，自测直接打它（⛔ 不必落盘）。
 * @param {{ whitelist: string, risk: string, policyStatePath: string, configDeclPath: string, files: Array<{path: string, text: string}> }} input
 * @returns {{ code: string, level: "error"|"warn", message: string }[]}
 */
export function checkAiPolicy(input) {
  const findings = [];
  const ops = keysOfBlock(input.whitelist, /export const OPS\b/);
  const opRisk = keysOfBlock(input.risk, /export const OP_RISK\b/);

  if (!ops || !opRisk) {
    findings.push({
      code: "P1",
      level: "error",
      message: "解析不到 OPS / OP_RISK 表——表头被改形状了？先修门禁再谈（⛔ 不许静默放过）",
    });
  } else {
    for (const op of ops) {
      if (!opRisk.includes(op)) {
        findings.push({
          code: "P1",
          level: "error",
          message: `op「${op}」在 OP_RISK 没有登记——新 op 必须同笔登记风险级（修法：electron/services/aiBridge/policy/risk.ts 的 OP_RISK 加一条）`,
        });
      }
    }
    for (const op of opRisk) {
      if (!ops.includes(op)) {
        findings.push({
          code: "P1",
          level: "error",
          message: `OP_RISK 登记了不存在的 op「${op}」——死条目会让风险判断过期（修法：删掉这一条）`,
        });
      }
    }
  }

  const gate = functionBody(input.whitelist, "async function runShellCommand(");
  if (!gate) {
    findings.push({
      code: "P3",
      level: "error",
      message: "找不到 runShellCommand——唯一执行出口被改名/删除了？L2 命令锁无处可挂",
    });
  } else {
    const userOnlyAt = gate.indexOf("isUserOnlyCommand(");
    const decideAt = gate.indexOf("decide(");
    if (userOnlyAt < 0 || !/PROTECTED/.test(gate)) {
      findings.push({
        code: "P3",
        level: "error",
        message: "runShellCommand 缺 userOnly 判定（EPROTECTED）——AI 可调「能改门本身」的命令（修法：先 isUserOnlyCommand ⇒ 抛 PROTECTED，再 decide）",
      });
    } else if (decideAt >= 0 && userOnlyAt > decideAt) {
      findings.push({
        code: "P3",
        level: "error",
        message: "userOnly 判定写在 decide 之后——被拒的命令会先弹框/留下策略痕迹；它必须在最前",
      });
    }
  }

  const allowedKeyFiles = new Set([norm(input.policyStatePath), norm(input.configDeclPath)]);

  for (const file of input.files) {
    const path = norm(file.path);
    const text = stripComments(file.text);
    const where = relative(ROOT, file.path).replace(/\\/g, "/");

    if (text.includes(POLICY_KEY_PREFIX) && !allowedKeyFiles.has(path)) {
      findings.push({
        code: "P5",
        level: "error",
        message: `${where} 出现「${POLICY_KEY_PREFIX}」字面量——策略键只许住 policy/policyState.ts 与 src/App/config/aiBridge.ts（修法：改走 aiPolicy.getState() / 命令）`,
      });
    }

    if (text.includes(POLICY_MODE_KEY)) {
      if (!allowedKeyFiles.has(path)) {
        findings.push({
          code: "P4",
          level: "error",
          message: `${where} 写死了档位键「${POLICY_MODE_KEY}」——读侧唯一入口是 policy/policyState.ts，声明侧唯一入口是 config/aiBridge.ts`,
        });
      } else if (path === norm(input.configDeclPath) && WRITE_CALL_RE.test(text)) {
        findings.push({
          code: "P4",
          level: "error",
          message: `${where} 同时出现档位键与写配置调用——声明文件只许声明，⛔ 不许写档位（写点只有壳侧 aiPolicy.setMode）`,
        });
      }
    }

    if (/ASK_FIRST_/.test(text)) {
      findings.push({
        code: "P9",
        level: "error",
        message: `${where} 出现 ASK_FIRST_ 旧名单——敏感名单已并入 policy/risk.ts 的 R3（⛔ 不许保留第二份）`,
      });
    }
  }

  return findings;
}

function loadRealInput() {
  const sources = [];
  for (const dir of ["src", "electron"]) collectSources(join(ROOT, dir), sources);
  return {
    whitelist: readFileSync(WHITELIST, "utf8"),
    risk: readFileSync(RISK, "utf8"),
    policyStatePath: POLICY_STATE,
    configDeclPath: CONFIG_DECL,
    files: sources.map((path) => ({ path, text: readFileSync(path, "utf8") })),
  };
}

/* ── 自测：正控 + 负控（每条判据都真跑一份打坏版） ── */

function selfTest() {
  const base = {
    whitelist: [
      "export const OPS: Record<string, BridgeOp> = {",
      "  describe: { name: 'describe' },",
      "  exec: { name: 'exec' },",
      "};",
      "async function runShellCommand(ctx, commandId, args) {",
      "  if (isUserOnlyCommand(list, commandId)) throw coded(PROTECTED, 'no');",
      "  if (decide('auto', 'R1') === 'deny') throw coded(POLICY_DENIED, 'no');",
      "}",
    ].join("\n"),
    risk: ["export const OP_RISK: Record<string, RiskEntry> = {", "  describe: { risk: 'R0' },", "  exec: { risk: 'R1' },", "};"].join("\n"),
    policyStatePath: "/x/policy/policyState.ts",
    configDeclPath: "/x/src/App/config/aiBridge.ts",
    files: [
      { path: "/x/policy/policyState.ts", text: "export const POLICY_MODE_KEY = 'ai.policy.mode';" },
      { path: "/x/src/App/config/aiBridge.ts", text: "// declares ai.policy.mode" },
      { path: "/x/src/core/other.ts", text: "export const x = 1;" },
    ],
  };
  const cases = [
    {
      name: "正控：干净来源 ⇒ 零 findings",
      input: base,
      expect: (f) => f.length === 0,
    },
    {
      name: "P1 负控：删掉一条 OP_RISK ⇒ 红",
      input: { ...base, risk: base.risk.replace("  exec: { risk: 'R1' },\n", "") },
      expect: (f) => f.some((x) => x.code === "P1"),
    },
    {
      name: "P1 负控：登记不存在的 op ⇒ 红",
      input: { ...base, risk: base.risk.replace("};", "  ghost: { risk: 'R0' },\n};") },
      expect: (f) => f.some((x) => x.code === "P1"),
    },
    {
      name: "P3 负控：去掉 userOnly 判定 ⇒ 红",
      input: {
        ...base,
        whitelist: base.whitelist.replace(
          "  if (isUserOnlyCommand(list, commandId)) throw coded(PROTECTED, 'no');\n",
          "",
        ),
      },
      expect: (f) => f.some((x) => x.code === "P3"),
    },
    {
      name: "P3 负控：userOnly 判定挪到 decide 之后 ⇒ 红",
      input: {
        ...base,
        whitelist: [
          "export const OPS: Record<string, BridgeOp> = {",
          "  describe: { name: 'describe' },",
          "  exec: { name: 'exec' },",
          "};",
          "async function runShellCommand(ctx, commandId, args) {",
          "  if (decide('auto', 'R1') === 'deny') throw coded(POLICY_DENIED, 'no');",
          "  if (isUserOnlyCommand(list, commandId)) throw coded(PROTECTED, 'no');",
          "}",
        ].join("\n"),
      },
      expect: (f) => f.some((x) => x.code === "P3"),
    },
    {
      name: "P5 负控：策略键字面量散落到业务文件 ⇒ 红",
      input: {
        ...base,
        files: [...base.files, { path: "/x/src/core/leak.ts", text: "const key = 'ai.policy.mode';" }],
      },
      expect: (f) => f.some((x) => x.code === "P5"),
    },
    {
      name: "P4 负控：声明文件里写配置 ⇒ 红",
      input: {
        ...base,
        files: base.files.map((f) =>
          f.path.includes("config/aiBridge.ts")
            ? { ...f, text: "setConfigurationValue('ai.policy.mode', 'full')" }
            : f,
        ),
      },
      expect: (f) => f.some((x) => x.code === "P4"),
    },
    {
      name: "P9 负控：旧 ASK_FIRST_ 名单回来 ⇒ 红",
      input: {
        ...base,
        files: [...base.files, { path: "/x/src/old.ts", text: "export const ASK_FIRST_OPS = [];" }],
      },
      expect: (f) => f.some((x) => x.code === "P9"),
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const findings = checkAiPolicy(c.input);
    const ok = c.expect(findings);
    if (!ok) {
      failed += 1;
      console.error(`  ✗ ${c.name}`);
      console.error(`    findings: ${JSON.stringify(findings)}`);
    } else {
      console.log(`  ✓ ${c.name}`);
    }
  }
  if (failed > 0) {
    console.error(`\n[check-ai-policy] 自测失败 ${failed} 例——门禁自己不可信，⛔ 别接线`);
    process.exit(1);
  }
  console.log(`\n[check-ai-policy] 自测通过（${cases.length} 例，含负控）`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const findings = checkAiPolicy(loadRealInput());
  const errors = findings.filter((f) => f.level === "error");
  for (const f of findings) {
    const tag = f.level === "error" ? "ERROR" : "WARN";
    console[f.level === "error" ? "error" : "warn"](`[${tag}] ${f.code} ${f.message}`);
  }
  if (errors.length > 0) {
    console.error(`\n[check-ai-policy] ${errors.length} 条 error —— AI 权限档位/防自提权判据不过`);
    process.exit(1);
  }
  console.log(`[check-ai-policy] OK（${findings.length} 条 warn）`);
}
