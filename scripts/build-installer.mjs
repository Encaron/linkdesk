/**
 * 件 2a：把「引导器壳 ＋ 载荷」拼成单文件安装包（方案 A）。
 *
 *     [bootstrapper.exe][marker 64B][app-<ver>.7z]
 *
 * 为什么必须拼成一个文件：
 *   - 更新链只认**一个** `.exe` 资产：壳内更新器（`electron/services/update-source.ts` 的
 *     `ASSET_NAME_TEMPLATE`）与文件名门禁（`scripts/assert-installer-name.mjs`）都把
 *     `linkdesk-setup-<ver>.exe` 钉死了。载荷若单放一个 .7z，等于发两个资产、两处真相。
 *   - 双击体验：用户只该看到一个 exe。
 *
 * 为什么 marker 在**载荷之前**（不是末尾）：
 *   7-Zip 找归档是从**文件尾部往前**扫签名的。marker 若放末尾 ⇒ 尾部不再是归档字节，
 *   快路径失效（得先切一段到临时文件再重扫）。放中间 ⇒ 归档仍是文件的最后一段，
 *   `7zr x self.exe` 直接就能解，**不用把 420MB 载荷复制到临时文件**。
 *   实测（2026-10-01）：`7z x setup.exe` 报 `Offset = <壳+64>` / `Physical Size = <7z 长度>`，
 *   与拼合偏移逐字节对上。
 *
 * marker 布局（🔴 与 `build/installer/bootstrapper/main.cpp` 的 `PayloadMark` 是**同一份契约**，
 * 改一边必须同笔改另一边；那边有 `static_assert(sizeof(PayloadMark) == 64)` 守着）：
 *
 *     offset  size  field
 *     0       16    magic = "LKDESK-PAYLOAD-1"（ASCII，无 NUL 填充）
 *     16      8     packed   载荷字节数（= 7z 那一段的长度），小端
 *     24      8     unpacked 解压后字节数，小端（磁盘预检／展示用；0 = 未知）
 *     32      32    version  ASCII 版本号，NUL 补齐
 *
 * ⚠️ 壳里 `FindPayload()` 是**逐候选校验**的（magic ＋ `壳长+64+packed == 文件长` ＋ 紧跟 6 字节
 *    7z 签名 `37 7A BC AF 27 1C`）——因为壳自己的 `.rdata` 里也躺着同一串 magic 字面量。
 *    三个字段任何一个写错，症状都是「双击安装包说自己是开发期裸壳」，而不是报错。
 *
 * 用法：
 *   node scripts/build-installer.mjs                      # 默认：拼 <out>/linkdesk-setup-<ver>.7z
 *   node scripts/build-installer.mjs --payload=a.7z --out=b.exe
 *   node scripts/build-installer.mjs --check <setup.exe>  # 只校验既有产物的 marker 自洽
 */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  closeSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { nestedValue } from "./lib/yaml-lite.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MAGIC = Buffer.from("LKDESK-PAYLOAD-1", "ascii"); // 16 字节，🔴 必须是 16
const MARKER_SIZE = 64;
const SEVEN_Z_SIG = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function fail(msg) {
  process.stderr.write(`🔴 build-installer: ${msg}\n`);
  process.exit(1);
}

/** 按契约拼 64 字节 marker。 */
export function buildMarker({ packed, unpacked, version }) {
  const buf = Buffer.alloc(MARKER_SIZE);
  MAGIC.copy(buf, 0);
  buf.writeBigUInt64LE(BigInt(packed), 16);
  buf.writeBigUInt64LE(BigInt(unpacked), 24);
  const ver = Buffer.from(version, "ascii");
  if (ver.length > 32) fail(`版本号超过 32 字节：${version}`);
  ver.copy(buf, 32);
  return buf;
}

/** 校验整份文件的 marker 是否自洽（与壳里 FindPayload 同一套判据）。 */
export function verifyMarker(fileBuf) {
  const fileSize = fileBuf.length;
  if (fileSize < MARKER_SIZE) return { ok: false, msg: "文件比 marker 还短" };
  // 从尾部往前扫（同壳里策略）。命中后逐项校验，不满足就继续往前找下一个候选。
  for (let at = fileSize - MARKER_SIZE; at >= 0; at -= 1) {
    if (!fileBuf.subarray(at, at + 16).equals(MAGIC)) continue;
    const packed = Number(fileBuf.readBigUInt64LE(at + 16));
    const unpacked = Number(fileBuf.readBigUInt64LE(at + 24));
    if (at + MARKER_SIZE + packed !== fileSize) continue;
    if (!fileBuf.subarray(at + MARKER_SIZE, at + MARKER_SIZE + 6).equals(SEVEN_Z_SIG)) continue;
    const version = fileBuf.subarray(at + 32, at + 64).toString("ascii").replace(/\0+$/, "");
    return {
      ok: true,
      markerAt: at,
      packed,
      unpacked,
      version,
      msg: `marker@${at}（壳 ${at} ＋ marker 64 ＋ 载荷 ${packed} ＝ 文件 ${fileSize}）；版本 ${version}`,
    };
  }
  return { ok: false, msg: `整份文件里找不到自洽的 marker（总长 ${fileSize}）` };
}

