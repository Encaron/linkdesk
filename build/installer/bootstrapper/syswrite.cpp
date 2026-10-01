// ══════════════════════════════════════════════════════════════════════════
// 件 2b · 系统写入的实现。清单来源与实机照抄依据见 syswrite.h 文件头。
// ══════════════════════════════════════════════════════════════════════════

#include "syswrite.h"

#include <windows.h>
#include <shlobj.h>      // SHGetKnownFolderPath / IShellLinkW / CLSID_ShellLink
#include <shlwapi.h>

#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "uuid.lib")     // CLSID_ShellLink / IID_IShellLinkW 的符号在这

// ── 常量：**与 installer.nsh 的 !define 逐字对应**（改一处必须同笔改另一处）─────────
static const wchar_t* kClasses = L"Software\\Classes";
static const wchar_t* kVendor  = L"Software\\LinkDesk";
static const wchar_t* kProgId  = L"LinkDesk.Document";
static const wchar_t* kMenuKey = L"OpenWithLinkDesk";
static const wchar_t* kCapsPath = L"Software\\LinkDesk\\Capabilities";

/** 产品名 / 可执行名 / 卸载器名。
 *  `kProductName` 与 `kAppExe` 跟着 `electron-builder.yml` 的 `productName: LinkDesk` 走
 *  （实机 ARP 的 `DisplayName` 与 `DisplayIcon` 都用它）。 */
static const wchar_t* kProductName  = L"LinkDesk";
static const wchar_t* kAppExe       = L"LinkDesk.exe";
/** 卸载器 = **本引导器壳自己**在安装时落进 INSTDIR 的那一份（2d 实现；此处只写路径）。 */
static const wchar_t* kUninstallExe = L"linkdesk-setup.exe";

/** ARP 键名 —— `UUID.v5(appId, ELECTRON_BUILDER_NS_UUID)`：
 *    appId = electron-builder.yml 的 `com.linkdesk.app`
 *    ELECTRON_BUILDER_NS_UUID = 50e065bc-3134-11e6-9bab-38c9862bdaf3（NsisTarget.js:28）
 *    复算：node -e "const{UUID}=require('builder-util-runtime');console.log(UUID.v5('com.linkdesk.app',UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')))"
 *  🔴 **必须与旧 NSIS 版算出同一个键**，否则覆盖安装认不出旧装、卸载残留一条死条目。
 *  ⚠️ appId 一旦改动这个常量就失效 —— 3a 的门禁（check-packaging-files 加腿）
 *     应「按 electron-builder.yml 现算 v5 与本常量比对」把它钉死。 */
static const wchar_t* kArpKeyName = L"d7b1f08d-e543-5ebb-a1d6-cfc088dc2c70";
static const wchar_t* kArpKeyPath =
    L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\d7b1f08d-e543-5ebb-a1d6-cfc088dc2c70";

/** 13 个扩展名（#45a 原文清单，顺序与 installer.nsh 一致）。 */
static const wchar_t* kExts[] = {
    L".txt", L".py", L".js", L".json", L".md", L".html", L".css",
    L".ts", L".tsx", L".yaml", L".xml", L".csv", L".log",
};

// ── 注册表小工具 ──────────────────────────────────────────────────────────
static bool SetStr(HKEY root, const std::wstring& sub, const wchar_t* name, const std::wstring& val)
{
    HKEY h = nullptr;
    if (RegCreateKeyExW(root, sub.c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &h, nullptr) != ERROR_SUCCESS)
        return false;
    LSTATUS st = RegSetValueExW(h, name, 0, REG_SZ, (const BYTE*)val.c_str(),
                                (DWORD)((val.size() + 1) * sizeof(wchar_t)));
    RegCloseKey(h);
    return st == ERROR_SUCCESS;
}

