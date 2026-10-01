// LinkDesk Installer Bootstrapper — 件 1a 引导器壳（件 1c：i18n 目录枚举与上次语言带出）
// 规格：docs/04-软件更新/待抉择池/安装界面自绘/05-实现交接.md §4.2、§3.4
// C++ Win32 + WebView2：无边框窗（安装 780×570 ／卸载 720×540 逻辑像素）、Per-Monitor V2、
// VirtualHostMapping 加载 app.html、--debug 开 DevTools。UI 全部在 app.html/css/js（本文件只做窗口与宿主）。
// i18n：清单 = 扫 exe 旁 i18n/ 目录经 ?langs= 注入；上次选择 = 读 HKCU（写侧归件 2b）。
//
// 构建：build.cmd（vswhere → vcvars64 → rc → cl），产出 out\bootstrapper.exe

#include <windows.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <shobjidl.h>   // 件 2b：IFileOpenDialog（browse-dir 目录对话框）
#include <objidl.h>
#include <string>
#include <vector>
#include <algorithm>
#include <functional>
#include <atomic>
#include <thread>
#include <wrl/client.h>
#include <wrl/event.h>

#include "WebView2.h"
#include "WebView2EnvironmentOptions.h"

// 件 2b：系统写入（注册表 / 快捷方式 / PATH / ARP）——清单逐 key 照抄 build/installer.nsh
#include "syswrite.h"

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "advapi32.lib")

// ── 设计常量（05 §3.1：安装窗 780×570 逻辑像素；件 1d：卸载窗 720×540）────
static int kWinW = 780, kWinH = 570;
static bool g_uninstall = false;             // --uninstall：自绘卸载器模式（页面拿到 ?mode=uninstall）
static const wchar_t kVHost[] = L"installer.local";   // → exe 所在目录
static const wchar_t kStartUrl[] = L"https://installer.local/app.html";

static HWND g_hwnd = nullptr;
// 🔴 必须全局持有：控制器一旦释放，WebView2 连同浏览器实例即被销毁（导航事件永不触发）
static Microsoft::WRL::ComPtr<ICoreWebView2Controller> g_controller;
static bool g_debug = false;
// --capture=<path>：页面渲染完成后 CapturePreview 存 PNG 并退出
// （件 1b「mockup vs 实机并排」逐屏对照的取图口；产品运行不用此参数）
static std::wstring g_capturePath;
// --preview=<query>：给起始 URL 挂查询串，如 --preview="screen=progress&pct=42&seed=1&dust=0"
// （件 1b/3c 逐屏取图与状态定格；产品运行不带）
static std::wstring g_previewQuery;
// --log=<path>：把宿主 → 页面的每条消息追加落盘（件 3c 自动化要「进度单调」的可读证据）
static std::wstring g_logPath;
// --capture 落图的延时定时器（件 1c 起 i18n 是异步 fetch：导航完成 ≠ 画面落定）
static const UINT_PTR kCaptureTimer = 1;
static const UINT kCaptureDelayMs = 1200;   // i18n fetch ＋ enter 入场动效 .8s 都在这之前落定

static void DoCapture();   // 定义在 ExeDir() 之后（WndProc 的 WM_TIMER 要用）

// 件 2a：工人线程 → UI 线程的自定义消息（WndProc 收，转成 postMessage 发进页面）
static const UINT WM_LK_PROGRESS = WM_APP + 1;   // wParam = 0–100
static const UINT WM_LK_FAILED   = WM_APP + 2;   // 取 g_lastErrCode / g_lastErrMsg
static const UINT WM_LK_CANCELED = WM_APP + 3;
static const UINT WM_LK_DONE     = WM_APP + 4;
static std::wstring g_lastErrCode, g_lastErrMsg;
static void StartInstall(const std::wstring& requestedDir, const TaskOptions& opts);   // 定义在 2a 段
static void CancelInstall();
static void PostJson(const std::wstring& json);               // 定义在 2a 段（宿主 → 页面）
static std::wstring JsonEsc(const std::wstring& s);           // 定义在 2a 段（WndProc 要用）

// ── COM 回调（手写引用计数，Invoke 转发 lambda）───────────────────────────
// 无参数完成回调（CapturePreview 等只回 HRESULT 的 handler）
template <typename Interface>
struct ComHandlerV : Interface {
    std::function<HRESULT(HRESULT)> fn;
    std::atomic<ULONG> refs{1};
    IID iid;
    ComHandlerV(REFIID id, decltype(fn) f) : iid(id), fn(std::move(f)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** out) override {
        if (!out) return E_POINTER;
        if (riid == iid || riid == IID_IUnknown) { *out = static_cast<Interface*>(this); }
        else { *out = nullptr; return E_NOINTERFACE; }
        AddRef(); return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++refs; }
    ULONG STDMETHODCALLTYPE Release() override {
        ULONG r = --refs;
        if (!r) delete this;
        return r;
    }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result) override { return fn(result); }
};

// 带参完成回调：ArgT = Invoke 第二参数的完整类型（含指针），与 MIDL 生成签名逐字对齐
template <typename Interface, typename ArgT>
struct ComHandler : Interface {
    std::function<HRESULT(HRESULT, ArgT)> fn;
    std::atomic<ULONG> refs{1};
    IID iid;
    ComHandler(REFIID id, decltype(fn) f) : iid(id), fn(std::move(f)) {}

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** out) override {
        if (!out) return E_POINTER;
        if (riid == iid || riid == IID_IUnknown) { *out = static_cast<Interface*>(this); }
        else { *out = nullptr; return E_NOINTERFACE; }
        AddRef(); return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++refs; }
    ULONG STDMETHODCALLTYPE Release() override {
        ULONG r = --refs;
        if (!r) delete this;
        return r;
    }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ArgT arg) override {
        return fn(result, arg);
    }
};

// 事件回调（Invoke = (sender, args)，与完成回调的 (HRESULT, arg) 不同）
template <typename Interface, typename SenderT, typename ArgT>
struct ComHandlerEvt : Interface {
    std::function<HRESULT(SenderT*, ArgT*)> fn;
    std::atomic<ULONG> refs{1};
    IID iid;
    ComHandlerEvt(REFIID id, decltype(fn) f) : iid(id), fn(std::move(f)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** out) override {
        if (!out) return E_POINTER;
        if (riid == iid || riid == IID_IUnknown) { *out = static_cast<Interface*>(this); }
        else { *out = nullptr; return E_NOINTERFACE; }
        AddRef(); return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++refs; }
    ULONG STDMETHODCALLTYPE Release() override {
        ULONG r = --refs;
        if (!r) delete this;
        return r;
    }
    HRESULT STDMETHODCALLTYPE Invoke(SenderT* sender, ArgT* args) override {
        return fn(sender, args);
    }
};

// ── WebView2 运行时检测（05 §4.2：缺失弹官方下载引导）─────────────────────
// 常驻运行时注册表位（Evergreen）：HKLM/HKCU × 32/64 位视图四路，读到有效 pv 即在。
static bool IsWebView2RuntimeInstalled()
{
    static const wchar_t kClient[] =
        L"Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    // ⚠️ 路径须活过整个检测过程——不能在初始化列表里存临时 wstring 的 c_str()
    const std::wstring paths[] = {
        std::wstring(L"SOFTWARE\\WOW6432Node\\") + kClient,
        std::wstring(L"SOFTWARE\\") + kClient,
        std::wstring(L"Software\\") + kClient,
    };
    const HKEY roots[] = { HKEY_LOCAL_MACHINE, HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER };
    // 测试钩子：LK_FORCE_NO_RUNTIME=1 模拟缺失（件 3c 非交互测兜底路径）
    wchar_t buf[4] = {};
    if (GetEnvironmentVariableW(L"LK_FORCE_NO_RUNTIME", buf, 4) > 0) return false;
    for (size_t i = 0; i < std::size(paths); ++i) {
        HKEY h = nullptr;
        if (RegOpenKeyExW(roots[i], paths[i].c_str(), 0, KEY_READ, &h) == ERROR_SUCCESS) {
            wchar_t pv[64] = {};
            DWORD size = sizeof(pv);
            bool ok = RegQueryValueExW(h, L"pv", nullptr, nullptr, (LPBYTE)pv, &size) == ERROR_SUCCESS
                      && pv[0] && wcscmp(pv, L"0.0.0.0") != 0;
            RegCloseKey(h);
            if (ok) return true;
        }
    }
    return false;
}

