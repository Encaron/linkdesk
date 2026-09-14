#!/usr/bin/env node
/**
 * create-linkdesk-plugin——LinkDesk 插件脚手架 CLI（纯 Node，零依赖，对标 yo code）。
 *
 * 用法：
 *   npm create linkdesk-plugin my-cool-plugin            # 直接给名字（kebab-case，非交互）
 *   npm create linkdesk-plugin                           # 不带参数 → 交互式询问插件名
 *   npm create linkdesk-plugin my-cool-plugin --no-git   # 跳过建仓
 *
 * 行为：把同目录 template/ 复制到 <cwd>/<name>，占位符替换成真实值，**按 `cargo new` 的语义决定
 *      建不建 git 仓**，再打印下一步提示。
 * 占位符：{{pluginName}} {{displayName}} {{author}} {{date}}（递归替换所有模板文件）。
 *   {{date}} 注入 CHANGELOG.md 的初始段标题——格式必须是 `## v<版本>（YYYY-MM-DD）`，
 *   那是市场「更改日志」页签切段的解析依据（见 docs/02-Electron架构/.../插件规范化层/02）。
 *
 * 🔴 建仓三语义——照抄 `cargo new`，**不是「一律 git init」**：
 *   ① 目标目录**已在某个 git 仓内** ⇒ 不 init（防嵌套仓——在容器目录里生成插件正是这种情形）
 *   ② 不在任何 git 仓内 ⇒ `git init -b main`
 *   ③ `--no-git` ⇒ 不建仓（逃生口，对标 `cargo new --vcs none`）
 *   比 cargo 多一步：建完仓**顺手做一次初始提交**——模板自带 `.gitignore`，作者第一步看到的
 *   就不是满屏 untracked，`git log` 也立刻有一笔可回退的基线。不想要仓的人用 `--no-git`。
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

/** 认识的旗标——**显式白名单**：`--nogit` 这种拼错不能静默略过（作者会以为仓建好了） */
const KNOWN_FLAGS = ["--no-git", "--help", "-h"];

const USAGE = [
  "用法：",
  "  npm create linkdesk-plugin <name>          生成 <name>/ 插件工程（kebab-case）",
  "  npm create linkdesk-plugin                 交互式询问插件名",
  "选项：",
  "  --no-git      不建 git 仓（对标 cargo new --vcs none）",
  "  --help, -h    显示本说明",
].join("\n");

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

// ─────────────────────────── git（§〇 建仓三语义） ───────────────────────────

/** 跑一条 git 命令——不抛，失败由调用方看 status（没装 git 时 status=null 且 error 有值） */
function git(args, cwd) {
  try {
    return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 15000 });
  } catch (err) {
    return { status: null, stdout: "", stderr: String(err?.message ?? err) };
  }
}

/** git 在不在 PATH 上——不在就不建仓（骨架照常给，不拿「没装 git」卡住作者） */
function gitAvailable() {
  return git(["--version"]).status === 0;
}

/**
 * 目标目录是否**已在某个 git 仓内**——`cargo new` 的「不造嵌套仓」判据。
 *
 * 在**目标目录里**问（不是 cwd）：目录此时已建出来，向上找仓根正是 `cargo new` 的做法。
 * `rev-parse --show-toplevel` 在仓外会 exit 128 ⇒ 那就是「不在仓内」。
 */
function insideGitRepo(dir) {
  const r = git(["rev-parse", "--show-toplevel"], dir);
  return r.status === 0 ? (r.stdout || "").trim() : "";
}

/** stderr 摘要（给作者看的失败原因，最多三行） */
function why(r) {
  return ((r.stderr || r.stdout || "").trim().split("\n").filter(Boolean).slice(0, 3).join(" / ")) || "（无输出）";
}

/**
 * 建仓——返回结果对象给 CLI 输出（**作者必须知道到底建没建、为什么**，不许自己猜）。
 *
 * 🔴 任何一步失败都**不终止脚手架**：骨架已经生成好了，建仓是加分项，不是前置条件。
 */