/** 同 `SetStr`，但**显式指定类型**——PATH 这类值原样是 `REG_EXPAND_SZ` 时不能降级成 `REG_SZ`。 */
static bool SetStrTyped(HKEY root, const std::wstring& sub, const wchar_t* name,
                        const std::wstring& val, DWORD type)
{
    HKEY h = nullptr;
    if (RegCreateKeyExW(root, sub.c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &h, nullptr) != ERROR_SUCCESS)
        return false;
    LSTATUS st = RegSetValueExW(h, name, 0, type, (const BYTE*)val.c_str(),
                                (DWORD)((val.size() + 1) * sizeof(wchar_t)));
    RegCloseKey(h);
    return st == ERROR_SUCCESS;
}

/** 空值（`WriteRegStr ... "" ""`）——NSIS 写出的就是**零长度 REG_SZ**，
 *  `OpenWithProgids` 下必须长这样，Windows 才认「只是登记了候选程序」。 */
static bool SetStrEmpty(HKEY root, const std::wstring& sub, const wchar_t* name)
{
    HKEY h = nullptr;
    if (RegCreateKeyExW(root, sub.c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &h, nullptr) != ERROR_SUCCESS)
        return false;
    LSTATUS st = RegSetValueExW(h, name, 0, REG_SZ, (const BYTE*)L"", 0);
    RegCloseKey(h);
    return st == ERROR_SUCCESS;
}

static bool SetDword(HKEY root, const std::wstring& sub, const wchar_t* name, DWORD val)
{
    HKEY h = nullptr;
    if (RegCreateKeyExW(root, sub.c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &h, nullptr) != ERROR_SUCCESS)
        return false;
    LSTATUS st = RegSetValueExW(h, name, 0, REG_DWORD, (const BYTE*)&val, sizeof(val));
    RegCloseKey(h);
    return st == ERROR_SUCCESS;
}

/** 读一个字符串值。**先问长度再读**——`HKCU\Environment\Path` 最长可到 32767 字符，
 *  固定缓冲会把它截断，而**截断后再写回去 = 静默毁掉用户的环境变量**。
 *  🔴 这里**刻意不比 NSIS 版做得差**：`ReadRegStr` 只有 1024 字符上限（NSIS 的字符串极限），
 *     照抄那个上限就是照抄一个缺陷（本件「逐 key 照抄」指的是**键与值的语义**，不是它的缓冲区尺寸）。
 *  顺带回一个类型，供 `AddToPath` 原样写回。 */
static std::wstring GetStrTyped(HKEY root, const std::wstring& sub, const wchar_t* name, DWORD* outType)
{
    HKEY h = nullptr;
    if (RegOpenKeyExW(root, sub.c_str(), 0, KEY_READ, &h) != ERROR_SUCCESS) return L"";
    DWORD type = 0, bytes = 0;
    if (RegQueryValueExW(h, name, nullptr, &type, nullptr, &bytes) != ERROR_SUCCESS
        || (type != REG_SZ && type != REG_EXPAND_SZ) || bytes < sizeof(wchar_t)) {
        RegCloseKey(h);
        return L"";
    }
    std::wstring buf(bytes / sizeof(wchar_t) + 1, L'\0');
    DWORD cap = (DWORD)(buf.size() * sizeof(wchar_t));
    LSTATUS st = RegQueryValueExW(h, name, nullptr, &type, (LPBYTE)buf.data(), &cap);
    RegCloseKey(h);
    if (st != ERROR_SUCCESS) return L"";
    buf.resize(wcslen(buf.c_str()));
    if (outType) *outType = type;
    return buf;
}

static std::wstring GetStr(HKEY root, const std::wstring& sub, const wchar_t* name)
{
    return GetStrTyped(root, sub, name, nullptr);
}

