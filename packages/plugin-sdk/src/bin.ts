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
import { join } from "node:path";
import { build } from "vite";
import { validatePluginJson } from "./validate.js";
import { defineLinkdeskPluginConfig } from "./vite-config.js";
import { runPluginDev } from "./dev-server.js";
import { runPluginDevReal } from "./dev-real.js";
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
    return 1;
  }
  console.log("✅ plugin.json 验证通过");
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
