#!/usr/bin/env node
/**
 * `marketplace-kit` CLI——bin 只是编排壳，判定全在库内（validate/init/license 纯函数，vitest 直测）。
 *
 * 子命令（详案 R4-4.1 bin: `marketplace-kit`；11 §二 CLI 草图里的 `linkdesk-market` 旧名以详案为准）：
 *   validate <路径>       校验 marketplace.json / authors/*.json / 整个目录（目录模式做跨文件合集引用检查）
 *   init [--author <id>]  生成三形态骨架（单插件仓零配置 / 多插件仓+config / 独立市场仓+authors）；⛔ 不覆盖已有文件
 *   keygen [--author <id>] [--out <文件>]
 *                         Ed25519 密钥对——公钥（裸 32B base64）打印出来粘进 authors/<id>.json 的 publicKey；
 *                         私钥落盘 0600，⛔ 不进仓不外传
 *   sign-license --key <私钥文件> --plugin <id> [--machine <指纹>] [--exp <日期|时长>]
 *                         产出 v1.<b64url(payload)>.<b64url(sig)> 许可密钥（格式契约 = 壳 license-verify-service 头注）
 */

import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { formatIssues, isAuthorFileName, isMarketplaceFileName, validateAuthorFile, validateMarketplace } from "./validate.js";
import { formatMediaResolve, mediaResolve } from "./mediaResolve.js";
import { initMarketplace } from "./init.js";
import { keygen, signLicense } from "./license.js";

const USAGE = `marketplace-kit <command>

命令：
  validate <路径>       校验 marketplace.json / authors/<id>.json（文件路径），
                        或整个目录（校验其中全部市场 JSON ＋ 跨文件合集引用检查）。
                        退出码：有 error = 1（warning 只提示不拦——市场侧同款语义）
  init [--author <id>] [--dir <目录>]
                        三形态骨架（默认当前目录）：
                          根有 plugin.json、无 marketplace.json → L0 零配置（不写任何文件，给指引）
                          否则 → L1（根 marketplace.json ＋ marketplace.config.json）
                          --author <GitHub用户名> → 再补 authors/<id>.json（L2 独立市场仓；
                          L0 仓则只补作者块，⛔ 不写根 marketplace.json）
                        ⛔ 已有文件不覆盖
  keygen [--author <id>] [--out <文件>]
                        生成 Ed25519 作者密钥对：私钥落盘（默认 <authorId>.private.key，0600），
                        公钥（裸 32 字节 base64）打印——粘进 authors/<id>.json 的 publicKey 字段。
                        ⛔ 私钥不进 git、不外传；丢了换钥 = 旧密钥全部失效
  sign-license --key <私钥文件> --plugin <插件id> [--machine <机器指纹>] [--exp <到期>]
                        签发许可密钥（v1.<payload>.<signature>，LinkDesk 壳离线验签）。
                        --exp：YYYY-MM-DD（用到当天底）/ 完整 ISO 时刻 / 30d·12w·6m·1y
                        --machine：买家 machineFingerprint（壳「本机信息」可查）；给了 = 一机一码
  media:resolve <marketplace.json> [id] [--json]
                        媒体选帧 dry-run：逐条打印 kind（video/image/generated）/ frames / video / poster。
                        相对 URL、http 明文、视频越位、多视频 → 非零退出（与发布校验同一套错误）。
                        「--json」给 AI 读；不给 id = 全部条目。
`;

/** 解析校验目标 → (kind, data)。文件名 marketplace.json 直接定类；其余按顶层形状嗅探
 *  （examples/full.json 这类参照物不该因为文件名就被判成作者块）。 */
function readTarget(path: string): { kind: "marketplace" | "author"; data: unknown } {
  const abs = isAbsolute(path) ? path : resolve(path);
  if (!existsSync(abs)) throw new Error(`路径不存在：${path}`);
  if (!basename(abs).endsWith(".json")) throw new Error(`不是 .json 文件：${path}（目录请直接传目录）`);
  const data: unknown = JSON.parse(readFileSync(abs, "utf8"));
  if (isMarketplaceFileName(basename(abs))) return { kind: "marketplace", data };
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.plugins)) return { kind: "marketplace", data };
    if (typeof o.authorId === "string") return { kind: "author", data };
  }
  throw new Error(`无法识别文件类型：${path}（顶层要有 plugins[]（目录文件）或 authorId（作者块））`);
}

