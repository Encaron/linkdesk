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
  build       在插件工程根构建 .linkdesk-plugin（读 plugin.json → Vite build → zip）
  validate    校验 plugin.json（参数 = 路径，默认 ./plugin.json）
`;

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
  const [, , command, arg] = process.argv;
  let code: number;
  switch (command) {
    case "build":
      code = await cmdBuild();
      break;
    case "validate":
      code = cmdValidate(arg ?? "plugin.json");
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