static void ShowRuntimeMissingDialog(HWND parent)
{
    // 不自绘：运行时缺失时窗口画不出来，用系统对话框给官方下载链接
    const wchar_t* msg =
        L"LinkDesk 安装程序需要 WebView2 运行时（Windows 10/11 通常已自带）。\n\n"
        L"点击「确定」打开官方下载页安装后重试，或「取消」退出安装。";
    if (MessageBoxW(parent, msg, L"缺少 WebView2 运行时", MB_OKCANCEL | MB_ICONWARNING) == IDOK) {
        ShellExecuteW(parent, L"open",
            L"https://developer.microsoft.com/microsoft-edge/webview2/", nullptr, nullptr, SW_SHOWNORMAL);
    }
}

// ── 逻辑尺寸 → 物理尺寸（Per-Monitor V2：随窗口所在显示器 DPI）────────────
// 设计稿全是逻辑像素，非 100% 缩放机必须换算，否则窗内布局被压窄。
static void FitLogical(HWND hwnd, UINT dpi, bool center)
{
    if (!dpi) dpi = 96;
    int w = MulDiv(kWinW, (int)dpi, 96), h = MulDiv(kWinH, (int)dpi, 96);
    int x, y;
    if (center) {
        HMONITOR mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        MONITORINFO mi = { sizeof(mi) };
        GetMonitorInfoW(mon, &mi);
        x = mi.rcWork.left + ((mi.rcWork.right - mi.rcWork.left) - w) / 2;
        y = mi.rcWork.top + ((mi.rcWork.bottom - mi.rcWork.top) - h) / 2;
    } else {
        RECT r = {};
        GetWindowRect(hwnd, &r);
        x = r.left; y = r.top;
    }
    SetWindowPos(hwnd, nullptr, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE);
    if (g_controller) {
        RECT rc = {};
        GetClientRect(hwnd, &rc);
        g_controller->put_Bounds(rc);
    }
}

// ── 窗口过程 ──────────────────────────────────────────────────────────────
LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
    case WM_TIMER:
        if (wp == kCaptureTimer) { KillTimer(hwnd, kCaptureTimer); DoCapture(); }
        return 0;
    case WM_SETFOCUS:
        // 键盘焦点必须落在网页里：WebView2 不自动接手顶层窗的焦点
        if (g_controller) g_controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
        return 0;
    case WM_SIZE:
        if (g_controller) {
            RECT rc = {};
            GetClientRect(hwnd, &rc);
            g_controller->put_Bounds(rc);
        }
        return 0;
    case WM_DPICHANGED:
        // 换显示器/改缩放：位置沿用系统建议位，尺寸守回设计逻辑像素（安装 780×570 ／卸载 720×540）
        if (const RECT* sug = reinterpret_cast<const RECT*>(lp))
            SetWindowPos(hwnd, nullptr, sug->left, sug->top, 0, 0,
                         SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        FitLogical(hwnd, HIWORD(wp), false);
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    // 件 2a：安装进度/结果从工人线程送进来，**必须在 UI 线程**发 postMessage（WebView2 的要求）
    case WM_LK_PROGRESS:
        PostJson(L"{\"type\":\"progress\",\"pct\":" + std::to_wstring((int)wp) + L"}");
        return 0;
    case WM_LK_FAILED:
        PostJson(L"{\"type\":\"install-error\",\"code\":\"" + JsonEsc(g_lastErrCode)
                 + L"\",\"msg\":\"" + JsonEsc(g_lastErrMsg) + L"\"}");
        g_lastErrCode.clear();
        g_lastErrMsg.clear();
        return 0;
    case WM_LK_CANCELED:
        PostJson(L"{\"type\":\"install-canceled\"}");
        return 0;
    case WM_LK_DONE:
        PostJson(L"{\"type\":\"install-done\"}");
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

static std::wstring ExeDir()
{
    wchar_t path[MAX_PATH] = {};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    PathRemoveFileSpecW(path);
    return path;
}

/** %TEMP%（不带尾反斜杠）。引导器的所有临时落地——7zr.exe、子进程日志、单文件态的页面——
 *  都在这底下，理由见各自调用点。没有 TEMP 就退回 exe 目录（罕见，如实兜底）。 */
static std::wstring TempBase()
{
    wchar_t buf[MAX_PATH] = {};
    DWORD n = GetEnvironmentVariableW(L"TEMP", buf, MAX_PATH);
    std::wstring base = (n > 0 && n < MAX_PATH) ? std::wstring(buf) : ExeDir();
    while (!base.empty() && base.back() == L'\\') base.pop_back();
    return base;
}

// --capture 落图：导航完成 ≠ 画面落定，实际在 WM_TIMER 里跑（见 kCaptureDelayMs）
static void DoCapture()
{
    Microsoft::WRL::ComPtr<ICoreWebView2> webv;
    if (g_controller) g_controller->get_CoreWebView2(&webv);
    if (!webv) { PostQuitMessage(4); return; }
    IStream* stream = nullptr;
    if (SUCCEEDED(SHCreateStreamOnFileW(g_capturePath.c_str(), STGM_CREATE | STGM_WRITE, &stream))) {
        auto onCap = new ComHandlerV<ICoreWebView2CapturePreviewCompletedHandler>(
            IID_ICoreWebView2CapturePreviewCompletedHandler,
            [](HRESULT) -> HRESULT { PostQuitMessage(0); return S_OK; });
        webv->CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, stream, onCap);
        onCap->Release();
        stream->Release();
    } else {
        PostQuitMessage(4);   // 截图文件打不开
    }
}

// ── i18n（件 1c／规格 01 §五）：语言清单 = 扫 i18n/ 目录，加语言 = 加文件，零代码 ────
// 返回去扩展名的语言码；zh-CN 打头、其余按字典序（顺序即下拉顺序，测试要确定性）。
// `_` 前缀文件名留作约定文件（如 _template.json），不进清单。
static std::vector<std::wstring> ScanI18nCodes(const std::wstring& exeDir)
{
    std::vector<std::wstring> codes;
    WIN32_FIND_DATAW fd = {};
    HANDLE h = FindFirstFileW((exeDir + L"\\i18n\\*.json").c_str(), &fd);
    if (h != INVALID_HANDLE_VALUE) {
        do {
            if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue;
            std::wstring name = fd.cFileName;
            if (name.size() <= 5 || name[0] == L'_') continue;
            std::wstring code = name.substr(0, name.size() - 5);
            if (_wcsicmp(code.c_str(), L"zh-CN") == 0) code = L"zh-CN";
            codes.push_back(code);
        } while (FindNextFileW(h, &fd));
        FindClose(h);
    }
    std::sort(codes.begin(), codes.end(), [](const std::wstring& a, const std::wstring& b) {
        if (_wcsicmp(a.c_str(), b.c_str()) == 0) return false;         // 严格弱序：自比为假
        if (_wcsicmp(a.c_str(), L"zh-CN") == 0) return true;
        if (_wcsicmp(b.c_str(), L"zh-CN") == 0) return false;
        return _wcsicmp(a.c_str(), b.c_str()) < 0;
    });
    return codes;
}

// 上次选择的语言（01 §五持久化：升级安装带出上次选择）。写侧归件 2b，这里只读。
static std::wstring ReadSavedLanguage()
{
    HKEY h = nullptr;
    if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Software\\LinkDesk\\Installer", 0, KEY_READ, &h) != ERROR_SUCCESS)
        return L"";
    wchar_t buf[64] = {};
    DWORD size = sizeof(buf);
    bool ok = RegQueryValueExW(h, L"Language", nullptr, nullptr, (LPBYTE)buf, &size) == ERROR_SUCCESS && buf[0];
    RegCloseKey(h);
    return ok ? std::wstring(buf) : L"";
}

// ══════════════════════════════════════════════════════════════════════════
// 件 2a · 载荷与安装（05 §4.3：单文件拼合 ＋ 7z 解压 ＋ 真实进度）
//
// 安装包布局 = [本 exe][marker 32B][app-*.7z]，**7z 数据的尾巴就是文件末尾**
// ——这是刻意的：7-Zip 自己就是「从文件尾部找 7z 签名」认档的（它的 SFX 自解压包
// 正是「PE ＋ 追加 7z」），所以 marker 必须排在载荷**前面**，7zr 才能走那条快路径
// 直接读整个安装包解压，不必把 150–180 MB 先拷进临时文件。
// 实测（2026-10-01）：`7zr.exe x <安装包>.exe -o<目录>` 直接吃下追加包，报的
// Offset/Physical Size 与拼接时逐字节对上；Windows 自带的 tar.exe（libarchive）
// **读不了** 7z（实测 "This does not look like a tar archive"）⇒ 7zr 必须随包。
//
// 进度：跑 `7zr x ... -bsp1 -bso0` 读 stdout 的百分比（7-Zip 用 '\r' 刷行），
// 映射到四段进度的 0–70。⚠️ 数值只前进不倒退（§3.3）——页面侧 setProgress 兜了一层，
// 这里再夹一次（解压后期 7z 的百分比重算可能回跳）。
// ══════════════════════════════════════════════════════════════════════════

