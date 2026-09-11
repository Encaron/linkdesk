#!/usr/bin/env node
/**
 * create-linkdesk-plugin——LinkDesk 插件脚手架 CLI（纯 Node，零依赖，对标 yo code）。
 *
 * 用法：
 *   npm create linkdesk-plugin my-cool-plugin   # 直接给名字（kebab-case，非交互）
 *   npm create linkdesk-plugin                  # 不带参数 → 交互式询问插件名
 *
 * 行为：把同目录 template/ 复制到 <cwd>/<name>，把占位符替换成真实值，打印下一步提示。
 * 占位符：{{pluginName}} {{displayName}} {{author}} {{date}}（递归替换所有模板文件）。
 *   {{date}} 注入 CHANGELOG.md 的初始段标题——格式必须是 `## v<版本>（YYYY-MM-DD）`，
 *   那是市场「更改日志」页签切段的解析依据（见 docs/02-Electron架构/.../插件规范化层/02）。
 *
 * 生成产物契约：见 docs/02-Electron架构/E6_插件生态与发布/02-插件开发工具链/01-create-linkdesk-plugin脚手架.md。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "template");

/** kebab-case——同时满足插件 id / viewsContainers key / npm 包名惯例（SAFE_PLUGIN_ID 的形状子集） */
const NAME_RE = /^[a-z][a-z0-9-]*$/;

/** 本地日期 YYYY-MM-DD（不用 toISOString——那是 UTC，跨时区会差一天） */
function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** my-cool-plugin → My Cool Plugin */
function toDisplayName(name) {
  return name
    .split("-")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
}

/** 作者默认值 = git config user.name；读不到（无 git/无配置）→ "you"（作者生成后自改） */
function gitUserName() {
  try {
    const r = spawnSync("git", ["config", "user.name"], { encoding: "utf8", timeout: 3000 });
    const v = (r.stdout || "").trim();
    return v || "you";
  } catch {
    return "you";
  }
}

/** 交互式单问——返回去除首尾空白的答案 */
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function replacePlaceholders(file, values) {
  let text = readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(values)) {
    text = text.split(`{{${key}}}`).join(value);
  }
  writeFileSync(file, text);
}

/** 递归替换目录内全部文件（模板全是文本文件，无需跳过二进制） */
function walkReplace(dir, values) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkReplace(full, values);
    else replacePlaceholders(full, values);
  }
}

async function main() {
  let name = (process.argv[2] || "").trim();
  if (!name) {
    name = await ask("插件名（kebab-case，如 my-cool-plugin）: ");
  }
  name = name.trim();
  if (!NAME_RE.test(name)) {
    console.error(`✖ 插件名须为 kebab-case（小写字母/数字/连字符），收到：${JSON.stringify(name)}`);
    process.exit(1);
  }

  const target = join(process.cwd(), name);
  if (existsSync(target) && readdirSync(target).length > 0) {
    console.error(`✖ ${name}/ 已存在且非空——换个名字，或清空后重跑`);
    process.exit(1);
  }

  mkdirSync(target, { recursive: true });
  cpSync(TEMPLATE_DIR, target, { recursive: true });

  // 🔥 模板里存的是 `gitignore`（无点），生成时才改名为 `.gitignore`。
  // 原因：**npm 打包恒定丢弃名为 `.gitignore` 的文件**（npm-packlist 排除表；实测
  // `template/.gitignoreprobe` 与 `template/probe.txt` 都能进 tarball，唯独 `.gitignore` 不能）。
  // 若模板里直接放 `.gitignore`，仓内生成（读模板目录）一切正常，**但发布后的
  // `npm create linkdesk-plugin` 生成的工程会没有 .gitignore**——作者第一次 `git add .`
  // 就把 node_modules/ 和 dist/ 全提交了。生成物契约见 check-scaffold.mjs 断言 8。
  const tplGitignore = join(target, "gitignore");
  if (existsSync(tplGitignore)) renameSync(tplGitignore, join(target, ".gitignore"));

  const values = {
    pluginName: name,
    displayName: toDisplayName(name),
    author: gitUserName(),
    date: todayLocal(),
  };
  walkReplace(target, values);

  console.log("");
  console.log(`✔ ${name}/ 已创建`);
  console.log("");
  console.log("  接下来：");
  console.log(`    cd ${name}`);
  console.log("    npm install");
  console.log("    npm run dev        # 浏览器热重载预览（改代码即时生效）");
  console.log("    npm run validate   # 校验 plugin.json（$schema / 字段 / i18n 文件）");
  console.log("    npm run build      # 打包出 <pluginId>.linkdesk-plugin，可装进 LinkDesk / 发布");
  console.log("");
  console.log("  然后：先读 README.md —— 目录该放哪、三条纪律、怎么发布都在里面。");
  console.log("  plugin.json 的 name / description / author 是你的身份信息，src/index.tsx 是插件本体。");
  console.log("  完整插件能力（侧栏视图 / 命令 / 设置 / 协议……）见 docs/03-插件制造/。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
