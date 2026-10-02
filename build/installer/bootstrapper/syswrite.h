// ══════════════════════════════════════════════════════════════════════════
// 件 2b · 系统写入（注册表 / 快捷方式 / PATH / ARP）
//
// 【清单从哪来】`build/installer.nsh` 的 `customInstall` **逐 key 照抄**——
//   05-实现交接.md §4.3 的原话是「key 逐条不得增删」。**本文件不自行发明键。**
//   ⚠️ installer.nsh 未退役（2d 实测通过后）之前，**改这里必须同笔改那里**；
//   退役后本文件即成为该清单的唯一真相源。
//
// 【实机照抄依据】2026-10-01 在装了 0.2.33（NSIS 版）的机器上读了一遍现键，
//   本文件的键名/值格式（含引号、`,0` 后缀、空串值、DWORD 类型）全部与读数逐字对齐：
//     · ARP 键 = `HKCU\...\Uninstall\d7b1f08d-e543-5ebb-a1d6-cfc088dc2c70`
//       —— 与 `UUID.v5('com.linkdesk.app', ELECTRON_BUILDER_NS_UUID)` 现算结果一致
//       （NsisTarget.js:157；**同一个 appId ⇒ 同一个键名**，覆盖安装才认得出旧装）
//     · 无 `Publisher`（`package.json` 没声明 author ⇒ electron-builder 也不写）——**不发明**
//     · 无 `InstallLocation`（所以定位安装目录只能靠 UninstallString/DisplayIcon，见 .cpp）
// ══════════════════════════════════════════════════════════════════════════

#ifndef LINKDESK_SYSWRITE_H
#define LINKDESK_SYSWRITE_H

#include <windows.h>   // DWORD（EstimatedSizeKb）——**必须早于本头里用到的任何 WINAPI 类型**
#include <string>

/** 附加任务勾选（E6#45 四项：编辑器注册 · 文件右键 · 目录右键 · PATH） */
struct TaskOptions {
    bool assoc = true;      // 文件类型编辑器注册——默认**勾**
    bool path = true;       // 加到 PATH——默认**勾**
    bool fileMenu = false;  // 文件右键「通过 LinkDesk 打开」——默认**不勾**
    bool dirMenu = false;   // 目录右键——默认**不勾**
};

/** 默认值 ＋ **升级反推**（02 §四：按注册表现状反推首个勾选状态，
 *  静默升级**不得复活**用户当初取消掉的右键项）。 */
TaskOptions DefaultTaskOptions();

// ── 写入块（各自独立返回，便于分段进度与失败定位）──────────────────────────
/** ProgId 三键 ＋ 13 个扩展名 ×2（OpenWithProgids 值 ＋ Capabilities\FileAssociations）
 *  ＋ `Software\LinkDesk\Capabilities` 两值 ＋ `Software\RegisteredApplications` 一值。 */
bool WriteAssociations(const std::wstring& installDir);

/** 右键三键（`*\shell` / `Directory\shell` / `Directory\Background\shell` 的 OpenWithLinkDesk，带 Icon）。
 *  按勾选分别写：fileMenu 管第一个，dirMenu 管后两个。**只加不删**（清理归 2d）。 */
bool WriteContextMenus(const std::wstring& installDir, bool fileMenu, bool dirMenu);

/** PATH 追加（`HKCU\Environment`）——**标记 ＋ 备份**法：首次追加前把原 PATH 存进
 *  `Software\LinkDesk\PathBackup`，并写 `PathAdded` 作标记；已在则幂等跳过。
 *  写后广播 `WM_SETTINGCHANGE("Environment")`（新开终端生效）。 */
bool AddToPath(const std::wstring& installDir);

/** ARP 卸载项（键名见文件头）。EstimatedSize 由 `EstimatedSizeKb()` 算。 */
bool WriteArpEntry(const std::wstring& installDir, const std::wstring& version);

