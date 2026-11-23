#!/usr/bin/env node
/**
 * 可替换性契约测试 —— 首版（半自动）· 2026-11-24 D3。
 *
 * 判据（一句话）：把官方设置插件整套换成「只会读 schema、不会任何特判」的最小 UI，
 * 关键行为必须一模一样。不一样的地方 = 住错层的残渣（比 grep 更准）。
 *
 * 本脚本是**发版前清单的一条腿**（⛔ 不进 `npm run check`——起实例耗时不进每次提交门）：
 *   ① 形状自检：夹具 manifest / 源码零宿主字面量（K1/K2/K3/K9/K10）；
 *   ② 环境读账：官方设置仓在场 + 夹具在容器内可被安装；
 *   ③ 输出 R1–R7 CDP 手动场景清单（首版半自动；稳定后再抽 headless mock 进 CI）。
 *
 * 用法：npm run test:replaceability [-- --json] / --self-test
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listSourceFiles, readStripped, resolveContainer } from "./lib/gate-scan.mjs";
import { scanPluginSource } from "./lib/plugin-host-knowledge.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "scripts", "contract", "minimal-settings-ui");
const SELF_TEST = process.argv.includes("--self-test");
const JSON_OUT = process.argv.includes("--json");

/** 夹具形状 + 宿主知识自检（纯结构，零实例） */
export function inspectFixture(fixtureDir = FIXTURE_DIR) {
  const errors = [];
  const manifestPath = path.join(fixtureDir, "plugin.json");
  if (!fs.existsSync(manifestPath)) return { errors: [`夹具缺 plugin.json：${manifestPath}`], files: 0 };

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    return { errors: [`夹具 plugin.json 解析失败：${e}`], files: 0 };
  }
  if (manifest.factoryRole !== "settings") errors.push("夹具必须声明 factoryRole:\"settings\"（整套替换的设置 UI）");
  if (!manifest.entry) errors.push("夹具缺 entry");
  else if (!fs.existsSync(path.join(fixtureDir, manifest.entry))) errors.push(`夹具 entry 不存在：${manifest.entry}`);
  if (manifest.pluginId === "settings") errors.push("夹具不得占用官方 settings 的 pluginId（它是替换件，不是官方件）");

  let files = 0;
  for (const f of listSourceFiles(fixtureDir, [".ts", ".tsx", ".js", ".jsx"])) {
    const src = readStripped(f);
    if (src === null) {
      errors.push(`夹具源码不可读：${f}`);
      continue;
    }
    files++;
    // repo 传 "settings" 以启用 K3（夹具同样不许出现 app.* 键名）
    for (const h of scanPluginSource(src, { repo: "settings", file: path.relative(fixtureDir, f), official: true })) {
      if (["K1", "K2", "K3", "K9", "K10"].includes(h.rule)) {
        errors.push(`夹具持有宿主知识：${h.file}:${h.line} [${h.rule}] ${h.excerpt}`);
      }
    }
  }
  return { errors, files };
}

const SCENARIOS = [
  ["R1", "选背景图（app）", "点「选择图片」→ 选一张", "起始目录 = userData/appearance；拷贝入库；app.backgroundImage = 受控 URL"],
  ["R2", "选背景图（zone）", "同上，target=zone", "同目录、同入库；app.zoneBackgroundImage 正确"],
  ["R3", "主题选择", "选主题 / 复位", "app.theme 落盘；主题生效；来源徽标语义一致"],
  ["R4", "分组与顺序", "打开主题组", "分节名/顺序/门控（appearanceMode）一致"],
  ["R5", "AI 权限档位（任务 A）", "切四档", "ai.policy.mode 落盘；风险摘要一致；userOnly 命令仍拒 AI"],
  ["R6", "只读状态行", "看 AI 接入", "状态来自运行时命令，不是写死"],
  ["R7", "旧壳兼容", "壳无新命令", "夹具降级为只读，不崩"],
];

if (SELF_TEST) {
  const good = inspectFixture();
  const okGood = good.errors.length === 0 && good.files > 0;
  console.log(`${okGood ? "✓" : "✗"} 夹具形状/${good.files} 个源文件 ${okGood ? "通过（零宿主字面量）" : good.errors.join("; ")}`);

  // 负控：临时目录里放一条带宿主知识的夹具源码，必须被抓到
  const tmp = fs.mkdtempSync(path.join(ROOT, "scratch", "replaceability-selftest-"));
  try {
    fs.writeFileSync(path.join(tmp, "plugin.json"), JSON.stringify({ pluginId: "bad-fixture", factoryRole: "settings", entry: "x.ts" }));
    fs.writeFileSync(path.join(tmp, "x.ts"), 'const p = window.linkdesk.path.join(window.linkdesk.path.appDataDir(), "settings.json");');
    const bad = inspectFixture(tmp);
    const okBad = bad.errors.some((e) => e.includes("K1") || e.includes("K10"));
    console.log(`${okBad ? "✓" : "✗"} 负控：夹具自拼宿主路径被拦下`);
    if (!okGood || !okBad) process.exit(1);
    console.log("\n✅ 可替换性夹具自测通过");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(0);
}

const result = inspectFixture();
const { dir: container, present } = resolveContainer();
const settingsRepo = present ? path.join(container, "official", "settings") : "";
const settingsPresent = settingsRepo && fs.existsSync(path.join(settingsRepo, "plugin.json"));

const report = {
  date: new Date().toISOString().slice(0, 10),
  fixture: { dir: path.relative(ROOT, FIXTURE_DIR), files: result.files, errors: result.errors },
  container: { dir: container, present },
  officialSettings: { dir: settingsRepo, present: Boolean(settingsPresent) },
  scenarios: SCENARIOS.map(([id, name, action, expect]) => ({ id, name, action, expect })),
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("可替换性契约测试 · 首版（半自动）");
  console.log(`夹具：${report.fixture.dir}（${report.fixture.files} 个源文件）`);
  if (report.fixture.errors.length) {
    console.error("\n❌ 夹具自检红：");
    for (const e of report.fixture.errors) console.error(`  · ${e}`);
  } else {
    console.log("  ✅ 形状自检：factoryRole=settings / entry 在 / 零宿主字面量（K1/K2/K3/K9/K10）");
  }
  console.log(`容器：${container}（${present ? "在场" : "不在场——插件域跳过"}）`);
  console.log(`官方 settings：${settingsPresent ? "在场" : "不在场（对照组缺失，场景只能对夹具单跑）"}`);
  console.log("\nCDP 手动场景（首版；稳定后抽 headless 进 CI）：");
  for (const [id, name, action, expect] of SCENARIOS) {
    console.log(`  ${id} · ${name}：${action} ⇒ ${expect}`);
  }
  console.log("\n产出：scratch/replaceability/<date>.json（⛔ 不进 git）");
}

if (result.errors.length) process.exit(1);