function cmdValidate(path: string): number {
  const abs = isAbsolute(path) ? path : resolve(path);
  let hadError = false;
  if (existsSync(abs) && !basename(abs).endsWith(".json")) {
    // 目录模式：marketplace.json + authors/*.json + 跨文件合集引用
    const files = readdirSync(abs).filter((f) => f.endsWith(".json") && (isMarketplaceFileName(f) || isAuthorFileName(f)));
    if (files.length === 0) {
      console.error(`目录里没有 marketplace.json / authors/*.json：${path}`);
      return 1;
    }
    let knownCollections: Set<string> | undefined;
    const mpFile = files.find((f) => isMarketplaceFileName(f));
    if (mpFile) {
      const result = validateMarketplace(JSON.parse(readFileSync(join(abs, mpFile), "utf8")));
      if (result.errors.length > 0) hadError = true;
      if (result.errors.length + result.warnings.length > 0) console.log(`── ${mpFile}\n${formatIssues(result)}`);
      const parsed = JSON.parse(readFileSync(join(abs, mpFile), "utf8")) as { collections?: Array<{ id?: string }> };
      knownCollections = new Set((parsed.collections ?? []).map((c) => typeof c?.id === "string" ? c.id : "").filter(Boolean));
    } else {
      console.log("⚠ 目录模式：未见 marketplace.json——合集引用检查跳过（没有可比对的 collections[]）。");
    }
    for (const f of files.filter((x) => isAuthorFileName(x))) {
      const result = validateAuthorFile(JSON.parse(readFileSync(join(abs, f), "utf8")), knownCollections);
      if (result.errors.length > 0) hadError = true;
      if (result.errors.length + result.warnings.length > 0) console.log(`── ${f}\n${formatIssues(result)}`);
    }
    if (!hadError) console.log("validate 完成" + (hadError ? "" : "——error 0"));
    return hadError ? 1 : 0;
  }
  const { kind, data } = readTarget(path);
  const result = kind === "marketplace" ? validateMarketplace(data) : validateAuthorFile(data);
  if (result.errors.length + result.warnings.length > 0) console.log(formatIssues(result));
  if (result.errors.length === 0) console.log("validate 完成——error 0，warning " + result.warnings.length);
  return result.errors.length > 0 ? 1 : 0;
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${flag} 需要一个值`);
  return v;
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  switch (command) {
    case "validate":
      return cmdValidate(rest[0] ?? ".");
    case "init": {
      const result = initMarketplace({ dir: rest.includes("--dir") ? (argValue(rest, "--dir") ?? process.cwd()) : process.cwd(), author: argValue(rest, "--author") });
      const formLabel = result.form === "L0" ? "单插件仓（零配置）" : result.form === "L1" ? "多插件仓" : "独立市场仓";
      console.log(`形态：${formLabel}` + (result.written.length ? `，已生成：\n  ${result.written.join("\n  ")}` : "——零配置，未写任何文件"));
      for (const g of result.guidance) console.log(`· ${g}`);
      return 0;
    }
    case "keygen": {
      const out = argValue(rest, "--out");
      const result = keygen({ authorId: argValue(rest, "--author"), out });
      console.log(`私钥已写入（0600，⛔ 不进 git 不外传）：${result.privateKeyPath}`);
      console.log(`公钥（粘进 authors/<id>.json 的 publicKey 字段）：\n${result.publicKey}`);
      return 0;
    }
    case "sign-license": {
      const keyFile = argValue(rest, "--key");
      const pluginId = argValue(rest, "--plugin");
      if (!keyFile) throw new Error("--key 必填（keygen 产出的私钥文件）");
      if (!pluginId) throw new Error("--plugin 必填（许可绑定到哪个插件 id）");
      const result = signLicense({ keyFile, pluginId, machine: argValue(rest, "--machine"), exp: argValue(rest, "--exp") });
      console.log(`许可密钥（发给买家，粘贴进商店「我有密钥」）：\n${result.key}`);
      const p = result.payload;
      console.log(`载荷：pluginId=${p.pluginId}${p.machine ? ` machine=${p.machine}` : "（未绑机器）"}${p.exp ? ` exp=${new Date(p.exp * 1000).toISOString()}` : "（永久）"}`);
      return 0;
    }
    case "media:resolve": {
      const args = rest.filter((a) => !a.startsWith("--"));
      const file = args[0] ?? "marketplace.json";
      const id = args[1];
      const abs = isAbsolute(file) ? file : resolve(file);
      if (!existsSync(abs)) throw new Error(`路径不存在：${file}`);
      const data: unknown = JSON.parse(readFileSync(abs, "utf8"));
      const result = mediaResolve(data, id);
      console.log(rest.includes("--json") ? JSON.stringify(result, null, 2) : formatMediaResolve(result));
      return result.errors.length > 0 ? 1 : 0;
    }
    default:
      console.error(command ? `未知命令：${command}\n` + USAGE : USAGE);
      return command ? 1 : 0;
  }
}

/** bin 直跑入口（import.meta.url 守卫——测试可安全 import 本文件） */
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(`[marketplace-kit] ❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

export { main };
