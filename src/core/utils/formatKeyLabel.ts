/**
 * 快捷键标签格式化——**单权威**（04「悬停提示系统」件 1 抽出）。
 *
 * 出处：原为 `src/hooks/usePoolSync/titlebar.ts:35` 的本地私有函数（其注释自称
 * 「壳 MenuRenderer.formatKeyLabel 同款」）。提示条要显示同一份快捷键，若各自抄一份
 * ⇒ **两把尺子必然漂移**（memory `two-rulers-one-caliber`：同一判断实现两遍 = 假红让真红失效）。
 * ⇒ 抽到此处，右键菜单序列化（`titlebar.ts`）与提示条布局快照（`usePoolSync` 命令表）共用。
 * 改一处全跟走——菜单 / 命令面板 / 提示条永远是同一个说法。
 *
 * 输入契约：注册表里的原始串（`"ctrl+k ctrl+t"`——空格分隔 chord、chord 内 `+` 连接、全小写）。
 * 输出：显示用串（`"Ctrl+K Ctrl+T"`）。
 *
 * ⚠️ 已知缺口（**原样搬来的既有行为，本轮不改**）：只归一「`+` 之后的单字母」，**不带修饰键的
 * 单键名原样透传**——`"f5"` ⇒ `"f5"`、`"escape"` ⇒ `"escape"`（VS Code 显示 `F5` / `Escape`）。
 * 要修得配一张键名映射表（F1-F12 / PageUp / Home / Space…）——粗暴首字母大写会造出 `Pageup` 这种新的错。
 * 记在这里免得下次当新发现；本函数是菜单与提示条同吃的单权威，**改它 = 两处一起改**（这正是抽出来的目的）。
 *
 * 🔴 池层⛔ 不得 import 本文件（`src/core/*` 是壳侧模块，池是哑渲染器——见 `AGENTS.md` /
 *    `PoolZoneShell.tsx` 头注释「不 import 任何 @src/core/* 运行时模块」）。
 *    池只吃壳**已格式化**的串；池侧的键帽渲染件是 `src/components/shared/keybinding-hint/`，
 *    它只做「把已格式化的串拆成键帽」，不做格式化。
 */

/** `"ctrl+k ctrl+t"` → `"Ctrl+K Ctrl+T"`（chord 间单空格，chord 内 `+` 连接） */
export function formatKeyLabel(key: string): string {
  return key
    .split(" ")
    .map((chord) =>
      chord
        .replace(/ctrl\+/i, "Ctrl+")
        .replace(/alt\+/i, "Alt+")
        .replace(/shift\+/i, "Shift+")
        .replace(/\+\w/g, (m) => m.toUpperCase())
    )
    .join(" ");
}
