#!/usr/bin/env node
/**
 * `linkdesk-plugin-sdk` CLI——E6#1 拍板（bin 形态：与脚手架 01-create-linkdesk-plugin脚手架 / 发布
 * 流水线 03 文档钉死的作者模板 `build: "linkdesk-plugin-sdk build"` 一致，作者零额外配置）。
 *
 * 子命令 build / validate。bin 只是**编排壳**——validate 与 zip 归属仍在库内（validatePluginJson /
 * defineLinkdeskPluginConfig 内嵌 packager），无双路径分歧：
 *   - build：工程根有 vite.config.* → 交 Vite 自身加载（作者可自定义）；无 → 直接零配置默认路径
 *   - validate：跑 validatePluginJson 逐行打错，exit 1/0
 */
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "vite";
import { validatePluginJson } from "./validate.js";
import { defineLinkdeskPluginConfig } from "./vite-config.js";
import { packPluginData } from "./pack.js";
import { runPluginDev } from "./dev-server.js";
import { runPluginDevReal } from "./dev-real.js";
import { runPluginPublish } from "./publish.js";
import { runPluginLint, renderPluginLintReport } from "./eslint/lint.js";

const VITE_CONFIG_FILES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.cts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
];

const USAGE = `linkdesk-plugin-sdk <command>

命令：
  dev         在插件工程根起 dev 宿主（E6#24）——读 plugin.json → Vite dev server（端口 1421）
              → 浏览器打开纯前端预览 + HMR。只支持带 entry 的视图插件（脚手架 tab 形态）
  dev --real  E6#28.5 真机环——watch 作者源码 → 隔离单插件 build → 直写 {userData}/plugins/<id>
              → CDP reload「LinkDesk Pool」（LinkDesk 须以 --remote-debugging-port=9222 启动）。
              真 IPC/串口/LSP 类插件的秒级真机调试（壳零新代码；LINKDESK_USER_PLUGINS_DIR /
              LINKDESK_CDP_PORT 可覆盖）
  build       在插件工程根构建 .linkdesk-plugin（读 plugin.json → Vite build → zip）
  pack        纯数据插件（主题/语言/图标集——无 entry、无可编译表面）的打包通道（E6#98c）：
              打包目录整树（plugin.json 在顶）→ <pluginId>.linkdesk-plugin。排除 node_modules/dist/
              package.json/隐藏项。--out <path> 可指定输出文件（缺省 = 插件根 <pluginId>.linkdesk-plugin）
  publish     一键发布（E6#26）——自动链路：建 GitHub Release → 上传 .linkdesk-plugin → 更新工程
              origin 仓库根 marketplace.json（多市场源模型）。发前预览确认；--yes 跳过（CI）；
              --dry-run 只预览不碰网络。token：env LINKDESK_GITHUB_TOKEN，或首跑交互输入存入本机
  validate    校验 plugin.json（参数 = 路径，默认 ./plugin.json）
  lint        E6#54d 门禁（eslint 12 规则 + 三 check 双轨，全 WARN 永不 fail；知情绕行 =
              eslint-disable 注释）。参数 = 工程根，默认 process.cwd()
`;

async function cmdLint(root: string): Promise<number> {
  const report = await runPluginLint(root);
  // WARN 永不 fail（门禁哲学）——退出码只反映真 error（语法致命 / 作者自配 error 规则）
  process.stdout.write(renderPluginLintReport(report) + "\n");
  return report.eslintRows.some((r) => r.severity === 2) ? 1 : 0;
}

async function cmdBuild(): Promise<number> {
  const root = process.cwd();
  const hasConfig = VITE_CONFIG_FILES.some((f) => existsSync(join(root, f)));
  if (hasConfig) {
    await build(); // 作者自定义 vite.config.*（通常就是 defineLinkdeskPluginConfig()）
  } else {
    await build(defineLinkdeskPluginConfig()); // 零配置默认路径
  }
  return 0;
}

function cmdValidate(target: string): number {
  const res = validatePluginJson(target);
  if (!res.valid) {
    console.error("❌ plugin.json 验证失败：");
    for (const e of res.errors) console.error(`   ${e}`);
    // 警告照打——错与「写法过期」是两件事，修错时一并看到（E6#91d）
    for (const w of res.warnings ?? []) console.warn(`   ⚠ ${w}`);
    return 1;
  }
  console.log("✅ plugin.json 验证通过");
  for (const w of res.warnings ?? []) console.warn(`   ⚠ ${w}`);
  return 0;
}

async function main(): Promise<void> {
  const [, , command] = process.argv;
  const rest = process.argv.slice(3); // 参数：dev --real / validate <path> / lint <root>
  let code: number;
  switch (command) {
    case "dev": {
      // dev [--real]——真机环（E6#28.5）：build→直写 userData/plugins→CDP reload；挂起直到 Ctrl+C
      if (rest.includes("--real")) {
        await runPluginDevReal(process.cwd());
      } else if (rest.some((a) => a.startsWith("-") && a !== "--real")) {
        console.error(USAGE);
        code = 1;
        break;
      } else {
        // 挂起直到 Ctrl+C（server.close 后 resolve）——dev 无退出码语义，正常退出 = 0
        await runPluginDev(process.cwd());
      }
      code = 0;
      break;
    }
    case "build":
      code = await cmdBuild();
      break;
    case "pack": {
      // pack [--out <path>]——纯数据包通道（E6#98c）。只认这一个 flag，多余参数直接报用法（防拼错静默）
      const outIdx = rest.indexOf("--out");
      const unknown = rest.filter((a, i) => a !== "--out" && (outIdx < 0 || i !== outIdx + 1));
      if (outIdx >= 0 && rest[outIdx + 1] === undefined) {
        console.error("pack --out 需要一个路径参数");
        code = 1;
        break;
      }
      if (unknown.length > 0) {
        console.error(USAGE);
        code = 1;
        break;
      }
      const result = await packPluginData({ root: process.cwd(), outFile: outIdx >= 0 ? rest[outIdx + 1] : undefined });
      console.log(
        `[linkdesk-plugin-sdk] ✔ ${result.id}.linkdesk-plugin（${(result.bytes / 1024).toFixed(1)} KB, ` +
          `${result.entryCount} 条目）→ ${relative(process.cwd(), result.outPath) || result.outPath}`,
      );
      if (result.normalizedCount > 0) {
        console.log(`[linkdesk-plugin-sdk] 行尾归一到 LF 的条目：${result.normalizedCount}（二进制条目原样，未计入）`);
      }
      code = 0;
      break;
    }
    case "publish": {
      // publish [--yes|--dry-run]——E6#26 自动发布链路（发前预览确认）
      const flags = rest.filter((a) => a.startsWith("-"));
      const unknown = flags.filter((a) => a !== "--yes" && a !== "--dry-run");
      if (unknown.length > 0 || rest.some((a) => !a.startsWith("-"))) {
        console.error(USAGE);
        code = 1;
        break;
      }
      code = await runPluginPublish(process.cwd(), { yes: rest.includes("--yes"), dryRun: rest.includes("--dry-run") });
      break;
    }
    case "validate":
      code = cmdValidate(rest[0] ?? "plugin.json");
      break;
    case "lint":
      code = await cmdLint(rest[0] ?? process.cwd());
      break;
    default:
      console.error(USAGE);
      code = command ? 1 : 0;
      break;
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(`[linkdesk-plugin-sdk] ❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