// ── 勾选默认值 ＋ 升级反推 ────────────────────────────────────────────────
TaskOptions DefaultTaskOptions()
{
    TaskOptions o;   // 默认：assoc=true, path=true, fileMenu=false, dirMenu=false（同 lkInitTaskDefaults）
    // 升级口径：右键键**已在 ⇒ 保持勾**（尊重用户当初的选择）；静默升级不复活用户取消过的项。
    // 键存在性判据与 installer.nsh 一致：读该键的默认值（我们写的是 "Open with LinkDesk"，非空）。
    if (!GetStr(HKEY_CURRENT_USER, std::wstring(kClasses) + L"\\*\\shell\\" + kMenuKey, L"").empty())
        o.fileMenu = true;
    if (!GetStr(HKEY_CURRENT_USER, std::wstring(kClasses) + L"\\Directory\\shell\\" + kMenuKey, L"").empty())
        o.dirMenu = true;
    return o;
}

// ── 文件类型编辑器注册（ProgId ＋ 13 扩展名 ＋ Capabilities ＋ RegisteredApplications）──
bool WriteAssociations(const std::wstring& installDir)
{
    const std::wstring exe = installDir + L"\\" + kAppExe;
    const std::wstring quoted = L"\"" + exe + L"\"";
    bool ok = true;

    const std::wstring progId = std::wstring(kClasses) + L"\\" + kProgId;
    ok &= SetStr(HKEY_CURRENT_USER, progId, L"", L"LinkDesk Document");
    // ⚠️ 实机读数：DefaultIcon **没有** `,0` 后缀（electron-builder 的 ARP DisplayIcon 才有）
    ok &= SetStr(HKEY_CURRENT_USER, progId + L"\\DefaultIcon", L"", exe);
    ok &= SetStr(HKEY_CURRENT_USER, progId + L"\\shell\\open\\command", L"", quoted + L" \"%1\"");

    for (const wchar_t* ext : kExts) {
        // 只往扩展名键里**加候选程序**，不碰扩展名键本身、不抢默认程序
        ok &= SetStrEmpty(HKEY_CURRENT_USER,
                          std::wstring(kClasses) + L"\\" + ext + L"\\OpenWithProgids", kProgId);
        ok &= SetStr(HKEY_CURRENT_USER,
                     std::wstring(kCapsPath) + L"\\FileAssociations", ext, kProgId);
    }

    ok &= SetStr(HKEY_CURRENT_USER, kCapsPath, L"ApplicationName", kProductName);
    ok &= SetStr(HKEY_CURRENT_USER, kCapsPath, L"ApplicationDescription", L"LinkDesk 通用容器");
    ok &= SetStr(HKEY_CURRENT_USER, L"Software\\RegisteredApplications", kProductName,
                 kCapsPath);
    return ok;
}

// ── 右键三键 ──────────────────────────────────────────────────────────────
/** 一个右键项 = 三项值（默认值文案 / Icon / command）。`arg` 是传进去的参数（"%1" 或 "%V"）。 */
static bool WriteMenuOne(const std::wstring& keySub, const std::wstring& quotedExe, const wchar_t* arg)
{
    bool ok = SetStr(HKEY_CURRENT_USER, keySub, L"", L"Open with LinkDesk");
    ok &= SetStr(HKEY_CURRENT_USER, keySub, L"Icon", quotedExe);
    ok &= SetStr(HKEY_CURRENT_USER, keySub + L"\\command", L"", quotedExe + L" " + arg);
    return ok;
}

bool WriteContextMenus(const std::wstring& installDir, bool fileMenu, bool dirMenu)
{
    const std::wstring quotedExe = L"\"" + installDir + L"\\" + kAppExe + L"\"";
    const std::wstring cls = kClasses;
    bool ok = true;
    if (fileMenu)
        ok &= WriteMenuOne(cls + L"\\*\\shell\\" + kMenuKey, quotedExe, L"\"%1\"");
    if (dirMenu) {
        ok &= WriteMenuOne(cls + L"\\Directory\\shell\\" + kMenuKey, quotedExe, L"\"%1\"");
        // 目录空白处右键——参数是 "%V"（被点的那一层目录本身），不是 "%1"
        ok &= WriteMenuOne(cls + L"\\Directory\\Background\\shell\\" + kMenuKey, quotedExe, L"\"%V\"");
    }
    return ok;
}

