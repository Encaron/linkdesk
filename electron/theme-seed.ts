/**
 * 窗背景色 seed——04「启动过场」④A（2026-09-27）。
 *
 * E3f #51「防启动白屏」的目标不变（不白屏），换手段：OS 层背景从写死暗色改为**按持久化主题 seed**
 * ——主进程启动时同步读 userData/settings.json 的 `app.theme`（扁平键，~1KB readFileSync），
 * light → 亮底，其余（dark/自定义）→ 暗底。自定义主题的精确底色只有权威管线知道（主题是插件贡献的），
 * OS 层只分暗/亮两档——误差由壳首帧的 CSS 变量快照（④A 内联脚本）补齐。
 * 读不到 / 坏 JSON → 暗底 = 现状兜底，静默（try/catch 包死，绝不因 seed 挂掉启动）。
 */
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

/** 亮色底——与 window-manager.ts 现行 nativeTheme 亮色值一致 */
// eslint-disable-next-line linkdesk/no-hardcoded-hex -- OS 层窗背景（渲染进程 CSS 变量不可达），E3f #51 防白屏 + 04 主题 seed
const LIGHT_BG = "#f5f5f5";
/** 暗色底——E3f #51 现行值，缺省兜底 */
// eslint-disable-next-line linkdesk/no-hardcoded-hex -- 同上
const DARK_BG = "#1e1e1e";

/** 读 settings.json（扁平键）取 app.theme → 亮/暗底色。任何异常 = 暗底（现状） */
export function seedBackgroundColor(): string {
  try {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    const raw = fs.readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    if (settings["app.theme"] === "light") return LIGHT_BG;
  } catch {
    /* 读不到 = 暗底兜底（现状），静默 */
  }
  return DARK_BG;
}