#pragma pack(push, 1)
/** payload 前导记录（64 字节，紧跟本 exe 的最后一个字节）。
 *  version 由拼合脚本写入（构建期唯一真相源 = package.json），宿主经 ?ver= 带给页面——
 *  安装器自己**不猜版本**，显示的就是包里那个版本。 */
struct PayloadMark {
    char     magic[16];   // "LKDESK-PAYLOAD-1"
    uint64_t packed;      // 载荷字节数（= 文件末尾那一段的长度）
    uint64_t unpacked;    // 解压后字节数（磁盘预检／展示用；0 = 未知）
    char     version[32]; // ASCII 版本号，NUL 补齐
};
#pragma pack(pop)
static_assert(sizeof(PayloadMark) == 64, "marker layout is part of the file format");

static const char kPayMagic[16] = { 'L','K','D','E','S','K','-','P','A','Y','L','O','A','D','-','1' };
static const unsigned char k7zSig[6] = { 0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C };

static std::wstring g_selfPath;                  // 自身 exe 全路径（= 安装包路径）
static bool         g_hasPayload = false;         // 带载荷 = 真安装包；不带 = 开发期壳（--preview 用）
static PayloadMark  g_payload = {};
static std::wstring g_installDir;                 // 目标安装目录

/** 命令行开关（件 2a 起） */
static bool g_silent = false;                     // --silent ／ /S（更新链走这条；界面一律不建）
static bool g_forceRun = false;                   // --force-run：装完把壳拉起来（NSIS ${isForceRun} 同位）

/** 附加任务勾选（件 2b）——页面 install-start 里带过来，静默态用 DefaultTaskOptions() 反推 */
static TaskOptions g_opts;

/** 本安装包的版本（件 2b：ARP DisplayName/DisplayVersion 要写）。
 *  来源 = 载荷 marker 的 `version[32]`（真安装包必有；开发期裸壳没有 ⇒ 空串）。 */
static std::wstring PayloadVersion()
{
    std::wstring v;
    for (const char* p = g_payload.version; *p; ++p) v += (wchar_t)(unsigned char)*p;
    return v;
}

/** 带界面的安装阶段——分流 ✕/取消（归 2c 细粒度，这里先有基本态） */
enum class Phase { Idle, Extracting, Finished };
static Phase g_phase = Phase::Idle;

/** 解压子进程句柄（取消时要能终止；**禁 taskkill** 指的是不去杀 LinkDesk 本体，
 *  这里是本进程自己拉起的 7zr 子进程——TerminateProcess 正当） */
static HANDLE g_child = nullptr;
static std::atomic<bool> g_canceled{ false };