// ── PATH（标记 ＋ 备份法）─────────────────────────────────────────────────
bool AddToPath(const std::wstring& installDir)
{
    // 幂等：标记在 ⇒ 不重复追加、不覆盖备份（同 installer.nsh）
    if (!GetStr(HKEY_CURRENT_USER, kVendor, L"PathAdded").empty()) return true;

    DWORD oldType = REG_SZ;
    const std::wstring oldPath = GetStrTyped(HKEY_CURRENT_USER, L"Environment", L"Path", &oldType);
    // ⚠️ **原值是什么类型就写回什么类型**：`REG_EXPAND_SZ` 里存的是没展开的 `%USERPROFILE%…`，
    //    降级成 `REG_SZ` 会让这些变量**永远不再展开**。实机 PATH 就含
    //    `%USERPROFILE%\AppData\Local\Microsoft\WindowsApps` 这类项（2026-10-01 读数）。
    const DWORD newType = oldPath.empty() ? REG_SZ
                                          : (oldType == REG_EXPAND_SZ ? REG_EXPAND_SZ : REG_SZ);
    bool ok = SetStr(HKEY_CURRENT_USER, kVendor, L"PathBackup", oldPath);
    ok &= SetStrTyped(HKEY_CURRENT_USER, L"Environment", L"Path",
                      oldPath.empty() ? installDir : oldPath + L";" + installDir, newType);
    ok &= SetStr(HKEY_CURRENT_USER, kVendor, L"PathAdded", installDir);

    // 通知资源管理器环境变量已变（新开终端生效；**已开**的终端仍需重启）
    // 0xFFFF = HWND_BROADCAST · 0x001A = WM_SETTINGCHANGE · 0x0002 = SMTO_ABORTIFHUNG
    DWORD_PTR unused = 0;
    SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, (LPARAM)L"Environment",
                        SMTO_ABORTIFHUNG, 5000, &unused);
    return ok;
}

// ── ARP 卸载项 ────────────────────────────────────────────────────────────
bool WriteArpEntry(const std::wstring& installDir, const std::wstring& version)
{
    const std::wstring sub = kArpKeyPath;
    const std::wstring uninst = L"\"" + installDir + L"\\" + kUninstallExe + L"\" --uninstall";
    bool ok = true;
    // DisplayName 带版本（实机 = "LinkDesk 0.2.33"）——版本守卫与用户识别都靠它
    ok &= SetStr(HKEY_CURRENT_USER, sub, L"DisplayName", std::wstring(kProductName) + L" " + version);
    ok &= SetStr(HKEY_CURRENT_USER, sub, L"DisplayVersion", version);
    ok &= SetStr(HKEY_CURRENT_USER, sub, L"UninstallString", uninst);
    // 静默卸载变体（electron-builder 同一位置也写一条；「应用和功能」的静默卸载走它）
    ok &= SetStr(HKEY_CURRENT_USER, sub, L"QuietUninstallString", uninst + L" /S");
    ok &= SetStr(HKEY_CURRENT_USER, sub, L"DisplayIcon", installDir + L"\\" + kAppExe + L",0");
    ok &= SetStrEmpty(HKEY_CURRENT_USER, sub, L"Comments");   // 实机是空串，照抄
    // ⚠️ 不写 Publisher —— 实机那条键没有（package.json 无 author，electron-builder 也就没写）。
    //    05 §4.3 的清单里列了 Publisher，但「照抄实机格式」优先于清单的字面列举；
    //    哪天 package.json 补了 author，这一行必须同笔补上。
    ok &= SetDword(HKEY_CURRENT_USER, sub, L"NoModify", 1);
    ok &= SetDword(HKEY_CURRENT_USER, sub, L"NoRepair", 1);
    ok &= SetDword(HKEY_CURRENT_USER, sub, L"EstimatedSize", EstimatedSizeKb(installDir));
    return ok;
}

