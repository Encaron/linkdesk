/**
 * 宿主存储键 → 落盘文件名 —— **唯一映射源**（2026-11-24 从 StorageService 抽出）。
 *
 * 为什么单独成文件：宿主设置文件的文件名过去散在渲染侧 StorageService 与主进程多处字面量
 * （theme-seed / registry-handlers / storage-handlers / main）里。语义归属律要求「文件落盘布局」
 * 只有一处真源：渲染侧（`StorageService`）与主进程（`storage.getFilePath`）都 import 本文件，
 * ⛔ 插件不再拼 `appDataDir + "settings.json"`（设置插件 V6 / 门禁 K10）。
 *
 * 纯函数零副作用：只做键→名映射与 Windows 非法字符净化，不碰 window/fs/Electron。
 */

/**
 * key → 文件名（纯函数，可单测）。已知键走映射；其余 `${key}.json`。
 * 🔴 04「冒号文件名 ADS」（2026-09-27）：E6#47c 的按窗键 `layout:ws-1` 拼出 `layout:ws-1.json`
 * ——冒号在 Windows 文件名里非法，写入实际打进 NTFS 备用数据流（ADS：0 字节基文件 `layout`
 * ＋ 隐形流），「文件 = 真相」对布局类静默失效。统一把非法字符净化成 `-`（`layout-ws-1.json`）；
 * 旧 ADS 数据由 `read()` 的一次性迁移接住（见 StorageService `_legacyFilePath`）。
 */
export function storageFilename(key: string): string {
  const map: Record<string, string> = {
    "settings": "settings.json",
    "layout": "layout.json",
    "plugin-states": "plugin-states.json",
    "prefs": "prefs.json",
  };
  const filename = map[key] ?? `${key}.json`;
  // Windows 非法文件名字符（\ / : * ? " < > |）→ "-"；净化只影响映射外的动态键（已知键全合法）
  return filename.replace(/[\\/:*?"<>|]/g, "-");
}