/** 桌面 ＋ 开始菜单快捷方式（electron-builder 的 `createDesktopShortcut` 与
 *  默认的开始菜单项在 nsis 退休后**没人做了 ⇒ 必须自己建**）。
 *  🔴 路径一律走 `SHGetKnownFolderPath`——实机桌面被重定向到 `D:\360MoveData\...`，
 *  写 `%USERPROFILE%\Desktop` 会**静默建到错地方**（实测量到，见 README 坑 11）。
 *  ⚠️ 调用前该线程必须已 `CoInitializeEx`。
 *  **一共两条**（2026-10-03 起；台账 §三 #4 改判）：① 桌面 `LinkDesk.lnk` ② 开始菜单 `LinkDesk.lnk`。
 *  🔴 开始菜单里**只放本体**：0.2.35 曾再建一条「卸载 LinkDesk」（借 app 图标、指向 INSTDIR 里的
 *  卸载器），用户实机读成「开始菜单给我的不是我 LinkDesk 本体，而是一个卸载程序」⇒ **撤掉**。
 *  卸载入口保持两条：`<INSTDIR>\uninstall.exe`（双击即卸载界面）＋ ARP（设置 → 应用）。
 *  存量机器上那条旧卸载项由 `PurgeLegacyUninstallArtifacts` / `DeleteShortcuts` 清掉。
 *  图标一律传**纯路径**（不带 `,0`，§三 #3）。 */
bool CreateShortcuts(const std::wstring& installDir);

// ── 读侧 ──────────────────────────────────────────────────────────────────
/** 已装版本（ARP `DisplayVersion`）；没装返回空。版本守卫（2c）用。 */
std::wstring ReadInstalledVersion();

/** 已装目录：ARP 的 `UninstallString` → 剥引号与开关 → 取 exe 所在目录；
 *  退路 `DisplayIcon`（剥尾部 `,0`）。都拿不到返回空。
 *  ⚠️ **不读 `InstallLocation`**——实机那条键没有这个值（见文件头）。 */
std::wstring ReadInstalledDir();

/** 安装目录的总体积（字节）。EstimatedSize 与卸载屏「占用体积」用。 */
unsigned long long DirBytes(const std::wstring& dir);

/** EstimatedSize 要的是 **KB**（实机 428507 ↔ 428507×1024 ≈ 解压后字节数），
 *  故此处按 1KB = 1024B 折算并**向上取整**（宁大不小，别让「应用和功能」显示偏小）。 */
DWORD EstimatedSizeKb(const std::wstring& dir);

/** 语言持久化（**写侧**；读侧 1c 已通）：`HKCU\Software\LinkDesk\Installer → Language`。 */
bool WriteInstallerLanguage(const std::wstring& code);

// ══ 卸载侧（件 2d）════════════════════════════════════════════════════════
// **逐条照抄 `build/installer.nsh` 的 `customUnInstall`**（key 逐条不得增删；未退役前改这里
// 必须同笔改那里，退役后本文件即唯一真相源）。两处**有意超出** nsh 清单（出处 02 §二幕⑨
// 「反注册：快捷方式 / 右键菜单 / 编辑器注册 / PATH 项 / 安装目录」——nsh 时代这两件由
// electron-builder 代做，T3-b 后没人做了）：
//   · `DeleteShortcuts`（桌面＋开始菜单的启动项 .lnk ×2 ＋ **旧版遗留的开始菜单卸载项**——与 CreateShortcuts 严格互逆）
//   · `DeleteArpEntry`（nsh 的卸载器由 NSIS 生成、自动删自己的 ARP 键；自绘卸载器要自己删）
// 安装目录与 userData 的目录树删除不在此层（归 main.cpp 的工人线程，进度要按文件计数）。

/** 把引导器壳提取成 `<安装目录>\uninstall.exe`（ARP `UninstallString` 指向的那份卸载器；
 *  🔴 名字就叫 `uninstall.exe`，主机侧**双击它即进卸载模式**——见 `UninstallerExeName`）。
 *  🔴 **不是整份自复制**——只写前 `shellBytes` 字节（＝纯壳，不含 7z 载荷）：
 *    ① 体积与 NSIS 的 1MB Uninstall.exe 同量级（整份复制 = INSTDIR 白多 107MB）；
 *    ② 2026-10-02 实测：**360 行为监控会把「安装器 CopyFileW 自己的整份映像」秒删**
 *       （自复制＝蠕虫启发式），中性进程写出的文件没事——改自提取并实测能否过 360，
 *       过不了就得换思路（记录在 06 2d）。
 *  🔴 写临时名 → 核字节数 → 改名就位，失败**重试 3 次**：0.2.35 是单发且失败只写调试输出，
 *  实机出现过「ARP 与开始菜单都指着它、文件却不在」的死链（台账 §三 #6）。
 *  `shellBytes` = 调用方（main.cpp）的 `g_markerAt`（marker 偏移＝纯壳大小）；0 = 无载荷的开发壳
 *  ⇒ 退化成整份复制。`selfPath` = 调用方的 `g_selfPath`。 */
