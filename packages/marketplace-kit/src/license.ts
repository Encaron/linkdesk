/**
 * keygen / sign-license——作者许可签发（K12；正典 09 §三·补3）。
 *
 * 🔴 密钥格式契约的唯一真相源 = 壳 `electron/services/license-verify-service.ts` 头注（棒 2 落）：
 *
 *     v1.<base64url(payload JSON)>.<base64url(64 字节 Ed25519 签名)>
 *
 *   - payload = { pluginId, machine?, exp?(unix 秒) }；多余字段无（kit 只产这三键）；
 *   - 签名覆盖 = payload JSON 的 UTF-8 字节（"v1." 前缀不参与签名）；
 *   - base64url = RFC 4648 §5（无 padding——Buffer.toString("base64url") 即此形态）。
 *   - 公钥 = **裸 32 字节 base64（标准字母表）**（kit 默认导出形状；壳同时认 44 字节 SPKI DER）。
 *
 * 私钥落盘：PKCS8 DER base64 单行，文件 0600（Windows 上 chmod 是尽力而为，README 提醒）。
 * ⛔ 真私钥不进仓（硬约束 21）：本包测试一律现场 generateKeyPairSync 造一次性测试密钥对。
 */

import { createPrivateKey, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { LicenseKeyPayload } from "./types.js";

export interface KeygenOptions {
  /** 私钥落盘路径（缺省 = <authorId>.private.key，当前目录） */
  out?: string;
  /** 作者 id（推荐 GitHub 用户名）——只用于缺省文件名与提示 */
  authorId?: string;
}

export interface KeygenResult {
  privateKeyPath: string;
  /** 裸 32 字节 Ed25519 公钥（标准 base64）——粘进 authors/<id>.json 的 publicKey 字段 */
  publicKey: string;
}

/** Ed25519 SPKI 固定前缀（RFC 8410）——与壳 license-verify-service.ts 同一常量 */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function keygen(opts: KeygenOptions = {}): KeygenResult {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const privDer = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  const pubRaw = (publicKey.export({ type: "spki", format: "der" }) as Buffer).subarray(ED25519_SPKI_PREFIX.length);
  if (pubRaw.length !== 32) throw new Error(`公钥导出异常：期望 32 字节裸公钥，实得 ${pubRaw.length}`);
  const outPath = resolve(opts.out ?? `${opts.authorId ?? "author"}.private.key`);
  mkdirSync(dirname(outPath), { recursive: true });
  // 0600：仅属主可读（Windows 文件系统尽力而为；README 提醒别提交进仓）
  writeFileSync(outPath, privDer.toString("base64") + "\n", { mode: 0o600 });
  return { privateKeyPath: outPath, publicKey: pubRaw.toString("base64") };
}

/** 从私钥文件读回 KeyObject（PKCS8 DER base64 单行——keygen 的落盘形态） */
function loadPrivateKey(keyFile: string) {
  const text = readFileSync(keyFile, "utf8").trim();
  const der = Buffer.from(text, "base64");
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

/**
 * --exp 解析（作者零密码学知识）：`2027-12-31`（UTC 当日 23:59:59.999 到期）· 完整 ISO 时刻原样 ·
 * `Nd`/`Nw`/`Nm`/`Ny`（自 now 起的天/周/月/年）。返回 unix 秒。
 */
export function parseExpSpec(spec: string, nowMs: number = Date.now()): number {
  const s = spec.trim();
  const dur = /^(\d+)([dwmy])$/i.exec(s.replace(/\s+/g, ""));
  if (dur) {
    const n = Number(dur[1]);
    const unit = dur[2]!.toLowerCase();
    const ms = unit === "d" ? n * 86_400_000 : unit === "w" ? n * 7 * 86_400_000 : unit === "m" ? n * 2_629_800_000 : n * 31_557_600_000;
    return Math.floor((nowMs + ms) / 1000);
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new Error(`--exp 无法解析："${spec}"（可用：YYYY-MM-DD / 完整 ISO 时刻 / Nd·Nw·Nm·Ny）`);
  // 纯日期（无时刻成分）按「当日末」到期——作者写 2027-12-31 的直觉是「用到年底」
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Math.floor((t + 86_400_000 - 1) / 1000);
  return Math.floor(t / 1000);
}

export interface SignOptions {
  keyFile: string;
  pluginId: string;
  /** 机器指纹（env.machineFingerprint）——给了就一机一码 */
  machine?: string;
  /** 到期：YYYY-MM-DD / ISO 时刻 / Nd·Nw·Nm·Ny */
  exp?: string;
}

export interface SignResult {
  key: string;
  payload: LicenseKeyPayload;
}

export function signLicense(opts: SignOptions, nowMs: number = Date.now()): SignResult {
  if (!opts.pluginId?.trim()) throw new Error("--plugin 必填（许可绑定到哪个插件 id）");
  const payload: LicenseKeyPayload = { pluginId: opts.pluginId.trim() };
  if (opts.machine?.trim()) payload.machine = opts.machine.trim();
  if (opts.exp?.trim()) payload.exp = parseExpSpec(opts.exp, nowMs);
  const payloadBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = cryptoSign(null, payloadBuf, loadPrivateKey(opts.keyFile));
  // base64url 无 padding（RFC 4648 §5）——壳解码对缺 padding 容忍，统一不发 padding
  const key = `v1.${payloadBuf.toString("base64url")}.${sig.toString("base64url")}`;
  return { key, payload };
}