static void PostJson(const std::wstring& json)
{
    // --log=<path>：把每条宿主 → 页面的消息追加落盘（件 3c 自动化验收要「进度单调」的可读证据，
    // 不靠截图猜）。产品运行不带此参数。写失败当无事——日志不该影响安装。
    if (!g_logPath.empty()) {
        HANDLE f = CreateFileW(g_logPath.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ,
                               nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (f != INVALID_HANDLE_VALUE) {
            std::wstring line = json + L"\r\n";
            int n = WideCharToMultiByte(CP_UTF8, 0, line.c_str(), (int)line.size(), nullptr, 0, nullptr, nullptr);
            std::string u(n, '\0');
            WideCharToMultiByte(CP_UTF8, 0, line.c_str(), (int)line.size(), u.data(), n, nullptr, nullptr);
            DWORD wrote = 0;
            WriteFile(f, u.data(), (DWORD)u.size(), &wrote, nullptr);
            CloseHandle(f);
        }
    }
    Microsoft::WRL::ComPtr<ICoreWebView2> web;
    if (g_controller) g_controller->get_CoreWebView2(&web);
    if (web) web->PostWebMessageAsJson(json.c_str());
}

/** 从自身尾部往前找 marker。逐候选校验（magic ＋ packed 与文件长对上 ＋ 紧跟 7z 签名）——
 *  本 exe 的 .rdata 里也躺着同一串 magic 字面量，只认第一个命中必然错认。 */
static bool FindPayload()
{
    HANDLE h = CreateFileW(g_selfPath.c_str(), GENERIC_READ,
                           FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                           nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER li = {};
    if (!GetFileSizeEx(h, &li)) { CloseHandle(h); return false; }
    const uint64_t fileSize = (uint64_t)li.QuadPart;
    if (fileSize < sizeof(PayloadMark) + 6) { CloseHandle(h); return false; }

    const size_t kChunk = 1u << 20;
    std::vector<unsigned char> buf(kChunk);
    uint64_t pos = fileSize;
    bool found = false;
    while (pos > 0 && !found) {
        uint64_t start = pos > kChunk ? pos - kChunk : 0;
        DWORD take = (DWORD)(pos - start);
        LARGE_INTEGER off = {};
        off.QuadPart = (LONGLONG)start;
        if (!SetFilePointerEx(h, off, nullptr, FILE_BEGIN)) break;
        DWORD got = 0;
        if (!ReadFile(h, buf.data(), take, &got, nullptr) || got != take) break;
        if (take >= sizeof(PayloadMark)) {
            for (size_t i = take - sizeof(PayloadMark) + 1; i-- > 0; ) {
                PayloadMark m = {};
                memcpy(&m, buf.data() + i, sizeof(m));
                if (memcmp(m.magic, kPayMagic, 16) != 0) continue;
                uint64_t abs = start + i;
                if (abs + sizeof(PayloadMark) + m.packed != fileSize) continue;
                // 紧跟其后必须是 7z 签名——单独读一次，免得踩 chunk 边界
                unsigned char sig[6] = {};
                LARGE_INTEGER so = {};
                so.QuadPart = (LONGLONG)(abs + sizeof(PayloadMark));
                DWORD sgot = 0;
                if (!SetFilePointerEx(h, so, nullptr, FILE_BEGIN)
                    || !ReadFile(h, sig, 6, &sgot, nullptr) || sgot != 6) continue;
                if (memcmp(sig, k7zSig, 6) != 0) continue;
                g_payload = m;
                g_hasPayload = true;
                found = true;
                break;
            }
        }
        pos = start;
    }
    CloseHandle(h);
    return found;
}

/** 把嵌入的二进制资源（icon.rc：2 = 7zr.exe）写盘——单文件安装包只能这样把解压器带在身上 */
static bool WriteResourceToFile(int id, const std::wstring& path)
{
    HRSRC res = FindResourceW(nullptr, MAKEINTRESOURCEW(id), RT_RCDATA);
    if (!res) return false;
    DWORD sz = SizeofResource(nullptr, res);
    HGLOBAL gl = LoadResource(nullptr, res);
    if (!gl || !sz) return false;
    const void* p = LockResource(gl);
    if (!p) return false;
    HANDLE h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr,
                           CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    DWORD wrote = 0;
    BOOL ok = WriteFile(h, p, sz, &wrote, nullptr);
    CloseHandle(h);
    return ok && wrote == sz;
}

/** 默认安装目录：%LocalAppData%\Programs\linkdesk（01 §一④ 拍板；per-user，升级免提权） */
static std::wstring DefaultInstallDir()
{
    wchar_t buf[MAX_PATH] = {};
    DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", buf, MAX_PATH);
    std::wstring base = (n > 0 && n < MAX_PATH) ? std::wstring(buf) : ExeDir();
    return base + L"\\Programs\\linkdesk";
}

/** 已装位置：**委托 `syswrite.cpp` 的 `ReadInstalledDir()`**（件 2b 起读侧唯一实现）。
 *  🔴 旧实现按 `DisplayName == "LinkDesk"` 且读 `InstallLocation` 认——实机上两个前提都**不成立**
 *  （实机 DisplayName = `"LinkDesk 0.2.33"`，那条键**没有** `InstallLocation`）⇒ 永远返回空，
 *  升级时会**另装一份**而不是覆盖。改走 `UninstallString` / `DisplayIcon` 后与实机对齐。
 *  ⚠️ 键名仍然不写死（ARP 键名 = `UUID.v5(appId)`，见 syswrite.cpp 文件头），
 *  「键名格式」这个事实只住在 syswrite.cpp 一处。 */
static std::wstring FindInstalledDir()
{
    return ReadInstalledDir();
}

/** 目标卷剩余空间（磁盘预检用，02 §三） */
static unsigned long long FreeBytesOn(const std::wstring& dir)
{
    std::wstring probe = dir;
    for (;;) {
        ULARGE_INTEGER freeBytes = {};
        if (GetDiskFreeSpaceExW(probe.c_str(), &freeBytes, nullptr, nullptr)) return freeBytes.QuadPart;
        size_t cut = probe.find_last_of(L"\\/");
        if (cut == std::wstring::npos || cut < 3) return 0;
        probe = probe.substr(0, cut);
    }
}

// ── 解压子进程 ────────────────────────────────────────────────────────────
struct ExtractResult { bool ok = false; DWORD exitCode = 0; std::wstring detail; };

// ── 解压进度：为什么不用 7zr 的百分比读数（件 2a 实测结论，别再试回去）────────────
// 7-Zip 26.03 在输出被重定向（管道 / 文件）时**一律不打印进度行**：`-bsp1`、`-bsp2`、
// `-bso0/-bso1/-bso2`、`-bb1` 各种组合实测都是 **0 行含 `%`**，只有挂在真控制台上才画进度条。
// 引导器是 GUI 进程（无控制台），拿不到那个条件。
//
// 所以进度改成**量目标目录里真落盘的文件**：先用 `7zr l -slt` 取到档案清单（路径 → 期望字节数），
// 解压期间轮询目标目录，**大小等于期望值的文件才算完成**。这不是"估算"——它就是 IO 事实，
// 而且对**覆盖安装**同样成立（旧文件被重新写满才算数，不会一开始就顶到 100%）。

struct ArchiveEntry { std::wstring rel; unsigned long long size; };

/** 跑 `7zr l -slt` 取档案清单。失败返回 false（此时进度退回"按字节总数"的粗略口径）。 */
static bool LoadArchiveListing(const std::wstring& sevenZipPath, std::vector<ArchiveEntry>& out)
{
    std::wstring logFile = TempBase() + L"\\linkdesk-7zl-" + std::to_wstring(GetCurrentProcessId()) + L".txt";
    SECURITY_ATTRIBUTES sa = { sizeof(sa), nullptr, TRUE };
    HANDLE h = CreateFileW(logFile.c_str(), GENERIC_WRITE, FILE_SHARE_READ, &sa,
                           CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;

    std::wstring cmd = L"\"" + sevenZipPath + L"\" l -slt \"" + g_selfPath + L"\"";
    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdOutput = h;
    si.hStdError = h;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    PROCESS_INFORMATION pi = {};
    std::vector<wchar_t> mc(cmd.begin(), cmd.end());
    mc.push_back(L'\0');
    std::wstring wd = ExeDir();
    BOOL ok = CreateProcessW(nullptr, mc.data(), nullptr, nullptr, TRUE,
                            CREATE_NO_WINDOW, nullptr, wd.c_str(), &si, &pi);
    CloseHandle(h);
    if (!ok) { DeleteFileW(logFile.c_str()); return false; }
    WaitForSingleObject(pi.hProcess, 60000);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);

    // 逐行读（UTF-8）；只认 `Path = ` 与紧随其后的 `Size = `。目录项没有 Size，自然跳过。
    std::string all;
    {
        HANDLE f = CreateFileW(logFile.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                               OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (f != INVALID_HANDLE_VALUE) {
            char buf[8192];
            DWORD got = 0;
            while (ReadFile(f, buf, sizeof(buf), &got, nullptr) && got > 0) all.append(buf, got);
            CloseHandle(f);
        }
    }
    DeleteFileW(logFile.c_str());

    std::wstring pending;
    size_t i = 0;
    while (i < all.size()) {
        size_t eol = all.find('\n', i);
        if (eol == std::string::npos) eol = all.size();
        std::string line = all.substr(i, eol - i);
        i = eol + 1;
        while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
        if (line.rfind("Path = ", 0) == 0) {
            std::string v = line.substr(7);
            pending.assign(v.begin(), v.end());
            for (wchar_t& c : pending) if (c == L'/') c = L'\\';
        } else if (line.rfind("Size = ", 0) == 0 && !pending.empty()) {
            ArchiveEntry e;
            e.rel = pending;
            e.size = _strtoui64(line.c_str() + 7, nullptr, 10);
            out.push_back(e);
            pending.clear();
        }
    }
    if (out.empty()) return false;
    // DoneBytes 用二分查找，这里必须按**同一个**比较器排好序（大小写不敏感，见那边注释）
    std::sort(out.begin(), out.end(), [](const ArchiveEntry& a, const ArchiveEntry& b) {
        return _wcsicmp(a.rel.c_str(), b.rel.c_str()) < 0;
    });
    return true;
}

/** 目标目录里"已完成"的字节数：清单里那些大小已对上的文件之和。 */
static unsigned long long DoneBytes(const std::wstring& root, size_t prefixLen,
                                    const std::vector<ArchiveEntry>& list,
                                    size_t lo, size_t hi)   // 清单按路径有序，二分用
{
    unsigned long long total = 0;
    WIN32_FIND_DATAW fd = {};
    HANDLE h = FindFirstFileW((root + L"\\*").c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) return 0;
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        std::wstring p = root + L"\\" + fd.cFileName;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            total += DoneBytes(p, prefixLen, list, lo, hi);
            continue;
        }
        std::wstring rel = p.substr(prefixLen);
        // 大小写不敏感比较（Windows）：清单是 7z 里的原名，磁盘上可能大小写不同
        size_t a = lo, b = hi;
        while (a < b) {
            size_t m = (a + b) / 2;
            int c = _wcsicmp(list[m].rel.c_str(), rel.c_str());
            if (c == 0) {
                // fd.nFileSizeHigh/Low 是 FindFirstFile 的快照，正好是我们要的"当前大小"
                unsigned long long cur = ((unsigned long long)fd.nFileSizeHigh << 32) | fd.nFileSizeLow;
                if (cur == list[m].size) total += list[m].size;
                break;
            }
            if (c < 0) a = m + 1; else b = m;
        }
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    return total;
}

/** 跑 7zr 解压；进度经 WM_LK_PROGRESS 送回 UI 线程（0–70 段）。调用方保证 g_payload/g_installDir 就绪。 */
static ExtractResult RunExtract(const std::wstring& sevenZipPath)
{
    ExtractResult res;

    std::vector<ArchiveEntry> listing;
    bool haveListing = LoadArchiveListing(sevenZipPath, listing);
    unsigned long long totalKnown = 0;
    for (const ArchiveEntry& e : listing) totalKnown += e.size;
    if (!totalKnown) totalKnown = g_payload.unpacked;   // 清单拿不到就退回 marker 的字节总数
    size_t prefix = g_installDir.size();
    if (!prefix || g_installDir[prefix - 1] != L'\\') prefix += 1;   // 拼 "\\name" 的偏移
    auto race = [&](unsigned long long done) { return totalKnown ? done * 70 / totalKnown : 0; };

    // 子进程的 stdout/stderr 一律倒进临时文件：不进管道，就没有"管道满 → 子进程卡死"这种事。
    std::wstring logFile = TempBase() + L"\\linkdesk-7zx-" + std::to_wstring(GetCurrentProcessId()) + L".txt";
    SECURITY_ATTRIBUTES sa = { sizeof(sa), nullptr, TRUE };
    HANDLE logH = CreateFileW(logFile.c_str(), GENERIC_WRITE, FILE_SHARE_READ, &sa,
                              CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (logH == INVALID_HANDLE_VALUE) { res.detail = L"cannot open log"; return res; }

    std::wstring cmd = L"\"" + sevenZipPath + L"\" x \"" + g_selfPath + L"\" -o\"" + g_installDir +
                       L"\" -y -aoa -bd";
    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdOutput = logH;
    si.hStdError = logH;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    PROCESS_INFORMATION pi = {};
    std::vector<wchar_t> mc(cmd.begin(), cmd.end());
    mc.push_back(L'\0');
    std::wstring wd = ExeDir();
    if (!CreateProcessW(nullptr, mc.data(), nullptr, nullptr, TRUE,
                        CREATE_NO_WINDOW, nullptr, wd.c_str(), &si, &pi)) {
        CloseHandle(logH);
        DeleteFileW(logFile.c_str());
        res.detail = L"CreateProcess(7zr) failed, err=" + std::to_wstring(GetLastError());
        return res;
    }
    CloseHandle(logH);
    g_child = pi.hProcess;

    int lastMapped = -1;
    DWORD wait = WAIT_TIMEOUT;
    for (;;) {
        wait = WaitForSingleObject(pi.hProcess, 150);
        if (wait == WAIT_OBJECT_0) break;
        if (g_canceled.load()) {                       // 取消：掐掉我们自己拉起的 7zr
            TerminateProcess(pi.hProcess, 1);
            WaitForSingleObject(pi.hProcess, 3000);
            break;
        }
        if (!g_hwnd) continue;
        if (!haveListing) continue;                    // 无清单时进度靠段末的跳变，不假装有细读数
        unsigned long long done = DoneBytes(g_installDir, prefix, listing, 0, listing.size());
        int mapped = (int)race(done);
        if (mapped > lastMapped) {
            lastMapped = mapped;
            PostMessageW(g_hwnd, WM_LK_PROGRESS, (WPARAM)mapped, 0);
        }
    }
    GetExitCodeProcess(pi.hProcess, &res.exitCode);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    g_child = nullptr;
    DeleteFileW(logFile.c_str());

    res.ok = (wait == WAIT_OBJECT_0 && res.exitCode == 0) && !g_canceled.load();
    if (g_canceled.load()) { res.detail = L"canceled"; res.ok = false; }
    else if (!res.ok) res.detail = L"7zr exit=" + std::to_wstring(res.exitCode);
    return res;
}

/** 把 7zr 落到 %TEMP% 并解压，完事清掉。返回空串 = 成功，否则是错误说明。 */
static std::wstring ExtractPayload()
{
    wchar_t tmp[MAX_PATH] = {};
    DWORD n = GetTempPathW(MAX_PATH, tmp);
    if (!n || n >= MAX_PATH) return L"TEMP unavailable";
    std::wstring work = std::wstring(tmp) + L"linkdesk-setup-" + std::to_wstring(GetCurrentProcessId());
    CreateDirectoryW(work.c_str(), nullptr);
    std::wstring sevenZip = work + L"\\7zr.exe";
    if (!WriteResourceToFile(2, sevenZip)) {
        return L"embedded 7zr.exe missing (rebuild: tools\\fetch-7z.ps1 + build.cmd)";
    }
    ExtractResult r = RunExtract(sevenZip);
    DeleteFileW(sevenZip.c_str());
    RemoveDirectoryW(work.c_str());
    return r.ok ? std::wstring() : (r.detail.empty() ? L"extract failed" : r.detail);
}

/** 收尾校验（第四段 92–100 的当前内容）：关键文件在不在。
 *  ⚠️ 2b 起换/补成「resources 关键文件大小/哈希抽查」（01 §二）。 */
static bool VerifyInstall()
{
    DWORD attr = GetFileAttributesW((g_installDir + L"\\LinkDesk.exe").c_str());
    return attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY);
}

/** 无界面安装（--silent ／ /S）——更新链那条路。**不建窗、不碰 WebView2**：
 *  自动更新不该因为「运行时缺失」而装不上（缺运行时是能用界面的问题，不是装不上的问题）。 */
static int RunSilentInstall()
{
    if (!g_hasPayload) return 4;                       // 拿开发壳当安装包跑：如实失败
    if (g_installDir.empty()) g_installDir = DefaultInstallDir();
    CreateDirectoryW(g_installDir.c_str(), nullptr);
    std::wstring err = ExtractPayload();
    if (!err.empty()) { OutputDebugStringW((L"[installer] " + err + L"\n").c_str()); return 5; }
    if (!VerifyInstall()) return 6;

    // 件 2b：静默装也要写系统项——**勾选值取 DefaultTaskOptions()**（NSIS 静默安装跳过勾选页
    // ⇒ 走的是默认集；升级时其中两项由注册表现状反推，这是「静默升级不复活」的实现面）。
    // 静默路径没有窗、没有 WebView2 ⇒ 这里自己初始化 COM（快捷方式要 IShellLink）。
    HRESULT hrCom = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    g_opts = DefaultTaskOptions();
    if (g_opts.assoc) WriteAssociations(g_installDir);
    WriteContextMenus(g_installDir, g_opts.fileMenu, g_opts.dirMenu);
    if (g_opts.path) AddToPath(g_installDir);
    CreateShortcuts(g_installDir);
    WriteArpEntry(g_installDir, PayloadVersion());
    if (SUCCEEDED(hrCom)) CoUninitialize();

    if (g_forceRun) {
        std::wstring exe = g_installDir + L"\\LinkDesk.exe";
        ShellExecuteW(nullptr, L"open", exe.c_str(), nullptr, g_installDir.c_str(), SW_SHOWNORMAL);
    }
    return 0;
}

// ── 界面态安装（工人线程 → WM_APP 消息 → UI 线程发 postMessage）──────────────
// 自定义消息常量与 g_lastErr* 见文件头；JsonEsc/JsonGetString 紧随其后。

/** URL 查询串转义（UTF-8 ＋ 百分号编码）。安装目录可能含空格/中文（自定义路径），
 *  直接拼进 ?dir= 会让页面 readOpts 解析出半个路径。 */
static std::wstring UrlEnc(const std::wstring& s)
{
    int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
    std::string u(n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), u.data(), n, nullptr, nullptr);
    static const wchar_t* hex = L"0123456789ABCDEF";
    std::wstring o;
    for (unsigned char c : u) {
        if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
            || c == '-' || c == '_' || c == '.' || c == '~') {
            o += (wchar_t)c;
        } else {
            o += L'%'; o += hex[c >> 4]; o += hex[c & 15];
        }
    }
    return o;
}