// ── 快捷方式 ──────────────────────────────────────────────────────────────
static bool MakeLink(const std::wstring& lnk, const std::wstring& target, const std::wstring& workDir,
                     const std::wstring& icon)
{
    IShellLinkW* link = nullptr;
    if (FAILED(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                               IID_PPV_ARGS(&link))))
        return false;
    link->SetPath(target.c_str());
    link->SetWorkingDirectory(workDir.c_str());
    link->SetIconLocation(icon.c_str(), 0);
    IPersistFile* pf = nullptr;
    bool ok = false;
    if (SUCCEEDED(link->QueryInterface(IID_PPV_ARGS(&pf)))) {
        ok = SUCCEEDED(pf->Save(lnk.c_str(), TRUE));
        pf->Release();
    }
    link->Release();
    return ok;
}

/** 已知文件夹路径 —— 🔴 **必须**走这个，不能拼 `%USERPROFILE%\Desktop`：
 *  实机桌面被重定向到 `D:\360MoveData\Users\fengy\Desktop`（2026-10-01 实测），
 *  硬拼的路径会把快捷方式建到一个**用户看不见**的地方（且不报错）。 */
static std::wstring KnownFolder(REFKNOWNFOLDERID id)
{
    PWSTR p = nullptr;
    if (FAILED(SHGetKnownFolderPath(id, 0, nullptr, &p)) || !p) return L"";
    std::wstring out = p;
    CoTaskMemFree(p);
    return out;
}

bool CreateShortcuts(const std::wstring& installDir)
{
    const std::wstring target = installDir + L"\\" + kAppExe;
    const std::wstring icon = target + L",0";
    bool ok = false;

    std::wstring desktop = KnownFolder(FOLDERID_Desktop);
    if (!desktop.empty())
        ok |= MakeLink(desktop + L"\\" + kProductName + L".lnk", target, installDir, icon);

    // 开始菜单：实机是**平铺的一个 .lnk**（不是 LinkDesk 子夹）——照抄
    std::wstring programs = KnownFolder(FOLDERID_Programs);
    if (!programs.empty())
        ok |= MakeLink(programs + L"\\" + kProductName + L".lnk", target, installDir, icon);
    return ok;
}

// ── 读侧 ──────────────────────────────────────────────────────────────────
/** 扫 ARP 找「DisplayName 以 LinkDesk 开头」的那条（⚠️ 实机值 = "LinkDesk 0.2.33"，
 *  **不是**等号——旧代码按等号比对，在真实机器上恒不命中，2026-10-01 修）。 */
