/**
 * 出厂种子 zip 的**内容指纹**——全仓唯一实现（E6#101，L7 第 7.4 轮抽出）。
 *
 * 为什么要抽出来（不是重构洁癖）：指纹的消费者现在有两个，而且是**必须互相咬合**的两个——
 *   ① `check-bundled-version-bump.mjs`：管「改了内容没 bump 插件版本」（内容纪律）；
 *   ② `sync:bundled` / `check-bundled-freshness`：管「箱子里这颗种子是不是各插件仓的已发布版」（新鲜度）。
 * 两条门禁比的是同一个东西。**同一件事写两遍，两份实现必然漂移**，然后会出现
 * 「A 说一致、B 说不一致」——门禁之间互相打架比没有门禁更糟（假红让真红失效）。
 * 故抽到本模块，双方 import 同一份。
 *
 * 指纹定义（照抄 `check-bundled-version-bump.mjs` 的原实现，一个字节都没改语义）：
 *   - 遍历 zip 内**非目录**条目；条目内容先过 `normalizeEol`（CRLF→LF，二进制与无 CRLF 文本逐字节不动）；
 *   - 每行 `<规范化名>:<sha256(归一后内容)>`，**排序后换行拼接**成整串。
 *   ⇒ **只比包内容，不比 zip 字节**：重建产生的时间戳/压缩级别差异不误报；
 *     而行尾（两边工作区来源不同、谁都不受控）已被归一，**行尾不是内容**——
 *     这条是 2026-09-12 修的（同族第 5 次假红），详见 `check-bundled-version-bump.mjs` 文件头 🔴 段。
 *
 * ⚠️ 指纹含 `plugin.json` 自身 ⇒ 仅版本号变、指纹也变。这是**有意的**：
 *   版本 bump 是「内容变更」的合法声明，指纹变了只说明包内容确实动了；
 *   `check-bundled-version-bump` 的判定顺序是先看 version 再看指纹，故 bump 过即放行。
 */

import { createHash } from "node:crypto";
import { normalizeEol } from "./text-eol.mjs";

/** sha256——内容指纹的单元运算（本模块内部用；导出它会变成没人 import 的悬挂面） */
function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * zip 内**顶层** `plugin.json` 的 `version`。
 * 容忍单层 wrapper 目录（与 `electron/plugins/bundle-zip.ts` 的 `locateManifest` 同规：
 * 按路径段数排序取最浅的那个）；取不到 / 解析失败 → `null`（调用方决定怎么处置）。
 * @param {import("jszip")} zip 已 loadAsync 的 zip 实例
 */
export async function readZipVersion(zip) {
  const norm = Object.keys(zip.files)
    .map((n) => n.replace(/\\/g, "/"))
    .filter((n) => n.slice(n.lastIndexOf("/") + 1) === "plugin.json")
    .sort((a, b) => a.split("/").length - b.split("/").length);
  if (norm.length === 0) return null;
  try {
    const parsed = JSON.parse(await zip.files[norm[0]].async("string"));
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

/** 内容指纹串（定义见文件头）；`zip` 为已 loadAsync 的实例 */
export async function fingerprintZip(zip) {
  const rows = [];
  for (const raw of Object.keys(zip.files)) {
    const entry = zip.files[raw];
    if (entry.dir) continue;
    const name = raw.replace(/\\/g, "/");
    const { buf } = normalizeEol(Buffer.from(await entry.async("uint8array")));
    rows.push(`${name}:${sha256(buf)}`);
  }
  return rows.sort().join("\n");
}
