/**
 * YAML 极简读取器——**只服务于「读本仓自己的 electron-builder.yml」这一件事**，不是通用 YAML 解析器。
 *
 * 为什么手写而不是引 yaml 库：
 *   本仓 devDependencies 里没有 yaml。electron-builder 自带的 `js-yaml` 是**传递依赖**，
 *   直接 import 它就是 memory [[phantom-transitive-browser-polyfill]]（E6#16）记的那类「隐形传递垫片」——
 *   哪天上游换实现，本仓门禁当场崩，而且崩在别人的依赖树上。
 *   本文件只支持本仓实际用到的三种形状：**零缩进标量 / 一层嵌套标量 / 块状列表**。
 *
 * 🔴 抽取失败一律返回 null（块状列表例外：键在但一条都没抽到返回 []），
 *    **由调用方决定是红是黄**——本文件不吞错、也不自作主张。
 *    门禁侧铁律（memory `e6-gate-philosophy-three-tier`）：抽取失败必须**显式出声**，
 *    不能静默跳过——静默跳过 = 灯不亮，而「这不是红灯」和「这条根本没在查」从外面看一模一样。
 *
 * 消费方（两处，都是门禁脚本）：
 *   - scripts/assert-installer-name.mjs（E6#42e 安装器文件名）
 *   - scripts/check-packaging-files.mjs（E6#57.15a① product.json 随包进 asar）
 */

/** 去引号 + 去行尾注释。`#` 前有空白才算注释，免得砍到值里自带的 `#`。 */
// 不导出：本文件三个读取器共用它，外部无消费方（knip 会判「导出未用」）。
function stripValue(v) {
  let s = v.trim();
  const hash = s.indexOf(" #");
  if (hash >= 0) s = s.slice(0, hash).trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1);
  }
  return s;
}

/** 取 YAML 顶层键的值（零缩进的 `key:`）。找不到 → null。 */
export function topLevelValue(yamlText, key) {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`);
  for (const raw of yamlText.split(/\r?\n/)) {
    if (/^[ \t]/.test(raw) || raw.trimStart().startsWith("#")) continue;
    const m = re.exec(raw);
    if (!m) continue;
    return stripValue(m[1]);
  }
  return null;
}

/** 取 `parent:` 块内某个子键的值（靠缩进判定块的范围）。找不到 → null。 */
export function nestedValue(yamlText, parent, key) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${parent}:[ \\t]*$`).test(l));
  if (start < 0) return null;
  const re = new RegExp(`^[ \\t]+${key}:[ \\t]*(.*)$`);
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^[ \t]/.test(line)) return null; // 缩进结束 = 块结束
    const m = re.exec(line);
    if (m) return stripValue(m[1]);
  }
  return null;
}

/**
 * 取块状列表（`files:` 下面那一串 `- xxx`）。
 *   - 键不存在 → **null**（调用方该判红：配置结构变了，解析器不认了）
 *   - 键在、但一条都没抽到 → **[]**（调用方可与 null 分开处理，但同样别静默放行）
 * 块内的注释行和空行跳过；遇到缩进归零的非空行即块结束。
 */
export function blockList(yamlText, key) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${key}:[ \\t]*(#.*)?$`).test(l));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^[ \t]/.test(line)) break; // 缩进结束 = 块结束
    const m = /^[ \t]*-[ \t]+(.*)$/.exec(line);
    if (m) out.push(stripValue(m[1]));
  }
  return out;
}
