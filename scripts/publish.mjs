/**
 * E6#57.15a：本地发布一键——写身份 → 过发布门禁 → 打包 → 还原本地占位 → 打印你要敲的两条命令。
 *
 * 为什么要有这个编排器（而不是在 package.json 里用 `&&` 串三条）：
 *   `electron/product.json` 是**写进去又要还原**的（发布期写真实身份，dev 期保持占位，§2.3）。
 *   用 `a && b && c` 串，中间任何一步失败（或你按了 Ctrl+C）都会把**发布期的版本号留在仓库里**，
 *   下次提交顺手带上 ⇒ 又变成「手写第二份版本号」。故必须 try/finally + 信号处理兜住。
 *
 * 执行序（顺序是有理由的，别调）：
 *   0. **工作区必须干净**（除未跟踪文件）——产物要对应得上一个提交。带着未提交的改动发布 =
 *      发出去的包不对应任何 commit，用户报的「0.1.50 有问题」没人能 checkout 出来复现。
 *   1. **写身份**（version ← package.json / commit ← git HEAD / date ← 现在 / quality=stable）
 *   2. **发布门禁 ①②③**（scripts/check-publish-gate.mjs）——版本真的往前走了吗 / 两处版本一致吗 /
 *      CHANGELOG 有 `## v{version}` 段吗。没过就停，**不打 tag、不打包**。
 *   3. **打包**（`npm run electron:build`）——里面自带判据④（产物 asar 里真有 product.json）
 *      与安装器文件名门禁，不需要在这里重复。
 *   4. **还原**（finally，无论成败）——逐字节放回写之前的样子。
 *   5. 打印你接下来要敲的两条命令（**本脚本不推、不打 tag**）。
 *
 * 🔴 本脚本**不碰网络、不打 tag、不推送**（推送须用户明确发话，见 memory `push-wait-for-user`）。
 *   tag 由人工打、人工推——推了之后 CI 负责建 Release 并上传安装包。
 *   本脚本只把「该敲哪两条命令」打给你，并**先把版本号算好**，免得手抄错。
 *
 * 用法：
 *   npm run publish              # 完整发布（写→门禁→打包→还原→打印命令）
 *   npm run publish -- --no-build  # 只验「写→门禁→还原」这一段（⚠️ 判据④不跑，会出声）
 * 退出码：全过 = 0；任一红 = 非 0（且保证已还原）。
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PRODUCT = join(ROOT, "electron", "product.json");
const WRITER = join(ROOT, "scripts", "write-product-json.mjs");
const GATE = join(ROOT, "scripts", "check-publish-gate.mjs");

const noBuild = process.argv.includes("--no-build");

function say(line) {
  process.stdout.write(line);
}

/** 跑一个子进程，输出直通终端。返回退出码。 */
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  return r.status ?? 1;
}

// ── 还原：单一实现，走 write-product-json.mjs --restore（它握有写之前的原始字节）──
let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  const code = run(process.execPath, [WRITER, "--restore"]);
  if (code !== 0) {
    process.stderr.write(
      `\n⚠️  自动还原没成功。请手动还原：git checkout -- electron/product.json\n` +
        `    （别手写一份「占位」——占位值不是推导出来的，手抄就又成了第二份真相）\n`
    );
  }
}
// Ctrl+C 也要还原：否则仓库里会留着发布期的版本号
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    process.stderr.write(`\n⚠️  收到 ${sig}，先还原再退出\n`);
    restore();
    process.exit(130);
  });
}

function main() {
  // ── 0. 工作区必须干净（未跟踪文件不管：scratch / 别人并行产出的目录不算「未提交的改动」）──
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  if (dirty !== "") {
    process.stderr.write(
      `\n🔴 工作区有未提交的改动，拒绝发布：\n\n${dirty}\n\n` +
        `    为什么拦：产物必须对应得上一个提交。带着未提交的改动发布 ⇒ 发出去的包不对应任何 commit，\n` +
        `    用户报「这个版本有问题」时没人能 checkout 出来复现。先提交。\n`
    );
    process.exit(1);
  }

  const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  const hadProduct = existsSync(PRODUCT);
  // 兜底：万一 write 那步在备份完成前就炸了，finally 仍能拿内存里的原始字节放回
  const originalBytes = hadProduct ? readFileSync(PRODUCT, "utf8") : null;

  say(`\n📦 发布 ${version}\n${"─".repeat(60)}\n`);

  // ── 1. 写身份 ──
  say("① 写发布身份 → electron/product.json\n");
  if (run(process.execPath, [WRITER]) !== 0) {
    fail(`写 product.json 失败`);
  }
  // 双保险：write 已自带备份；这里再确保 finally 有得可用
  process.on("exit", () => {
    // 退出路径上（含异常逃逸）若还没还原，用内存字节直接放回
    if (!restored && originalBytes !== null) {
      try {
        writeFileSync(PRODUCT, originalBytes);
      } catch {
        /* 退出路径上尽力而为；--restore 仍是正路 */
      }
    }
  });

  // ── 2. 发布门禁 ①②③ ──
  say("\n② 发布门禁\n");
  if (run(process.execPath, [GATE]) !== 0) {
    restore();
    fail(`发布门禁未过——已还原 product.json，**没有打 tag、没有打包**。`);
  }

  // ── 3. 打包（内含判据④ + 安装器文件名门禁）──
  if (noBuild) {
    process.stderr.write(
      "\n⚠️  --no-build：跳过了打包 ⇒ **判据④（产物 asar 里真有 product.json）本次没跑**。\n" +
        "    这个模式只用来验「写→门禁→还原」这一段，**不是一次发布**。\n"
    );
  } else {
    say("\n③ 打包（npm run electron:build；内含判据④与安装器文件名门禁）\n");
    if (run("npm", ["run", "electron:build"]) !== 0) {
      restore();
      fail(`打包失败——已还原 product.json。`);
    }
  }

  // ── 4. 还原 ──
  restore();

  // ── 5. 打印后两步（本脚本不做，也不该做）──
  say(
    `\n${"─".repeat(60)}\n✅ ${version} 已打包完成，本地 product.json 已还原成占位。\n\n` +
      `接下来这两条**你自己敲**（本脚本不推、不打 tag）：\n\n` +
      `    git tag v${version}\n` +
      `    git push origin v${version}\n\n` +
      `推上去之后 CI 会拿这个 tag 建 Release 并上传安装包。\n`
  );
}

function fail(msg) {
  process.stderr.write(`\n🔴 ${msg}\n`);
  process.exit(1);
}

main();