static std::wstring JsonEsc(const std::wstring& s){
    std::wstring o;
    for (wchar_t c : s) {
        switch (c) {
        case L'\\': o += L"\\\\"; break;
        case L'"':  o += L"\\\""; break;
        case L'\n': o += L"\\n"; break;
        case L'\r': o += L"\\r"; break;
        case L'\t': o += L"\\t"; break;
        default:
            if (c < 0x20) { wchar_t b[8]; swprintf(b, 8, L"\\u%04x", (int)c); o += b; }
            else o += c;
        }
    }
    return o;
}

/** 从页面发来的极小 JSON 里取一个字符串字段（含 \\ / \" / \u 反转义）。
 *  ⚠️ 页面用 JSON.stringify，Windows 路径的双反斜杠会以 \\\\ 出来——必须反转义，
 *  否则解出来的目录名多一个反斜杠，解压直接落到一个不存在的好名字上。 */
static std::wstring JsonGetString(const std::wstring& js, const wchar_t* key)
{
    std::wstring pat = L"\"" + std::wstring(key) + L"\"";
    size_t p = js.find(pat);
    if (p == std::wstring::npos) return L"";
    p = js.find(L':', p + pat.size());
    if (p == std::wstring::npos) return L"";
    size_t q = js.find(L'"', p);
    if (q == std::wstring::npos) return L"";
    std::wstring out;
    for (size_t i = q + 1; i < js.size(); ++i) {
        wchar_t c = js[i];
        if (c == L'"') break;
        if (c == L'\\' && i + 1 < js.size()) {
            wchar_t nx = js[++i];
            if (nx == L'u' && i + 4 < js.size()) {
                int v = 0;
                for (int k = 1; k <= 4; ++k) {
                    wchar_t h = js[i + k];
                    v = v * 16 + ((h >= L'0' && h <= L'9') ? (h - L'0') : ((h | 32) - L'a' + 10));
                }
                i += 4;
                out += (wchar_t)v;
            } else if (nx == L'n') out += L'\n';
            else if (nx == L'r') out += L'\r';
            else if (nx == L't') out += L'\t';
            else out += nx;
            continue;
        }
        out += c;
    }
    return out;
}

/** 取一个布尔字段（件 2b：页面把四个勾选值放在 `"opts":{"assoc":true,...}` 里）。
 *  ⚠️ 找不到 ≠ false —— 分开判：字段缺席时用**调用方给的默认值**（页面前端若还没接线，
 *  不能因为「没带这个键」就把用户默认该有的关联/PATH 静默关掉）。 */
static bool JsonGetBool(const std::wstring& js, const wchar_t* key, bool fallback)
{
    std::wstring pat = L"\"" + std::wstring(key) + L"\"";
    size_t p = js.find(pat);
    if (p == std::wstring::npos) return fallback;
    p = js.find(L':', p + pat.size());
    if (p == std::wstring::npos) return fallback;
    size_t q = p + 1;
    while (q < js.size() && (js[q] == L' ' || js[q] == L'\t')) ++q;
    if (js.compare(q, 4, L"true") == 0) return true;
    if (js.compare(q, 5, L"false") == 0) return false;
    return fallback;
}