function setupGit(target, { noGit }) {
  if (noGit) return { kind: "skipped-flag" };
  if (!gitAvailable()) return { kind: "no-git-binary" };

  const top = insideGitRepo(target);
  if (top) return { kind: "skipped-inside-repo", top };

  const init = git(["init", "-b", "main"], target);
  if (init.status !== 0) {
    // `-b` 是 git 2.28+ 才有的旗标；更老的 git 退回 init + 显式把 HEAD 指到 main
    // （不这么做，作者第一次 push 会撞上默认分支叫 master 的提示，与 GitHub 默认也不一致）
    if (git(["init"], target).status !== 0) return { kind: "failed", step: "git init", detail: why(init) };
    git(["symbolic-ref", "HEAD", "refs/heads/main"], target);
  }

  if (git(["add", "-A"], target).status !== 0) return { kind: "init-only", step: "git add" };

  // `--no-verify`：这是**一个新仓的初始提交**，不该被使用者全局 core.hooksPath 上的
  // commit-msg / pre-commit 钩子审（那些钩子是给别的仓立的规矩）
  const commit = git(["commit", "--no-verify", "-m", "chore: 初始骨架（create-linkdesk-plugin 生成）"], target);
  if (commit.status !== 0) return { kind: "init-only", step: "git commit", detail: why(commit) };

  return { kind: "created" };
}

/** 建仓结果 → CLI 那一行（`git` 那步发生了什么，说全） */
function gitLine(res) {
  switch (res.kind) {
    case "created":
      return "  ✔ 已建 git 仓（main 分支 + 一次初始提交）";
    case "skipped-flag":
      return "  · --no-git：未建 git 仓（发布前需要自己 git init）";
    case "skipped-inside-repo":
      return `  · 已在 git 仓内（${res.top}）——按 cargo new 语义不建嵌套仓`;
    case "no-git-binary":
      return "  ⚠️ 找不到 git（不在 PATH）——未建仓；装上 git 后进目录自己 git init -b main";
    case "init-only":
      return `  ⚠️ 仓已建，但初始提交没成（${res.step}）：${res.detail}\n     多半是没配 git 身份 → git config --global user.name "你" && git config --global user.email "you@example.com"，再进目录 git commit -m "初始骨架"`;
    default:
      return `  ⚠️ 建仓失败（${res.step}）：${res.detail}——进目录自己 git init -b main`;
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
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("-"));
  const positional = argv.filter((a) => !a.startsWith("-"));

  if (flags.includes("--help") || flags.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const unknown = flags.filter((f) => !KNOWN_FLAGS.includes(f));
  if (unknown.length > 0) {
    console.error(`✖ 不认识的选项：${unknown.join("、")}\n\n${USAGE}`);
    process.exit(1);
  }
  if (positional.length > 1) {
    console.error(`✖ 只接受一个插件名，收到 ${positional.length} 个：${positional.join("、")}\n\n${USAGE}`);
    process.exit(1);
  }
  const noGit = flags.includes("--no-git");

  let name = (positional[0] || "").trim();
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

  // 建仓放在**最后**——此刻工作区已是终态，初始提交提交的就是作者拿到的那个骨架
  const repo = setupGit(target, { noGit });

  console.log("");
  console.log(`✔ ${name}/ 已创建`);
  console.log(gitLine(repo));
  console.log("");
  console.log("  接下来：");
  console.log(`    cd ${name}`);
  console.log("    npm install");
  console.log("    npm run dev        # 浏览器热重载预览（改代码即时生效）");
  console.log("    npm run validate   # 校验 plugin.json（$schema / 字段 / i18n 文件）");
  console.log("    npm run build      # 打包出 <pluginId>.linkdesk-plugin，可装进 LinkDesk / 发布");
  if (repo.kind === "created") {
    console.log("");
    console.log("  要发布（npm run publish）时还需要一个 GitHub 远端：");
    console.log("    git remote add origin git@github.com:<你>/<仓库>.git");
    console.log("    git push -u origin main");
  }
  console.log("");
  console.log("  然后：先读 README.md —— 目录该放哪、三条纪律、怎么发布都在里面。");
  console.log("  plugin.json 的 name / description / author 是你的身份信息，src/index.tsx 是插件本体。");
  console.log("  完整插件能力（侧栏视图 / 命令 / 设置 / 协议……）见 docs/03-插件制造/。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