/** 数一个目录里所有文件的字节和（= 解压后体积，供 App 侧磁盘预检）。 */
export function dirBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      const p = join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) total += statSync(p).size;
    }
  }
  return total;
}

function main() {
  if (process.argv.includes("--check")) {
    const p = process.argv[process.argv.indexOf("--check") + 1];
    if (!p) fail("--check 要给一个 setup.exe 路径");
    const full = resolve(p);
    const r = verifyMarker(readFileSync(full));
    if (!r.ok) fail(`${full}\n  ${r.msg}`);
    process.stdout.write(`✅ ${full}\n  ${r.msg}\n`);
    return;
  }

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const ver = pkg.version;

  const yml = readFileSync(join(ROOT, "electron-builder.yml"), "utf8");
  const outDir = resolve(ROOT, nestedValue(yml, "directories", "output") ?? "dist");

  const exePath = resolve(
    arg("exe") ?? join(ROOT, "build", "installer", "bootstrapper", "out", "bootstrapper.exe")
  );
  const payloadPath = resolve(arg("payload") ?? join(outDir, `linkdesk-setup-${ver}.7z`));
  const outPath = resolve(arg("out") ?? join(outDir, `linkdesk-setup-${ver}.exe`));
  const unpackedFrom = arg("unpacked-from") ?? join(outDir, "win-unpacked");

  if (!existsSync(exePath)) {
    fail(`引导器壳不存在：${exePath}\n  （先跑 build/installer/bootstrapper/build.cmd）`);
  }
  if (!existsSync(payloadPath)) {
    fail(`载荷不存在：${payloadPath}\n  （electron-builder 出 7z target，或用 --payload= 指定）`);
  }

  // 幂等守卫：输入壳里已带载荷 ⇒ 再拼一次会得到「壳＋旧载荷＋marker＋新载荷」。
  // 壳从尾部往前扫能找到**新** marker（照样能跑），但文件白白多几百 MB，日后排查会看到两个 marker。
  if (verifyMarker(readFileSync(exePath)).ok) {
    fail(`引导器壳里已经带载荷了（${exePath}）——请用干净的壳（重跑 build.cmd）`);
  }

  const payloadSize = statSync(payloadPath).size;
  const head6 = Buffer.alloc(6);
  const fd = openSync(payloadPath, "r");
  readSync(fd, head6, 0, 6, 0);
  closeSync(fd);
  if (!head6.equals(SEVEN_Z_SIG)) {
    fail(`载荷不是 7z 归档（前 6 字节 ${head6.toString("hex")}）：${payloadPath}`);
  }

  const unpacked = existsSync(unpackedFrom) ? dirBytes(unpackedFrom) : 0;
  const marker = buildMarker({ packed: payloadSize, unpacked, version: ver });

  const out = createWriteStream(outPath);
  const pump = (src) =>
    new Promise((res, rej) => {
      const rs = createReadStream(src);
      rs.on("error", rej);
      rs.on("end", res);
      rs.pipe(out, { end: false });
    });

  (async () => {
    await pump(exePath);
    await new Promise((res, rej) => out.write(marker, (e) => (e ? rej(e) : res())));
    await pump(payloadPath);
    await new Promise((res) => out.end(res));

    const total = statSync(outPath).size;
    const r = verifyMarker(readFileSync(outPath));
    if (!r.ok) fail(`拼完自检不过：${r.msg}\n  产物：${outPath}`);
    process.stdout.write(
      `✅ ${outPath}\n` +
        `   壳 ${total - MARKER_SIZE - payloadSize} ＋ marker 64 ＋ 载荷 ${payloadSize} ＝ ${total} 字节\n` +
        `   解压后 ${unpacked} 字节（源 ${unpackedFrom}）\n`
    );
  })().catch((e) => fail(String(e && e.stack ? e.stack : e)));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