/** 段 2（70–80）：协议注册。
 *  🔴 **本格是空跑，且这不是「没做完」——是产品里根本没有这个注册。** 依据（2026-10-01 查）：
 *    · 05 §4.3 的注册表清单（「逐条不得增删」）里**没有** linkdesk:// 协议；
 *    · 全仓 grep `setAsDefaultProtocolClient` / `registerProtocol` / `linkdesk://` → **零命中**；
 *    · 实机读现装版（NSIS 0.2.33）的全部键 → **也没有**协议注册。
 *  但 mockup 的进度屏第 2 步文案就是「注册 linkdesk:// 协议」（用户已目检通过的屏）。
 *  ⇒ 三处对不上，**不自作主张写一条没人能处理的协议**（写了 = 系统里多一条点了没反应的
 *    「死」协议，比不写更糟）。此处如实空跑并**把落差记进 06/01 文档**，等用户拍板：
 *    要么补 app 侧协议处理 ＋ 这里补注册，要么把 mockup 该步文案改成实际做的事。
 *  ⇒ 进度仍走 70 → 80（保留四段视觉结构），但**70–80 之间不撒谎**：不做假读数。 */
static void SegmentProtocol()
{
    // 有意留空——见上面那段。
}

/** 目录选择对话框（页面 `browse-dir` → 宿主）。选完把新路径经 `browse-dir-done` 发回页面。
 *  用 IFileOpenDialog(FOS_PICKFOLDERS)——Win11 上是系统「选择文件夹」新样式；
 *  SHBrowseForFolder 是老树形对话框，视觉上跟本安装包不搭。**必须在已 CoInitialize 的线程调用**。 */
static void PickInstallDir(const std::wstring& current)
{
    IFileOpenDialog* dlg = nullptr;
    if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&dlg))) || !dlg) return;
    DWORD flags = 0;
    dlg->GetOptions(&flags);
    dlg->SetOptions(flags | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
    dlg->SetTitle(L"选择安装位置");
    // 光标起点 = 输入框里那个目录（存在才设，否则对话框会弹到意料之外的地方）
    if (!current.empty() && GetFileAttributesW(current.c_str()) != INVALID_FILE_ATTRIBUTES) {
        IShellItem* start = nullptr;
        if (SUCCEEDED(SHCreateItemFromParsingName(current.c_str(), nullptr, IID_PPV_ARGS(&start))) && start) {
            dlg->SetFolder(start);
            start->Release();
        }
    }
    if (SUCCEEDED(dlg->Show(g_hwnd))) {
        IShellItem* item = nullptr;
        if (SUCCEEDED(dlg->GetResult(&item)) && item) {
            PWSTR p = nullptr;
            if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &p)) && p) {
                PostJson(L"{\"type\":\"browse-dir-done\",\"dir\":\"" + JsonEsc(p) + L"\"}");
                CoTaskMemFree(p);
            }
            item->Release();
        }
    }
    dlg->Release();
}

/** 完成屏「运行 LinkDesk」勾上时拉起刚装好的 exe（装完就让人看见东西）。
 *  ⚠️ 目录一律以 g_installDir 为准——那是这次真装的位置，不是注册表里可能过期的旧值。 */
static void LaunchInstalledApp()
{
    if (g_installDir.empty()) return;
    std::wstring exe = g_installDir + L"\\LinkDesk.exe";
    if (GetFileAttributesW(exe.c_str()) == INVALID_FILE_ATTRIBUTES) return;
    ShellExecuteW(nullptr, L"open", exe.c_str(), nullptr, g_installDir.c_str(), SW_SHOWNORMAL);
}

static void InstallWorker()
{
    // 工人线程也要 COM：快捷方式走 IShellLink（2b 的 CreateShortcuts）。
    // ⚠️ 与 UI 线程的 COINIT 保持 APRARTMENTTHREADED；失败当无事（退化为「快捷方式建不了」）。
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    // 段 1（0–70）：解压——真进度，见 RunExtract
    std::wstring err = ExtractPayload();
    if (g_canceled.load()) { PostMessageW(g_hwnd, WM_LK_CANCELED, 0, 0); CoUninitialize(); return; }
    if (!err.empty()) {
        g_lastErrCode = L"EXTRACT_FAILED";
        g_lastErrMsg = err;
        PostMessageW(g_hwnd, WM_LK_FAILED, 0, 0);
        CoUninitialize();
        return;
    }
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 70, 0);

    // 段 2（70–80）：协议注册——本格空跑（产品无此注册，理由见 SegmentProtocol 注释）
    SegmentProtocol();
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 80, 0);

    // 段 3（80–92）：写系统项（快捷方式 · 右键菜单 · PATH · 编辑器注册 · ARP）
    //   E6#45 四项按勾选写。**单项失败不中断、也不把整次安装判死**——应用文件已经落地，
    //   某个关联没写上不该让用户看到「安装失败」（那会把人吓去重装，越弄越糟）。
    //   结果照 05 §4.3「一项失败不中断」留痕到调试输出，供排障。
    bool sysOk = true;
    if (g_opts.assoc) sysOk &= WriteAssociations(g_installDir);
    sysOk &= WriteContextMenus(g_installDir, g_opts.fileMenu, g_opts.dirMenu);
    if (g_opts.path) sysOk &= AddToPath(g_installDir);
    sysOk &= CreateShortcuts(g_installDir);
    sysOk &= WriteArpEntry(g_installDir, PayloadVersion());
    if (g_canceled.load()) { PostMessageW(g_hwnd, WM_LK_CANCELED, 0, 0); CoUninitialize(); return; }
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 92, 0);

    // 段 4（92–100）：收尾校验——**成败只看文件是否落地**（系统项是「加分项」不是「必需项」）
    bool ok = VerifyInstall();
    if (!sysOk) OutputDebugStringW(L"[installer] 部分系统项未写入（关联/右键/PATH/快捷方式/ARP）\n");
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 100, 0);
    if (!ok) {
        g_lastErrCode = L"VERIFY_FAILED";
        g_lastErrMsg = L"解压后没找到 LinkDesk.exe——安装包可能不完整";
        PostMessageW(g_hwnd, WM_LK_FAILED, 0, 0);
        CoUninitialize();
        return;
    }
    PostMessageW(g_hwnd, WM_LK_DONE, 0, 0);
    CoUninitialize();
}

/** 起一次界面态安装：目录解析 → 磁盘预检 → 工人线程解压。重复调用直接返回（防重复提交）。 */
static void StartInstall(const std::wstring& requestedDir, const TaskOptions& opts)
{
    if (g_phase == Phase::Extracting) return;
    g_canceled = false;
    g_opts = opts;
    if (!requestedDir.empty()) g_installDir = requestedDir;
    if (g_installDir.empty()) {
        std::wstring existing = FindInstalledDir();
        g_installDir = existing.empty() ? DefaultInstallDir() : existing;
    }
    // 磁盘预检（02 §三「磁盘空间不足」）：解压后体积 ＋ 64 MB 余量
    if (g_hasPayload && g_payload.unpacked) {
        unsigned long long need = g_payload.unpacked + (64ull << 20);
        unsigned long long avail = FreeBytesOn(g_installDir);
        if (avail && avail < need) {
            wchar_t mb[128] = {};
            swprintf(mb, 128, L"需要 %llu MB，目标盘只剩 %llu MB",
                     need >> 20, avail >> 20);
            g_lastErrCode = L"DISK_FULL";
            g_lastErrMsg = mb;
            SendMessageW(g_hwnd, WM_LK_FAILED, 0, 0);
            return;
        }
    }
    if (!g_hasPayload) {
        g_lastErrCode = L"NO_PAYLOAD";
        g_lastErrMsg = L"这是开发期引导器壳，不含安装载荷（双击真实安装包才有）";
        SendMessageW(g_hwnd, WM_LK_FAILED, 0, 0);
        return;
    }
    CreateDirectoryW(g_installDir.c_str(), nullptr);
    g_phase = Phase::Extracting;
    std::thread(InstallWorker).detach();
}

/** 取消：终止我们自己拉起的 7zr（**不是**去杀 LinkDesk——那条路的禁令见 §4.3）。
 *  已解压的文件留待 2c 的回滚分支处理；此格先如实取消。 */
static void CancelInstall()
{
    g_canceled = true;
    if (g_child) TerminateProcess(g_child, 1);
}

// ── UI 资源根（件 2a）：单文件安装包旁边没有 app.html，页面必须从内嵌资源摊出来 ────
// id 契约与 tools/gen-ui-rc.mjs 同一份：3 = 清单（UTF-8 文本，每行 `id<TAB>相对路径`），10+ = 文件本体。
static const int kUiManifestRes = 3;
static const int kUiFileResBase  = 10;
static std::wstring g_uiTempDir;   // 摊出来的临时目录（dev 态为空 = 退出时不用清）

