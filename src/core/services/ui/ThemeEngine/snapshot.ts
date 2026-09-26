/**
 * 主题快照——04「启动过场」④A（2026-09-27）。
 *
 * **镜像，不是第二真相源**：真相源 = theme-defaults 贡献 + app.theme 配置（ConfigurationService
 * + ThemeEngine 权威管线）。本模块只做「存上次权威应用的完整结果、开机第一帧原样铺回去」——
 * 校验/迁移/合成等一切主题逻辑都**不许**加在这里（01-设计 §九 2）。
 *
 * 写侧（唯一）：tokens.ts 权威应用完成后写。读侧：index.html / pool.html 的内联脚本
 * （public/boot-theme-snapshot.js，两页同一份文件）在首次绘制之前同步读回。
 * 快照坏 / 版本不符 / 关键键缺失 → 读侧返回 null，一切按现状走：不重试、不写默认值、不刷日志。
 */

const SNAPSHOT_KEY = "ldk.theme.snapshot.v1";
const SNAPSHOT_VERSION = 1;
/** 关键键——缺失 = 快照不完整（校验失败走现状兜底） */
const REQUIRED_KEYS = ["--bg-window", "--text-primary"] as const;

export interface ThemeSnapshot {
  v: number;
  type: string;
  vars: Record<string, string>;
}

/** 权威主题应用完成后调用——每次覆盖写（同值幂等）。非浏览器环境（单测/SSR）静默跳过 */
export function writeThemeSnapshot(themeType: string, vars: Record<string, string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    // 调用方（tokens.ts）的 variables 键不带 `--` 前缀（setProperty 时才拼）——快照统一存**成品变量名**
    const prefixed: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars)) prefixed[k.startsWith("--") ? k : `--${k}`] = v;
    const snapshot: ThemeSnapshot = { v: SNAPSHOT_VERSION, type: themeType, vars: prefixed };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch { /* 配额/隐私模式——快照缺失 = 现状兜底 */ }
}

/** 校验——v 版本、type 非空、vars 为对象且含关键键。纯函数可单测 */
export function validateThemeSnapshot(raw: string | null): ThemeSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as ThemeSnapshot;
    if (!s || s.v !== SNAPSHOT_VERSION) return null;
    if (typeof s.type !== "string" || !s.type) return null;
    if (typeof s.vars !== "object" || s.vars === null) return null;
    for (const key of REQUIRED_KEYS) {
      if (typeof s.vars[key] !== "string" || !s.vars[key]) return null;
    }
    return s;
  } catch {
    return null;
  }
}
