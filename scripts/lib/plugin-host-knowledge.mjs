/**
 * 插件宿主知识判据（K1–K10）—— `scripts/check-plugin-host-knowledge.mjs` 与
 * `scripts/test-replaceability.mjs` 共用的**唯一实现**（⛔ 两份尺子必然漂移）。
 *
 * 输入 = 已剥注释源码（`gate-scan.readStripped`）；输出 = `{rule, file, line, excerpt}[]`。
 * 判据正文见 `docs/04-软件更新/已落地/插件语义归属-设置与生态/03-门禁与验收/01-机械门禁.md`。
 */

export const RULES = {
  K1: "插件不得拼宿主路径（appDataDir / userData / %APPDATA%）",
  K2: "插件不得持有宿主域字符串（defaultPathKind）",
  K3: "设置插件不得特判宿主配置键（app.* 字面量）",
  K4: "插件不得直调系统能力（shell.openPath / dialog.showOpenDialog / child_process）",
  K5: "新宿主动作必须有 description / params",
  K6: "共享件不得反向持有宿主知识",
  K7: "插件不得重复实现路径工具（basename/dirname/extname/joinPath 本地实现）",
  K8: "插件不得跨命名空间读宿主 pluginState",
  K9: "插件不得自拼资产协议 URL（linkdesk://${…}）",
  K10: "插件不得自认宿主落盘文件名（settings.json / plugin.json）",
};

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

function excerptAt(src, index) {
  const start = src.lastIndexOf("\n", index) + 1;
  const end = src.indexOf("\n", index);
  return src.slice(start, end < 0 ? src.length : end).trim().slice(0, 160);
}

function pushAll(out, rule, src, re) {
  re.lastIndex = 0;
  for (const m of src.matchAll(re)) {
    out.push({ rule, line: lineOf(src, m.index ?? 0), excerpt: excerptAt(src, m.index ?? 0) });
  }
}

/**
 * 单文件扫描（纯函数）。
 * @param {string} src 已剥注释源码
 * @param {{repo: string, file: string, official: boolean}} meta
 */
export function scanPluginSource(src, meta) {
  const out = [];
  const isSettings = meta.repo === "settings";
  const file = meta.file;

  // K1 宿主路径——pluginDataDir/pluginCacheDir 是插件自有面，⛔ 不在此列
  pushAll(out, "K1", src, /\b(?:appDataDir|APPDATA|AppData[\\/]Roaming|userData)\b/g);
  // K2 域字符串令牌
  pushAll(out, "K2", src, /\bdefaultPathKind\b/g);
  // K3 设置插件不得特判宿主配置键（app.* 字面量）
  if (isSettings) pushAll(out, "K3", src, /["']app\.[\w.-]+["']/g);
  // K4 系统调用
  pushAll(out, "K4", src, /\b(?:shell\s*\.\s*openPath|dialog\s*\.\s*showOpenDialog|child_process|node:child_process)\b/g);
  // K7 本地路径工具实现——`hostPath.ts` 是唯一准许的转入口（函数体只有一次宿主调用）
  if (!/[\\/]hostPath\.ts$/.test(file)) {
    pushAll(out, "K7", src, /\b(?:function|const|let|var)\s+(?:basename|dirname|extname|joinPath)\b/g);
  }
  // K8 跨属主读 pluginState
  pushAll(out, "K8", src, /\bpluginState\s*\??\.\s*(?:get|onChange)\s*\(\s*["']app["']/g);
  // K9 自拼资产协议 URL（只抓插值模板——静态自有资产常量不算「构造」）
  pushAll(out, "K9", src, /`linkdesk:\/\/\$\{/g);
  // K10 宿主落盘文件名——只判**本地落盘/读取上下文**（join/readTextFile/...）；
  // 远程目录清单的 `plugin.json`（市场自己的目录格式）不是宿主落盘知识，⛔ 不判。
  for (const m of src.matchAll(/["'](?:settings|plugin)\.json["']/g)) {
    const idx = m.index ?? 0;
    const line = excerptAt(src, idx);
    if (!/\b(?:join|readTextFile|readBinaryFile|writeTextFile|writeBinaryFile|exists|stat|resolvePath|listDir)\s*\(|\\\\/.test(line)) continue;
    out.push({ rule: "K10", line: lineOf(src, idx), excerpt: line });
  }

  return out.map((v) => ({ ...v, file }));
}

/** 共享件（K6）——判定层知识写进表现层。
 *  例外：`asset-url/pluginAssetPath.ts` 是「协议形状」的**唯一实现**（core 反向 re-export 共用），
 *  它本身就是这一条规则的落点，⛔ 不判它（别的地方仍照红）。 */
const CANONICAL_ASSET_URL = /[\\/]asset-url[\\/]pluginAssetPath\.ts$/;

export function scanSharedSource(src, file) {
  const out = [];
  if (!/[\\/]hostPath\.ts$/.test(file)) {
    pushAll(out, "K6", src, /\b(?:appDataDir|userData|defaultPathKind)\b/g);
  }
  if (!CANONICAL_ASSET_URL.test(file)) {
    pushAll(out, "K6", src, /`linkdesk:\/\/\$\{/g);
  }
  return out.map((v) => ({ ...v, file }));
}

/** K5：壳新宿主动作（本档新增的一条）必须有 description/params 与 title */
export function scanShellActionMetadata(src, file) {
  const out = [];
  for (const m of src.matchAll(/id:\s*["']appearance\.pickImage["']/g)) {
    const start = m.index ?? 0;
    const windowSrc = src.slice(start, start + 1200);
    if (!/\btitle:\s*/.test(windowSrc) || !/\bdescription:\s*/.test(windowSrc) || !/\bparams:\s*\[/.test(windowSrc)) {
      out.push({ rule: "K5", file, line: lineOf(src, start), excerpt: "appearance.pickImage 缺 title/description/params" });
    }
  }
  return out;
}