static bool FindArpRecord(std::wstring* outSubKey, std::wstring* outDir)
{
    static const wchar_t* kRoots[] = {
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        L"Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    };
    static const HKEY kHives[] = { HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE };
    for (int r = 0; r < 2; ++r) {
        for (int h = 0; h < 2; ++h) {
            HKEY key = nullptr;
            if (RegOpenKeyExW(kHives[h], kRoots[r], 0, KEY_READ, &key) != ERROR_SUCCESS) continue;
            wchar_t sub[256] = {};
            for (DWORD i = 0; RegEnumKeyW(key, i, sub, 256) == ERROR_SUCCESS; ++i) {
                HKEY k = nullptr;
                if (RegOpenKeyExW(key, sub, 0, KEY_READ, &k) != ERROR_SUCCESS) continue;
                wchar_t name[256] = {};
                DWORD ns = sizeof(name);
                bool hit = RegQueryValueExW(k, L"DisplayName", nullptr, nullptr, (LPBYTE)name, &ns)
                               == ERROR_SUCCESS
                           && _wcsnicmp(name, kProductName, 8) == 0
                           && (name[8] == L'\0' || name[8] == L' ');   // "LinkDesk" / "LinkDesk 0.2.33"
                if (!hit) { RegCloseKey(k); continue; }
                // 目录：先 UninstallString（剥引号与开关），退 DisplayIcon（剥 ",0"）
                std::wstring dir;
                wchar_t buf[2048] = {};
                DWORD bs = sizeof(buf);
                if (RegQueryValueExW(k, L"UninstallString", nullptr, nullptr, (LPBYTE)buf, &bs)
                        == ERROR_SUCCESS) {
                    std::wstring u = buf;
                    if (!u.empty() && u[0] == L'"') {
                        size_t q = u.find(L'"', 1);
                        if (q != std::wstring::npos) u = u.substr(1, q - 1);
                    } else {
                        size_t sp = u.find(L' ');
                        if (sp != std::wstring::npos) u = u.substr(0, sp);
                    }
                    size_t cut = u.find_last_of(L"\\/");
                    if (cut != std::wstring::npos) dir = u.substr(0, cut);
                }
                if (dir.empty()) {
                    bs = sizeof(buf);
                    if (RegQueryValueExW(k, L"DisplayIcon", nullptr, nullptr, (LPBYTE)buf, &bs)
                            == ERROR_SUCCESS) {
                        std::wstring d = buf;
                        size_t comma = d.rfind(L',');
                        if (comma != std::wstring::npos) d = d.substr(0, comma);
                        size_t cut = d.find_last_of(L"\\/");
                        if (cut != std::wstring::npos) dir = d.substr(0, cut);
                    }
                }
                RegCloseKey(k);
                RegCloseKey(key);
                if (outSubKey) *outSubKey = sub;
                if (outDir) *outDir = dir;
                return true;
            }
            RegCloseKey(key);
        }
    }
    return false;
}

std::wstring ReadInstalledVersion()
{
    std::wstring sub;
    if (!FindArpRecord(&sub, nullptr)) return L"";
    // 从任一 hive 读（FindArpRecord 不回报是哪个 hive ⇒ 两处都试，取到的那个即答案）
    HKEY hives[] = { HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE };
    for (int i = 0; i < 2; ++i) {
        HKEY h = nullptr;
        const std::wstring path =
            L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + sub;
        if (RegOpenKeyExW(hives[i], path.c_str(), 0, KEY_READ, &h) == ERROR_SUCCESS) {
            wchar_t buf[64] = {};
            DWORD size = sizeof(buf);
            bool ok = RegQueryValueExW(h, L"DisplayVersion", nullptr, nullptr, (LPBYTE)buf, &size)
                          == ERROR_SUCCESS && buf[0];
            RegCloseKey(h);
            if (ok) return buf;
        }
    }
    return L"";
}

std::wstring ReadInstalledDir()
{
    std::wstring dir;
    if (!FindArpRecord(nullptr, &dir)) return L"";
    while (!dir.empty() && (dir.back() == L'\\' || dir.back() == L'/')) dir.pop_back();
    return dir;
}

// ── 体积 ──────────────────────────────────────────────────────────────────
unsigned long long DirBytes(const std::wstring& dir)
{
    unsigned long long total = 0;
    WIN32_FIND_DATAW fd = {};
    HANDLE h = FindFirstFileW((dir + L"\\*").c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) return 0;
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        std::wstring p = dir + L"\\" + fd.cFileName;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) total += DirBytes(p);
        else total += ((unsigned long long)fd.nFileSizeHigh << 32) | fd.nFileSizeLow;
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    return total;
}

DWORD EstimatedSizeKb(const std::wstring& dir)
{
    unsigned long long b = DirBytes(dir);
    if (!b) return 0;
    // 向上取整：宁大不小（「应用和功能」里显示偏小显得像没装全）
    unsigned long long kb = (b + 1023) / 1024;
    return (kb > 0xFFFFFFFFull) ? 0xFFFFFFFFu : (DWORD)kb;
}

// ── 语言持久化（写侧）─────────────────────────────────────────────────────
bool WriteInstallerLanguage(const std::wstring& code)
{
    if (code.empty()) return false;
    return SetStr(HKEY_CURRENT_USER, L"Software\\LinkDesk\\Installer", L"Language", code);
}