bool InstallUninstallerCopy(const std::wstring& selfPath, const std::wstring& installDir,
                            unsigned long long shellBytes);

/** 卸载器副本的文件名（写侧 `kUninstallExe` 的出口）。main.cpp 靠它判「本进程是不是那份副本」
 *  （双击即卸载模式 / 自删闸）——**这个名字只有这一处真相源**，别在别处再写字面量。 */
const wchar_t* UninstallerExeName();

/** 覆盖安装时清掉 0.2.34/0.2.35 时代的两件残影：
 *  ① `<INSTDIR>\linkdesk-setup.exe`（旧命的卸载器副本；用户读成「装好的软件里塞了个安装器」）
 *     —— 🔴 **只删 ≤8MB 的**：真安装包 106MB，用户万一把它放进安装目录，绝不许误删；
 *  ② 开始菜单 `Uninstall LinkDesk.lnk`（指向 ① 的旧卸载项）。 */
bool PurgeLegacyUninstallArtifacts(const std::wstring& installDir);

/** 右键三键**整树删**（`*\shell` / `Directory\shell` / `Directory\Background\shell` 的
 *  OpenWithLinkDesk）——与安装时勾没勾无关，清理要彻底（不存在则无害）。 */
bool DeleteContextMenus();

/** 文件关联反注册：13 个扩展名 × `OpenWithProgids` 值删 ＋ `Capabilities\FileAssociations` 值删
 *  （🔴 **不动扩展名键本身**——那不是我们建的）＋ ProgId / Capabilities 键删 ＋
 *  `Software\RegisteredApplications` 值删。 */
bool DeleteAssociations();

/** PATH 恢复——**精确匹配才恢复备份**（宁可不删，不许误伤用户改过的 PATH）。
 *  两种可判定情形：current == 备份（我们那段已被去掉）／current == 备份;安装目录。
 *  其余一律**不动**。`*touched` = 是否真写了 PATH（真写时本函数自己广播 WM_SETTINGCHANGE）。
 *  无论动没动 PATH，`PathBackup`/`PathAdded` 两个标记值都会删掉（同 nsh）。 */
bool RestorePath(bool* touched);

/** 桌面 ＋ 开始菜单快捷方式删除：`LinkDesk.lnk` ×2 ＋ **旧开始菜单卸载项**
 *  （`Uninstall LinkDesk.lnk`——0.2.35 及更早建的；本版不再创建，但存量机器上有）。不存在则无害。
 *  🔴 那条旧卸载项**漏删比不建更糟**：会留下一条指向已消失程序、已消失 exe 的死「卸载」入口。 */
bool DeleteShortcuts();

/** ARP 卸载项整键删（键名 = 写侧同一条 v5 UUID）。 */
bool DeleteArpEntry();

/** userData 目录 = `%APPDATA%\linkdesk`（🔴 **小写**——Electron 的 userData 取 package.json 的
 *  `name`（`linkdesk`），不是 `productName`（`LinkDesk`）；实机目录读数就是小写，06 补记⑥）。
 *  「保留我的数据」没勾时整目录删（删不删由调用方决定，本函数只给路径）。 */
std::wstring UserDataDir();

/** 目录像不像「装好的安装目录」——判据与安装侧 `VerifyInstall` 同一条：里面有 `LinkDesk.exe`。
 *  🔴 卸载工人（main.cpp）拿它做**目标体检**：开发壳的 `out\`（只有 bootstrapper.exe）、
 *  用户下载夹里的裸 setup.exe 都**没有**它 ⇒ 通过不了这道闸，一个文件、一条注册表都不许碰
 *  ——否则从错误目录跑一次 `--uninstall` 就把那个目录（或真 userData）删了。 */
bool DirLooksInstalled(const std::wstring& dir);

#endif  // LINKDESK_SYSWRITE_H