/** 递归删目录（退出时清临时 UI；失败当无事——%TEMP% 本来就会被系统回收）。 */
static void RemoveTree(const std::wstring& dir)
{
    WIN32_FIND_DATAW fd = {};
    HANDLE h = FindFirstFileW((dir + L"\\*").c_str(), &fd);
    if (h != INVALID_HANDLE_VALUE) {
        do {
            if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
            std::wstring p = dir + L"\\" + fd.cFileName;
            if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) RemoveTree(p);
            else { SetFileAttributesW(p.c_str(), FILE_ATTRIBUTE_NORMAL); DeleteFileW(p.c_str()); }
        } while (FindNextFileW(h, &fd));
        FindClose(h);
    }
    RemoveDirectoryW(dir.c_str());
}

/** 页面根取在哪：
 *  - **开发态**：exe 旁就有 `app.html`（build.cmd 会把 app.* 拷进 out\）⇒ 直接用磁盘那份，
 *    改 CSS 不必重编译（README §二）。
 *  - **产品态**：单文件安装包旁边什么都没有 ⇒ 把内嵌 UI 资源摊到
 *    `%TEMP%\linkdesk-bootstrapper-<pid>\`，虚拟主机映射到那儿。 */
static std::wstring ResolveUiRoot()
{
    if (GetFileAttributesW((ExeDir() + L"\\app.html").c_str()) != INVALID_FILE_ATTRIBUTES)
        return ExeDir();

    HRSRC mf = FindResourceW(nullptr, MAKEINTRESOURCEW(kUiManifestRes), RT_RCDATA);
    if (!mf) return ExeDir();   // 未内嵌 UI 的老壳：照旧走 exe 目录

    HGLOBAL gl = LoadResource(nullptr, mf);
    const char* txt = gl ? (const char*)LockResource(gl) : nullptr;
    DWORD sz = SizeofResource(nullptr, mf);
    if (!txt || !sz) return ExeDir();

    std::wstring dir = TempBase() + L"\\linkdesk-bootstrapper-" + std::to_wstring(GetCurrentProcessId());
    RemoveTree(dir);                       // 同 pid 的残留（理论上没有）先清掉
    CreateDirectoryW(dir.c_str(), nullptr);

    size_t i = 0;
    while (i < sz) {
        size_t eol = i;
        while (eol < sz && txt[eol] != '\n') ++eol;
        std::string line(txt + i, eol - i);
        while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
        i = eol + 1;
        if (line.empty()) continue;
        size_t tab = line.find('\t');
        if (tab == std::string::npos) continue;
        int id = atoi(line.substr(0, tab).c_str());
        std::string rel = line.substr(tab + 1);
        // 路径不允许跳出根（清单是我们自己生成的，仍然防一手）
        if (rel.find("..") != std::string::npos) continue;
        std::wstring wrel(rel.begin(), rel.end());
        for (wchar_t& c : wrel) if (c == L'/') c = L'\\';
        size_t slash = wrel.rfind(L'\\');
        if (slash != std::wstring::npos)
            CreateDirectoryW((dir + L"\\" + wrel.substr(0, slash)).c_str(), nullptr);
        WriteResourceToFile(id, dir + L"\\" + wrel);
    }
    g_uiTempDir = dir;
    return dir;
}

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, PWSTR, int nCmdShow)
{
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    std::wstring reqDir;
    for (int i = 1; argv && i < argc; ++i) {
        if (wcscmp(argv[i], L"--debug") == 0) g_debug = true;
        if (wcscmp(argv[i], L"--uninstall") == 0) g_uninstall = true;
        // 更新链（electron/services/update-install.ts）发的就是 /S（SILENT_SWITCH）
        if (wcscmp(argv[i], L"/S") == 0 || _wcsicmp(argv[i], L"--silent") == 0) g_silent = true;
        if (wcscmp(argv[i], L"--force-run") == 0) g_forceRun = true;
        if (wcsncmp(argv[i], L"--dir=", 6) == 0) reqDir = argv[i] + 6;
        if (wcsncmp(argv[i], L"--capture=", 10) == 0) g_capturePath = argv[i] + 10;
        if (wcsncmp(argv[i], L"--preview=", 10) == 0) g_previewQuery = argv[i] + 10;
        if (wcsncmp(argv[i], L"--log=", 6) == 0) g_logPath = argv[i] + 6;
    }
    if (argv) LocalFree(argv);
    if (g_uninstall) { kWinW = 720; kWinH = 540; }   // 卸载窗比安装窗略小（E-卸载屏 mockup）

    g_selfPath = [] { wchar_t p[MAX_PATH] = {}; GetModuleFileNameW(nullptr, p, MAX_PATH); return std::wstring(p); }();
    g_hasPayload = FindPayload();
    if (!reqDir.empty()) g_installDir = reqDir;

    // ── 静默安装（--silent ／ /S）：更新链那条路 ─────────────────────────────
    // 🔴 必须排在运行时检测**之前**：自动更新不该被「这台机器没装 WebView2 运行时」挡死，
    //    而且这条路根本不建窗、不碰 WebView2（见 RunSilentInstall 注释）。
    if (g_silent) {
        return RunSilentInstall();   // 静默卸载（--uninstall /S）归 2d，届时在此分流
    }

    // Per-Monitor V2 DPI（05 §4.2 验收项）
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    // 运行时检测：缺失（或 LK_FORCE_NO_RUNTIME 模拟缺失）→ 系统对话框引导官方下载
    if (!IsWebView2RuntimeInstalled()) {
        ShowRuntimeMissingDialog(nullptr);
        return 3;   // 约定：缺运行时退出码 3
    }

    WNDCLASSW wc = {};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hIcon = LoadIconW(hInst, MAKEINTRESOURCEW(1));
    wc.lpszClassName = L"LinkDeskInstallerBootstrapper";
    RegisterClassW(&wc);

    // 无边框（WS_POPUP）＋ 设计逻辑像素尺寸（安装 780×570 ／卸载 720×540）、桌面居中（见 FitLogical）
    g_hwnd = CreateWindowExW(0, wc.lpszClassName, g_uninstall ? L"LinkDesk 卸载" : L"LinkDesk 安装",
                             WS_POPUP, 0, 0, kWinW, kWinH,
                             nullptr, nullptr, hInst, nullptr);
    if (!g_hwnd) return 1;
    FitLogical(g_hwnd, GetDpiForWindow(g_hwnd), true);
    ShowWindow(g_hwnd, nCmdShow);
    // 无边框窗没有标题栏可点，键盘必须开箱可用（Enter=主按钮 / Tab / Esc）：
    // 抢前台并把焦点打到顶层窗上，WM_SETFOCUS 再转交 WebView2（此时 controller 未建，见下方补一次）
    SetForegroundWindow(g_hwnd);
    SetFocus(g_hwnd);

    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    // WebView2 环境。页面根见 ResolveUiRoot()：开发态 = exe 目录，单文件产品态 = %TEMP% 摊出来的目录。
    // 用户数据夹跟着页面根走（安装器不落地用户配置），退出时一并清掉。
    std::wstring exeDir = ResolveUiRoot();
    std::wstring userData = exeDir + L"\\.wv2data";
    Microsoft::WRL::ComPtr<ICoreWebView2EnvironmentOptions> opts =
        Microsoft::WRL::Make<CoreWebView2EnvironmentOptions>();

    auto onEnv = new ComHandler<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler, ICoreWebView2Environment*>(
        IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler,
        [exeDir](HRESULT result, ICoreWebView2Environment* e) -> HRESULT {
            if (FAILED(result) || !e) {
                MessageBoxW(nullptr, L"WebView2 环境创建失败。", L"LinkDesk 安装", MB_ICONERROR);
                PostQuitMessage(2);
                return result;
            }
            auto onCtrl = new ComHandler<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler, ICoreWebView2Controller*>(
                IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,
                [exeDir](HRESULT result2, ICoreWebView2Controller* c) -> HRESULT {
                    if (FAILED(result2) || !c) { PostQuitMessage(2); return result2; }
                    g_controller = c;                      // 全局持有（见 g_controller 注释）
                    Microsoft::WRL::ComPtr<ICoreWebView2> web;
                    g_controller->get_CoreWebView2(&web);

                    // 资源加载：installer.local → exe 所在目录（避开 file:// 限制）
                    Microsoft::WRL::ComPtr<ICoreWebView2_3> web3;
                    web.As(&web3);
                    if (web3) web3->SetVirtualHostNameToFolderMapping(
                        kVHost, exeDir.c_str(),
                        COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);

                    // DevTools 仅 --debug 开启；debug 下自动弹出（验收证据）
                    Microsoft::WRL::ComPtr<ICoreWebView2Settings> settings;
                    web->get_Settings(&settings);
                    settings->put_AreDevToolsEnabled(g_debug ? TRUE : FALSE);
                    settings->put_AreDefaultContextMenusEnabled(g_debug ? TRUE : FALSE);
                    if (g_debug) {
                        Microsoft::WRL::ComPtr<ICoreWebView2_16> web16;
                        web.As(&web16);
                        if (web16) web16->OpenDevToolsWindow();
                    }

                    // 控件铺满客户区
                    RECT rc = {};
                    GetClientRect(g_hwnd, &rc);
                    g_controller->put_Bounds(rc);

                    // controller 建好前若已 WM_SETFOCUS，那次转交落空了：窗口仍在前台就补一次
                    if (GetForegroundWindow() == g_hwnd)
                        g_controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);

                    // 页面 → 宿主消息桥（页面只发极小的 JSON 串）：
                    //   {"type":"drag"}        → 无边框窗拖拽：页面发起的拖窗（WebView2 的鼠标
                    //                            消息到不了宿主 WndProc，孩子窗全吃掉）
                    //   {"type":"close"|"exit"|"uninstall-done"} → 关窗（细粒度分流归件 2c）
                    //   {"type":"install-start","dir":"...","opts":{...}} → 起安装
                    //       （件 2a；dir 缺省 = 解析出来的默认/上次目录；opts 四项见件 2b TaskOptions）
                    //   {"type":"install-done","launch":true} → 完成屏出口（件 2b：勾了「运行 LinkDesk」就拉起）
                    //   {"type":"browse-dir","dir":"..."} → 目录对话框（件 2b；回 `browse-dir-done`）
                    //   {"type":"set-lang","lang":"zh-CN"} → 语言持久化写侧（件 2b）
                    //   {"type":"cancel"} → 取消安装（件 2a；回滚归 2c）
                    auto onMsg = new ComHandlerEvt<ICoreWebView2WebMessageReceivedEventHandler,
                                                  ICoreWebView2, ICoreWebView2WebMessageReceivedEventArgs>(
                        IID_ICoreWebView2WebMessageReceivedEventHandler,
                        [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* a) -> HRESULT {
                            LPWSTR raw = nullptr;
                            if (!a || FAILED(a->TryGetWebMessageAsString(&raw)) || !raw) return S_OK;
                            std::wstring m(raw);
                            CoTaskMemFree(raw);
                            if (m.find(L"\"drag\"") != std::wstring::npos) {
                                POINT pt = {};
                                GetCursorPos(&pt);
                                ReleaseCapture();
                                SendMessageW(g_hwnd, WM_NCLBUTTONDOWN, HTCAPTION,
                                             MAKELPARAM(pt.x, pt.y));
                            } else if (m.find(L"\"install-start\"") != std::wstring::npos) {
                                // 件 2b：附加任务四项按页面勾选走。**缺字段取默认值，不是取 false**
                                //（页面键名 = data-opt 的四个；`editor` 就是 05 §4.3 的「编辑器注册」）
                                TaskOptions o = DefaultTaskOptions();
                                o.assoc    = JsonGetBool(m, L"editor",   o.assoc);
                                o.fileMenu = JsonGetBool(m, L"filemenu", o.fileMenu);
                                o.dirMenu  = JsonGetBool(m, L"dirmenu",  o.dirMenu);
                                o.path     = JsonGetBool(m, L"path",     o.path);
                                StartInstall(JsonGetString(m, L"dir"), o);
                            } else if (m.find(L"\"browse-dir\"") != std::wstring::npos) {
                                PickInstallDir(JsonGetString(m, L"dir"));
                            } else if (m.find(L"\"set-lang\"") != std::wstring::npos) {
                                // 件 2b：语言持久化**写侧**（读侧 1c 已通，见 ReadSavedLanguage）
                                std::wstring code = JsonGetString(m, L"lang");
                                if (!code.empty()) WriteInstallerLanguage(code);
                            } else if (m.find(L"\"cancel\"") != std::wstring::npos) {
                                CancelInstall();
                            } else if (m.find(L"\"install-done\"") != std::wstring::npos) {
                                // 完成屏「运行 LinkDesk」勾了才拉——装完就让人看见东西，别让他自己找图标
                                if (JsonGetBool(m, L"launch", false)) LaunchInstalledApp();
                                PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
                            } else if (m.find(L"\"close\"") != std::wstring::npos
                                       || m.find(L"\"exit\"") != std::wstring::npos
                                       || m.find(L"\"uninstall-done\"") != std::wstring::npos) {
                                PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
                            }
                            return S_OK;
                        });
                    web->add_WebMessageReceived(onMsg, nullptr);
                    onMsg->Release();

                    if (!g_capturePath.empty()) {
                        // ⚠️ 事件必须先于 Navigate 注册——本地页面秒完成，后注册会错过
                        // 真正落图延后到 WM_TIMER：i18n 是异步 fetch，立即拍会拍到中文/半动画帧
                        auto onNav = new ComHandlerEvt<ICoreWebView2NavigationCompletedEventHandler,
                                                       ICoreWebView2, ICoreWebView2NavigationCompletedEventArgs>(
                            IID_ICoreWebView2NavigationCompletedEventHandler,
                            [](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs*) -> HRESULT {
                                SetTimer(g_hwnd, kCaptureTimer, kCaptureDelayMs, nullptr);
                                return S_OK;
                            });
                        web->add_NavigationCompleted(onNav, nullptr);
                        onNav->Release();
                    }

                    // i18n（件 1c）：语言清单 = 扫 i18n/ 目录后经 ?langs= 注入；上次选择经 ?lang= 带出。
                    // --preview 里显式给了同名参数就让它赢（逐屏取图要定格清单与语言）
                    std::vector<std::wstring> codes =
                        g_previewQuery.find(L"langs=") != std::wstring::npos
                            ? std::vector<std::wstring>() : ScanI18nCodes(exeDir);
                    std::vector<std::wstring> params;
                    if (!g_previewQuery.empty()) params.push_back(g_previewQuery);
                    // 模式交给页面（选屏组/微尘数/窗口内视觉微调）；--preview 里显式给了 mode= 就让它赢
                    if (g_uninstall && g_previewQuery.find(L"mode=") == std::wstring::npos)
                        params.push_back(L"mode=uninstall");
                    if (!codes.empty()) {
                        std::wstring joined;
                        for (size_t i = 0; i < codes.size(); ++i) { if (i) joined += L","; joined += codes[i]; }
                        params.push_back(L"langs=" + joined);
                    }
                    if (g_previewQuery.find(L"lang=") == std::wstring::npos) {
                        std::wstring saved = ReadSavedLanguage();
                        if (!saved.empty()) params.push_back(L"lang=" + saved);
                    }
                    // 件 2a：自报家门（版本 + 目标目录）——完成屏/路径行要显示；
                    // payload=0 时页面进入「开发期裸壳」态（无载荷 ⇒ 装不了，按钮点了给明确错误）
                    if (g_previewQuery.find(L"ver=") == std::wstring::npos && g_hasPayload) {
                        std::wstring ver;
                        for (const char* p = g_payload.version; *p; ++p) ver += (wchar_t)(unsigned char)*p;
                        params.push_back(L"ver=" + UrlEnc(ver));
                    }
                    if (g_previewQuery.find(L"dir=") == std::wstring::npos) {
                        std::wstring dir = g_installDir;
                        if (dir.empty()) {
                            std::wstring existing = FindInstalledDir();
                            dir = existing.empty() ? DefaultInstallDir() : existing;
                        }
                        params.push_back(L"dir=" + UrlEnc(dir));
                    }
                    if (g_previewQuery.find(L"payload=") == std::wstring::npos)
                        params.push_back(g_hasPayload ? L"payload=1" : L"payload=0");
                    std::wstring startUrl = kStartUrl;
                    if (!params.empty()) {
                        startUrl += L"?";
                        for (size_t i = 0; i < params.size(); ++i) {
                            if (i) startUrl += L"&";
                            startUrl += params[i];
                        }
                    }
                    web->Navigate(startUrl.c_str());
                    return S_OK;
                });
            e->CreateCoreWebView2Controller(g_hwnd, onCtrl);
            onCtrl->Release();
            return S_OK;
        });
    CreateCoreWebView2EnvironmentWithOptions(
        nullptr, userData.c_str(), opts.Get(), onEnv);
    onEnv->Release();

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    CoUninitialize();
    // 单文件产品态：把摊出来的页面连同 .wv2data 一起清掉（dev 态 g_uiTempDir 为空，不动 out\uff09
    if (!g_uiTempDir.empty()) {
        g_controller.Reset();
        RemoveTree(g_uiTempDir);
    }
    return (int)msg.wParam;
}
