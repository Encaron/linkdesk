// LinkDesk Installer Bootstrapper — 件 1a 引导器壳（件 1c：i18n 目录枚举与上次语言带出）
// 规格：docs/04-软件更新/已落地/安装界面自绘/05-实现交接.md §4.2、§3.4
// C++ Win32 + WebView2：无边框窗（安装 780×570 ／卸载 720×540 逻辑像素）、Per-Monitor V2、
// VirtualHostMapping 加载 app.html、--debug 开 DevTools。UI 全部在 app.html/css/js（本文件只做窗口与宿主）。
// i18n：清单 = 扫 exe 旁 i18n/ 目录经 ?langs= 注入；上次选择 = 读 HKCU（写侧归件 2b）。
//
// 构建：build.cmd（vswhere → vcvars64 → rc → cl），产出 out\bootstrapper.exe

#include <windows.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <shobjidl.h>   // 件 2b：IFileOpenDialog（browse-dir 目录对话框）
#include <dwmapi.h>     // 件 2c：DWMWA_WINDOW_CORNER_PREFERENCE（Win11 原生圆角）
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
// 件 2c：进程守卫（运行中检测 ＋ 优雅关闭）
#include "procguard.h"

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "dwmapi.lib")

// ⚠️ `DWMWCP_ROUND` 是个 **enum**，不是宏 —— `#ifndef DWMWCP_ROUND` 恒为真（预处理器看不见枚举），
// 故这里自持字面量而不是抄符号名。值取自 dwmapi.h 的 DWMWINDOWCORNERPREFERENCE 公开枚举。
#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33   // 老 SDK 头上没有这个属性号
#endif
static const DWORD kDwmCornerRound = 2;     // DWMWCP_ROUND
static const DWORD kDwmCornerNone  = 1;     // DWMWCP_DONOTROUND（3d #2：透明后轮廓自己画，别让系统再切一刀）
static bool g_alphaOk = false;              // 件 3d-2：宿主侧三段（层/玻璃/透明底）全成才让页面翻透明，否则退回今天的样子

// ── 设计常量（05 §3.1：安装窗 780×570 逻辑像素；件 1d：卸载窗 720×540）────
static int kWinW = 780, kWinH = 570;
static bool g_uninstall = false;             // --uninstall（或双击副本）：自绘卸载器模式（页面拿到 ?mode=uninstall）
/** 卸载**真跑完**了（段 4 收尾校验通过）——自删闸的唯一扳机。
 *  🔴 0.2.35 的闸只有「g_uninstall ⇒ 退出即自删」，于是用户在帧 1 点 ✕（**什么都没做**）
 *  也把 INSTDIR 里的卸载器删了 ⇒ ARP 当场变死链（2026-10-02 实机 bug，台账 §三 #6）。 */
static bool g_uninstallDone = false;
static const wchar_t kVHost[] = L"installer.local";   // → exe 所在目录
static const wchar_t kStartUrl[] = L"https://installer.local/app.html";
/** 「许可协议」链接的去处（台账 §五 A：页面一直在发 `open-license`，宿主**从来没受理** ⇒ 死按钮）。
 *  指仓库根那份 LICENSE（MIT）。**用 `HEAD` 而不是写死分支名**——默认分支今天叫 electron
 *  （2026-10-02 用 GitHub API 核过：default_branch=electron、仓库 public、license=MIT），
 *  将来改名这个链接自己跟着走，不会烂。⛔ 别改成 raw.githubusercontent：浏览器里是纯文本，
 *  用户要的是能读的页面。 */
static const wchar_t kLicenseUrl[] = L"https://github.com/Encaron/linkdesk/blob/HEAD/LICENSE";

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
// --capture-delay=<ms>：覆盖上面的默认延时。取图工具要「动画跑完的定格帧」时用——
// 完成屏的彩粒（.burst）end time 实测 995–1665ms，1.2s 拍下去会拍到半空中的粒子，
// 与「桌面截屏等 4.2s」那批已验收图不一致（cmp-shots.ps1 因此显式传 -SettleMs）。
static UINT g_captureDelayMs = kCaptureDelayMs;

static void DoCapture();   // 定义在 ExeDir() 之后（WndProc 的 WM_TIMER 要用）

// 件 2a：工人线程 → UI 线程的自定义消息（WndProc 收，转成 postMessage 发进页面）
static const UINT WM_LK_PROGRESS = WM_APP + 1;   // wParam = 0–100
static const UINT WM_LK_FAILED   = WM_APP + 2;   // 取 g_lastErrCode / g_lastErrMsg
static const UINT WM_LK_CANCELED = WM_APP + 3;
static const UINT WM_LK_DONE     = WM_APP + 4;
static std::wstring g_lastErrCode, g_lastErrMsg;
static void StartInstall(const std::wstring& requestedDir, const TaskOptions& opts);   // 定义在 2a 段
static void CancelInstall();
static bool RollbackInstallDir();   // 件 2d：取消安装的回滚（定义在 2d 段，工人线程里调用）
static bool DirHasContent(const std::wstring& dir);   // 件 2d：装前目录判据（同上）
static void PostJson(const std::wstring& json);               // 定义在 2a 段（宿主 → 页面）
static std::wstring JsonEsc(const std::wstring& s);           // 定义在 2a 段（WndProc 要用）

// ── 件 2c · 关闭路由与版本守卫的宿主态 ─────────────────────────────────────
static const UINT_PTR kCloseWaitTimer = 2;         // 等 LinkDesk 自己退的轮询定时器（与取图定时器 1 分开）
static const UINT kCloseWaitMs = 10000;            // 05 §4.3：10s 超时回「稍后」
static DWORD g_closeWaitStart = 0;
/** 无边框窗没有系统 ✕ ⇒ ✕ / Alt+F4 / Esc 三路都先汇到页面（页面按当前屏分流：
 *  主屏直退 · 安装进度=取消回滚 · 卸载进度=吞掉 · 完成屏=等价完成）。
 *  本位置真 = 「页面已答复」或「宿主自己决定要关」⇒ WM_CLOSE 直通销毁，不再回问（防死循环）。 */
static bool g_closeAllowed = false;
/** 版本守卫：页面回过「仍要安装」后置真，本次进程内不再拦第二次。 */
static bool g_versionAck = false;
// ── 件 2d · 卸载态 ────────────────────────────────────────────────────────────
static volatile LONG g_unKeep = 1;   // 「保留我的数据」勾选态（onMsg 写，工人线程读；默认勾）
static volatile LONG g_unBusy = 0;   // 清理已开跑（帧 3 无取消，二次触发一律吞掉）
static void StartUninstall();        // 定义在件 2d 段（WM_TIMER 与 onMsg 都要用）

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
        if (wp == kCloseWaitTimer) {
            // 件 2c：等 LinkDesk 自己退（帧 2「关闭并继续」之后）。**不强杀**——超时就回「稍后」，
            // 用户自己关掉再点一次，或干脆取消卸载。
            if (!IsAppRunning()) {
                KillTimer(hwnd, kCloseWaitTimer);
                PostJson(L"{\"type\":\"uninstall-closed\"}");
                StartUninstall();   // 件 2d：对端退净 ⇒ 真正开清理（帧 3 的进度由此喂）
            } else if (GetTickCount() - g_closeWaitStart >= kCloseWaitMs) {
                KillTimer(hwnd, kCloseWaitTimer);
                PostJson(L"{\"type\":\"uninstall-close-timeout\"}");
            }
        }
        return 0;
    case WM_CLOSE:
        // 件 2c：三路汇一 —— Alt+F4 / SC_CLOSE / 任务栏「关闭窗口」都到这里。先问页面；
        // 页面按当前屏回 close / cancel / install-done，宿主真关时走 g_closeAllowed 那条。
        // 测试钩子 LK_IGNORE_CLOSE=1：本窗**拒绝**关闭 —— 「优雅关闭超时」路径要一个真的关不掉的
        // 对端才测得出来（与 LK_FORCE_NO_RUNTIME 同族的测试缝，产品运行不带）。
        {
            wchar_t ig[4] = {};
            if (GetEnvironmentVariableW(L"LK_IGNORE_CLOSE", ig, 4) > 0) return 0;
        }
        if (g_closeAllowed) { DestroyWindow(hwnd); return 0; }
        PostJson(L"{\"type\":\"close-request\"}");
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
        // 件 2d：wp = 1 已回滚干净（目录是我们这次建的/本来空的，已删）· 0 原样保留
        // （覆盖装——装前目录里就有旧版，删了会误伤；页面据此如实交代，见 app.js）
        PostJson(wp ? L"{\"type\":\"install-canceled\",\"rollback\":\"removed\"}"
                    : L"{\"type\":\"install-canceled\",\"rollback\":\"kept\"}");
        return 0;
    case WM_LK_DONE:
        // 件 2d：两种模式共用「工人收尾」这条消息，页面两套屏各认各的词
        PostJson(g_uninstall ? L"{\"type\":\"uninstall-finished\"}" : L"{\"type\":\"install-done\"}");
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

/** 宿主已决定关窗（完成屏出口 / 未写入阶段直退）：置放行位后走 WM_CLOSE，保留既有的
 *  WM_CLOSE → DestroyWindow → WM_DESTROY → PostQuitMessage 那条收尾链。 */
static void CloseWindowNow()
{
    if (!g_hwnd) return;
    g_closeAllowed = true;
    PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
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
static uint64_t     g_markerAt = 0;              // marker 偏移 ＝ 纯壳字节数（0 = 无载荷；卸载器自提取用）
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

/** 件 2d · 取消回滚的判据：**装前** INSTDIR 里有没有东西（在 CreateDirectoryW 之前取）。
 *  false = 目录不存在或是空的 ⇒ 取消时整树删掉（里面只可能是我们这次解压落的）；
 *  true  = 覆盖装（里头是旧版安装）⇒ 一个文件都不删——整树删会把旧装一起端掉（06 2d 格的设计题）。 */
static bool g_dirHadContent = false;

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
                g_markerAt = abs;
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

// ══════════════════════════════════════════════════════════════════════════
// 件 2c · 版本守卫（E6#42d 口径移植：同版/降级都问一句，默认取消）
//
// 【策略出处】`build/installer.nsh` 的 `customInit`——NSIS 版原话：「更旧和同版都问一句，
//   默认取消；静默 /S 不弹窗 ⇒ 设退出码 1602（= ERROR_INSTALL_USEREXIT）」。本格把**同一套政策**
//   搬到引导器；「本包更新 ⇒ 一个字都不多问」那条也照旧。
//
// 【比较用谁】NSIS 用的是 `${VersionCompare}`（标准头 WordFunc.nsh）；自绘后没有 NSIS ⇒ 按
//   05 §4.3「参照 `src/core/utils/plugin/semverUtils.ts`，**不搬运只对照**」重写一份**宽容**比较器：
//   忽略 v/V 前缀、缺位补 0、按 semver 预发布规则（release > prerelease；数字 < 字母）。
//   ⚠️ **方向决策不在这里**——主软件更新器的方向判定仍然只走 TS 那一处（E6#57.x），
//   本处是「覆盖前问一句」的第二道闸，不参与方向决策。
// ══════════════════════════════════════════════════════════════════════════

/** 数字段：非数字/空 → 0（宽容，与 semverUtils 的 `Number(seg)` 兜底同义） */
static int SemverNum(const std::wstring& seg)
{
    if (seg.empty()) return 0;
    wchar_t* end = nullptr;
    long v = wcstol(seg.c_str(), &end, 10);
    return (end && end != seg.c_str() && *end == L'\0') ? (int)v : 0;
}

/** 拆成「数字核心段」＋「预发布标识符」；hasPre = 有非空预发布段 */
static void SemverSplit(const std::wstring& v, std::vector<int>& core,
                        std::vector<std::wstring>& pre, bool& hasPre)
{
    std::wstring s = v;
    size_t b = s.find_first_not_of(L" \t");
    s = (b == std::wstring::npos) ? std::wstring() : s.substr(b);
    while (!s.empty() && (s.back() == L' ' || s.back() == L'\t')) s.pop_back();
    if (!s.empty() && (s[0] == L'v' || s[0] == L'V')) s.erase(s.begin());
    size_t dash = s.find(L'-');
    std::wstring corePart = dash == std::wstring::npos ? s : s.substr(0, dash);
    hasPre = dash != std::wstring::npos && dash + 1 < s.size();
    for (size_t i = 0; ; ) {                       // 核心段按 '.' 切（含超 3 段的宽容输入）
        size_t dot = corePart.find(L'.', i);
        core.push_back(SemverNum(corePart.substr(i, dot == std::wstring::npos ? std::wstring::npos : dot - i)));
        if (dot == std::wstring::npos) break;
        i = dot + 1;
    }
    if (hasPre) {
        std::wstring p = s.substr(dash + 1);
        for (size_t j = 0; ; ) {
            size_t dot = p.find(L'.', j);
            pre.push_back(p.substr(j, dot == std::wstring::npos ? std::wstring::npos : dot - j));
            if (dot == std::wstring::npos) break;
            j = dot + 1;
        }
    }
}

/** 预发布逐位比较（仅核心段全等时调用；数字 < 字母；数字按值、字母按 ASCII；前缀相同者字段少者小） */
static int ComparePrerelease(const std::vector<std::wstring>& a, const std::vector<std::wstring>& b)
{
    size_t len = a.size() > b.size() ? a.size() : b.size();
    for (size_t i = 0; i < len; ++i) {
        if (i >= a.size()) return -1;               // 1.0.0-alpha < 1.0.0-alpha.1
        if (i >= b.size()) return 1;
        bool na = !a[i].empty() && a[i].find_first_not_of(L"0123456789") == std::wstring::npos;
        bool nb = !b[i].empty() && b[i].find_first_not_of(L"0123456789") == std::wstring::npos;
        if (na && nb) {
            long va = wcstol(a[i].c_str(), nullptr, 10), vb = wcstol(b[i].c_str(), nullptr, 10);
            if (va != vb) return va > vb ? 1 : -1;
        } else if (na != nb) {
            return na ? -1 : 1;
        } else if (a[i] != b[i]) {
            return a[i] > b[i] ? 1 : -1;
        }
    }
    return 0;
}

/** 宽容 semver 比较：>0 = a 更新，<0 = a 更旧，0 = 同版（对照 semverUtils.compareVersions） */
static int CompareSemver(const std::wstring& a, const std::wstring& b)
{
    std::vector<int> ca, cb;
    std::vector<std::wstring> pa, pb;
    bool ha = false, hb = false;
    SemverSplit(a, ca, pa, ha);
    SemverSplit(b, cb, pb, hb);
    size_t len = ca.size() > cb.size() ? ca.size() : cb.size();
    for (size_t i = 0; i < len; ++i) {
        int na = i < ca.size() ? ca[i] : 0;         // 缺位补 0（0.2 == 0.2.0）
        int nb = i < cb.size() ? cb[i] : 0;
        if (na != nb) return na > nb ? 1 : -1;
    }
    if (!ha && !hb) return 0;
    if (!ha) return 1;                              // release > 带 prerelease
    if (!hb) return -1;
    return ComparePrerelease(pa, pb);
}

/** 守卫三态：Allow = 放行（本包更新 / 无旧版可比）；Same / Older = 要问一句 */
enum class GuardVerdict { Allow, Same, Older };

/** 已装版本（守卫用）。测试缝 `LK_GUARD_ASSUME_VERSION` 覆盖 ARP 读数——「本包更新 ⇒ 放行」
 *  这条在真机上要换一份 ARP 才测得出来，而 2c 不为此改用户注册表（与 LK_FORCE_NO_RUNTIME 同族）。 */
static std::wstring InstalledVersionForGuard()
{
    wchar_t buf[64] = {};
    if (GetEnvironmentVariableW(L"LK_GUARD_ASSUME_VERSION", buf, 64) > 0 && buf[0])
        return std::wstring(buf);
    return ReadInstalledVersion();
}

static GuardVerdict VersionGuard(const std::wstring& installed, const std::wstring& incoming)
{
    // 无旧版可比（全新装 / 刚卸载过 / 老安装路径没写过 DisplayVersion）⇒ 放行。宁可不拦，不许误拦。
    if (installed.empty() || incoming.empty()) return GuardVerdict::Allow;
    int cmp = CompareSemver(incoming, installed);
    if (cmp > 0) return GuardVerdict::Allow;
    return cmp == 0 ? GuardVerdict::Same : GuardVerdict::Older;
}

/** 版本守卫的**页面出口**：把结论发进页面（页面用 error 骨架的确认屏问一句）。 */
static void PostVersionGuard(GuardVerdict v)
{
    PostJson(L"{\"type\":\"version-guard\",\"kind\":\""
             + std::wstring(v == GuardVerdict::Same ? L"same" : L"older")
             + L"\",\"installed\":\"" + JsonEsc(InstalledVersionForGuard())
             + L"\",\"incoming\":\"" + JsonEsc(PayloadVersion()) + L"\"}");
}

/** 件 2c · 路径预检（02 §三「换路径入口」的就近面）。返回空串 = 可用，否则是页面认得的 reason 码。
 *  只做**宿主才做得了**的那部分（建目录 ＋ 真写一次探针文件）；语法部分（非法字符 / 过长 / 盘根）
 *  由页面**即时**拦（app.js 的 pathSyntaxError）——按键就出结果，不必等一次往返。 */
static std::wstring ValidateInstallDir(const std::wstring& dir)
{
    if (dir.empty()) return L"empty";
    if (dir.size() >= MAX_PATH - 12) return L"length";
    if (dir.size() >= 2 && dir[1] == L':'
        && (dir.size() == 2 || (dir.size() == 3 && (dir[2] == L'\\' || dir[2] == L'/'))))
        return L"root";                             // 盘根：7zr 会把整盘当目标铺开
    if (!CreateDirectoryW(dir.c_str(), nullptr) && GetLastError() != ERROR_ALREADY_EXISTS)
        return L"write";
    // 建目录成功 ≠ 可写（目录可能早就存在且只读）——真写一个探针文件再删掉
    std::wstring probe = dir + L"\\.linkdesk-wtest";
    HANDLE h = CreateFileW(probe.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_TEMPORARY, nullptr);
    if (h == INVALID_HANDLE_VALUE) return L"write";
    CloseHandle(h);
    DeleteFileW(probe.c_str());
    return std::wstring();
}

/** 无界面安装（--silent ／ /S）——更新链那条路。**不建窗、不碰 WebView2**：
 *  自动更新不该因为「运行时缺失」而装不上（缺运行时是能用界面的问题，不是装不上的问题）。 */
/** 卸载/安装工人共用的诊断落点（LK_TRACE=<path>，见 UninstallWorker 开头的说明）。 */
static void TraceLine(const std::wstring& line)
{
    wchar_t tp[MAX_PATH] = {};
    if (GetEnvironmentVariableW(L"LK_TRACE", tp, MAX_PATH) <= 0) return;
    HANDLE f = CreateFileW(tp, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
                           nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) return;
    SYSTEMTIME st = {};
    GetLocalTime(&st);
    wchar_t ts[40] = {};
    swprintf(ts, 40, L"[%02d:%02d:%02d.%03d] ", st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
    std::wstring l = std::wstring(ts) + line + L"\r\n";
    std::string u(l.size() * 3, '\0');
    int n = WideCharToMultiByte(CP_UTF8, 0, l.c_str(), (int)l.size(), u.data(), (int)u.size(), nullptr, nullptr);
    DWORD w = 0;
    WriteFile(f, u.data(), n, &w, nullptr);
    CloseHandle(f);
}

static int RunSilentInstall()
{
    if (!g_hasPayload) return 4;                       // 拿开发壳当安装包跑：如实失败
    if (g_installDir.empty()) g_installDir = DefaultInstallDir();

    // 件 2c · 版本守卫（静默）：**不弹窗**（没有人点会挂死）⇒ 按「用户取消了」办，退 1602
    // （= ERROR_INSTALL_USEREXIT）。自动更新的方向永远是升级 ⇒ 不受影响；真要人工降级
    // ⇒ 先卸载再装（卸载删掉 ARP 键 ⇒ 无旧版可比 ⇒ 放行）——与 NSIS 版同一条刻意留的正路。
    // ⚠️ 排在 CreateDirectoryW 之前：被拦下时**一个字节都没动**。
    if (VersionGuard(InstalledVersionForGuard(), PayloadVersion()) != GuardVerdict::Allow) return 1602;

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
    PurgeLegacyUninstallArtifacts(g_installDir);   // 台账 §三 #4：清旧命残影（覆盖装时；≤8MB 才动）
    bool unCopyOk = InstallUninstallerCopy(g_selfPath, g_installDir, g_markerAt);   // 件 2d：ARP 指的卸载器
    TraceLine(L"[install] uninstaller-copy ok=" + std::wstring(unCopyOk ? L"1" : L"0")
              + L" dst=" + g_installDir + L"\\" + UninstallerExeName());
    WriteArpEntry(g_installDir, PayloadVersion());
    TraceLine(L"[install] arp written; silent install done");
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
    if (g_canceled.load()) {
        // 件 2d · 取消的回滚：清掉这次解压落进 INSTDIR 的文件。**必须排在这里**——此刻系统项
        // 一个都没写（提交点在下面），机器上唯一的痕迹就是这些文件，能干净退回装前状态。
        bool removed = RollbackInstallDir();
        g_phase = Phase::Idle;      // 放行下一次重试；否则 StartInstall 开头的早退会静默吞掉它
        PostMessageW(g_hwnd, WM_LK_CANCELED, removed ? 1 : 0, 0);
        CoUninitialize();
        return;
    }
    if (!err.empty()) {
        g_lastErrCode = L"EXTRACT_FAILED";
        g_lastErrMsg = err;
        g_phase = Phase::Idle;
        PostMessageW(g_hwnd, WM_LK_FAILED, 0, 0);
        CoUninitialize();
        return;
    }
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 70, 0);
    // 🔴 **提交点**（件 2d）：解压成功 ⇒ 这次安装不再受理取消。此后写的全是注册表/快捷方式/
    //    PATH/ARP，而**写了一半的注册表没有回滚可言**。原先段 2/3 后面那两个取消检查点，实际效果是
    //    「取消掉一个已经写进系统的安装」（页面回主屏、机器上关联却留着），比不响应更糟 ⇒ 撤掉。
    //    取消的语义就此收窄为「解压阶段可取消，且取消即清干净」（与 NSIS 的取消同位）。

    // E6#45 四项按勾选写。**单项失败不中断、也不把整次安装判死**——应用文件已经落地，
    // 某个关联没写上不该让用户看到「安装失败」（那会把人吓去重装，越弄越糟）。
    // 结果照 05 §4.3「一项失败不中断」留痕到调试输出（落点在段 4），供排障。
    bool sysOk = true;

    // 段 2（70–80）：注册文件关联——ProgId ＋ 13 个扩展的「打开方式」候选 ＋ 能力声明。
    //   ⚠️ 本段原设计写的是「注册 linkdesk:// 协议」，但产品里既没有这个注册、也处理不了
    //   该协议（2026-10-01 全仓 grep 零命中 ＋ 实机现装 NSIS 版也没有这条键）⇒ 2026-10-02
    //   用户拍板**撤掉这项承诺**：文案与实现同改成真实存在的这段工作（不再空跑）。
    if (g_opts.assoc) sysOk &= WriteAssociations(g_installDir);
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 80, 0);

    // 段 3（80–92）：写系统项（右键菜单 · 快捷方式 · PATH · ARP）
    sysOk &= WriteContextMenus(g_installDir, g_opts.fileMenu, g_opts.dirMenu);
    if (g_opts.path) sysOk &= AddToPath(g_installDir);
    sysOk &= CreateShortcuts(g_installDir);
    // 台账 §三 #4：清 0.2.34/0.2.35 留下的旧命残影（`linkdesk-setup.exe` 副本 ＋ 旧开始菜单卸载项）
    sysOk &= PurgeLegacyUninstallArtifacts(g_installDir);
    // 件 2d：把壳自己提取成 `<INSTDIR>\uninstall.exe`（ARP UninstallString 指向的那份
    // 卸载器）——**必须排在 WriteArpEntry 之前**，ARP 的键值与 EstimatedSize 都要算上它
    bool unCopyOk = InstallUninstallerCopy(g_selfPath, g_installDir, g_markerAt);
    // 🔴 这一步失败原先只落 OutputDebugStringW（无痕）⇒ 卸载入口静默变死链而没人知道。
    //    现在留一行 LK_TRACE 台账（桌面「装完找不到卸载入口」那类报修先看它，台账 §三 #6）。
    TraceLine(L"[install] uninstaller-copy ok=" + std::wstring(unCopyOk ? L"1" : L"0")
              + L" dst=" + g_installDir + L"\\" + UninstallerExeName());
    sysOk &= unCopyOk;
    sysOk &= WriteArpEntry(g_installDir, PayloadVersion());
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 92, 0);

    // 段 4（92–100）：收尾校验——**成败只看文件是否落地**（系统项是「加分项」不是「必需项」）
    bool ok = VerifyInstall();
    if (!sysOk) OutputDebugStringW(L"[installer] 部分系统项未写入（关联/右键/PATH/快捷方式/ARP）\n");
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 100, 0);
    g_phase = Phase::Idle;                  // 收尾（成/败）都要放行重来，见上面取消段的注
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

    // 件 2c · 版本守卫（界面态）：同版/降级先问一句，默认取消；页面回过「仍要安装」才放行。
    // ⚠️ 与静默路同一份政策（VersionGuard），只是出口不同：这里发确认屏，那边退 1602。
    // ⚠️ 排在 CreateDirectoryW 之前 —— 被拦下时一个字节都没动（连目录都不建）。
    if (!g_versionAck) {
        GuardVerdict gv = VersionGuard(InstalledVersionForGuard(), PayloadVersion());
        if (gv != GuardVerdict::Allow) { PostVersionGuard(gv); return; }
    }

    // 件 2c · 路径预检 —— 语法由页面即时拦，能落地才走到这里；宿主这里管「建得出来 / 写得进去」。
    // 失败回 `dir-invalid`：页面**就近显示在路径行下**（规格 05 §4.3：不改全局错误屏语义）。
    std::wstring bad = ValidateInstallDir(g_installDir);
    if (!bad.empty()) {
        PostJson(L"{\"type\":\"dir-invalid\",\"reason\":\"" + bad + L"\"}");
        return;
    }
    // 件 2d：取消回滚的判据**必须在建目录之前取**——建完再问，得到的永远是「有内容」。
    g_dirHadContent = DirHasContent(g_installDir);
    CreateDirectoryW(g_installDir.c_str(), nullptr);
    g_phase = Phase::Extracting;
    std::thread(InstallWorker).detach();
}

/** 取消（**只对解压阶段有效**，件 2d）：置取消位 ＋ 终止我们自己拉起的 7zr
 *  （**不是**去杀 LinkDesk——那条路的禁令见 §4.3）。真回滚在工人线程里做
 *  （InstallWorker 收工前的 RollbackInstallDir）——本函数在 UI 线程，只置位，不许阻塞。
 *  过了提交点（解压完，见 InstallWorker）之后再来的取消一律吞掉：那以后写的全是系统项，没法回滚。 */
static void CancelInstall()
{
    g_canceled = true;
    if (g_child) TerminateProcess(g_child, 1);
}

// ════════════════════════ 件 2d · 自绘卸载器 ════════════════════════════════
// 四段进度（阈值 60/80/92，与 1d 的帧 3 文案/分段对齐）：
//   段 1（0–60）移除程序文件（keep=false 时 userData 一并删）→ 段 2（60–80）清理系统项
//   （右键三键 · 编辑器注册 · 快捷方式 · ARP）→ 段 3（80–92）恢复 PATH（精确匹配）
//   → 段 4（92–100）收尾校验（无残留）；**卸载器自删**在进程退出后由子进程收尾（05 §4.3）。
// 清理清单 = syswrite 的卸载侧（逐条照抄 installer.nsh customUnInstall，出处见 syswrite.h）。

struct TreeStat { long long total = 0, done = 0; };

static long long CountFiles(const std::wstring& dir, const std::wstring& skip)
{
    WIN32_FIND_DATAW fd = {};
    HANDLE h = FindFirstFileW((dir + L"\\*").c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) return 0;
    long long n = 0;
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        std::wstring p = dir + L"\\" + fd.cFileName;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            n += CountFiles(p, skip);
        } else if (skip.empty() || _wcsicmp(p.c_str(), skip.c_str()) != 0) {
            ++n;
        }
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    return n;
}

/** 递归删目录树（跳过 skip = 自己那份 exe，退出后子进程收），按「完成文件数 / 总数」回报进度。
 *  单个文件删不掉（被占用/权限）**不中断**——清理要尽力走完，跟安装侧「一项失败不中断」同口径。
 *  report=false：不往页面发进度（取消回滚用——那一刻页面已经回主屏，发进度只会打乱它的读数）。 */
static void WipeTree(const std::wstring& dir, const std::wstring& skip, TreeStat& st,
                     int pctFrom, int pctTo, bool report = true)
{
    WIN32_FIND_DATAW fd = {};
    HANDLE h = FindFirstFileW((dir + L"\\*").c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) return;
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        std::wstring p = dir + L"\\" + fd.cFileName;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            // ⚠️ `report` 必须**透传**给递归——少传这一个参数，子目录里的文件删除会退回默认
            //    report=true 继续发进度（2026-10-02 实测踩过：取消回滚发了 10 条 pct:0，
            //    把页面的「只前进不倒退」读数打乱。是路 5a 的日志逐行读出来的）。
            WipeTree(p, skip, st, pctFrom, pctTo, report);
            RemoveDirectoryW(p.c_str());
        } else {
            if (!skip.empty() && _wcsicmp(p.c_str(), skip.c_str()) == 0) continue;
            SetFileAttributesW(p.c_str(), FILE_ATTRIBUTE_NORMAL);
            if (DeleteFileW(p.c_str())) ++st.done;
            if (report && st.total > 0 && g_hwnd)
                PostMessageW(g_hwnd, WM_LK_PROGRESS,
                             pctFrom + (int)((pctTo - pctFrom) * st.done / st.total), 0);
        }
    } while (FindNextFileW(h, &fd));
    FindClose(h);
}

/** 装前目录里有没有东西（件 2d · 取消回滚的判据）：不存在 / 空目录 ⇒ false，有内容 ⇒ true。
 *  只回答一件事：取消时能不能把 INSTDIR 整树删掉。用 FindFirstFileW 而不是
 *  PathIsDirectoryEmptyW——后者对「存在但不是目录」的路径给的是别的错，这里一律当「没内容」。 */
static bool DirHasContent(const std::wstring& dir)
{
    if (GetFileAttributesW(dir.c_str()) == INVALID_FILE_ATTRIBUTES) return false;
    WIN32_FIND_DATAW fd = {};
    HANDLE h = FindFirstFileW((dir + L"\\*").c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) return false;
    bool any = false;
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        any = true;
        break;
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    return any;
}

/** 件 2d · 取消安装的回滚：清掉这次解压落进 INSTDIR 的文件，让机器退回装前状态。
 *  🔴 **只在「装前目录不存在或为空」时动手**（g_dirHadContent 是建目录之前取的）——覆盖装时
 *  目录里是**旧版安装**的文件，整树删会连旧装一起端掉（06 2d 格的设计题）。那种情况返回 false，
 *  由页面如实交代「原目录已保留，本次解压的文件可能覆盖了其中一部分」。
 *  ⚠️ 在工人线程里调用（7zr 已终止、没有任何句柄开着）；UI 线程的 CancelInstall 只置位不做事。 */
static bool RollbackInstallDir()
{
    if (g_installDir.empty() || g_dirHadContent) return false;
    TreeStat st;
    st.total = CountFiles(g_installDir, L"");
    WipeTree(g_installDir, L"", st, 0, 0, false);
    RemoveDirectoryW(g_installDir.c_str());   // 目录本身也是我们这次建的，一并收掉
    TraceLine(L"[install] 取消回滚 done=" + std::to_wstring(st.done) + L"/" + std::to_wstring(st.total));
    return true;
}

static void UninstallWorker(bool keep)
{
    // （诊断落点 TraceLine 见 RunSilentInstall 上方：LK_TRACE=<path> ⇒ 工人每阶段落一行。
    //   静默态没有窗，PostJson/WM_LK_* 全是哑的，工人「走到哪、为何被闸」必须有地方看。）

    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    // 段 1（0–60）：移除程序文件。目标 = 本 exe 所在目录（卸载器就装在 INSTDIR）；
    // 拿不到再退 ARP（ReadInstalledDir）。进程关闭在帧 2 已经做完（优雅关，procguard）。
    std::wstring dir = ExeDir();
    if (dir.empty() || GetFileAttributesW(dir.c_str()) == INVALID_FILE_ATTRIBUTES)
        dir = ReadInstalledDir();
    // 🔴 目标体检（syswrite-test 路闸同一家法：宁可不动手，不许误删）——**只有这里真是
    // 安装目录才碰机器**，判据 = 目录里有 LinkDesk.exe（与 VerifyInstall 同一条）。
    // 开发壳的 out\（bootstrapper.exe 旁只有 app.html）、下载夹里的裸 setup.exe 都过不了
    // 这道闸 ⇒ 只把四段进度演完（流程/验收缝可用），一个文件、一条注册表都不碰。
    bool legit = DirLooksInstalled(dir);
    TraceLine(L"[uninstall] dir=" + dir + L" legit=" + (legit ? L"1" : L"0") + L" keep=" + (keep ? L"1" : L"0"));
    if (!legit) {
        OutputDebugStringW(L"[installer] 卸载中止：本目录不是安装目录（无 LinkDesk.exe）——只走流程，不删任何东西\n");
        if (g_hwnd) {
            PostMessageW(g_hwnd, WM_LK_PROGRESS, 60, 0);
            PostMessageW(g_hwnd, WM_LK_PROGRESS, 80, 0);
            PostMessageW(g_hwnd, WM_LK_PROGRESS, 92, 0);
            PostMessageW(g_hwnd, WM_LK_PROGRESS, 100, 0);
            PostMessageW(g_hwnd, WM_LK_DONE, 0, 0);
        }
        CoUninitialize();
        return;
    }
    TreeStat st;
    if (!dir.empty()) {
        st.total = CountFiles(dir, g_selfPath);
        WipeTree(dir, g_selfPath, st, 2, 55);
    }
    TraceLine(L"[uninstall] 程序文件移除完成 done=" + std::to_wstring(st.done) + L"/" + std::to_wstring(st.total));
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 56, 0);
    // 「保留我的数据」没勾：userData（%APPDATA%\linkdesk，**小写**——Electron 取 package.json
    // 的 name）整目录删。这一步排在进程优雅关闭之后（02 §二幕⑨）。
    if (!keep) {
        std::wstring ud = UserDataDir();
        TreeStat us;
        us.total = CountFiles(ud, L"");
        WipeTree(ud, L"", us, 56, 59);
    }
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 60, 0);

    // 段 2（60–80）：清理系统项（右键三键 · 编辑器注册 · 快捷方式 · ARP）
    DeleteContextMenus();
    DeleteAssociations();
    DeleteShortcuts();
    DeleteArpEntry();
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 80, 0);

    // 段 3（80–92）：恢复 PATH（精确匹配才动，不碰用户改过的部分）
    bool touched = false;
    RestorePath(&touched);
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 92, 0);

    // 段 4（92–100）：收尾校验（无残留）——判据 = ARP 键已消失（ReadInstalledVersion 空）。
    // 校验失败也不拦收场（残留如实留在机器上，比卡死在 99% 强）；自删在退出后由子进程做。
    bool ok = ReadInstalledVersion().empty();
    if (!ok) OutputDebugStringW(L"[installer] 卸载收尾校验：ARP 键仍在（删除失败？）\n");
    TraceLine(std::wstring(L"[uninstall] 收尾校验 arp-gone=") + (ok ? L"1" : L"0")
              + L" selfdelete=" + (ok ? L"1" : L"0"));
    // 🔴 自删闸的扳机（SpawnSelfDelete 第三道闸）：只有走到这儿且校验通过，退出时才许可删自己。
    //    体检没过的早退分支（上面 legit=false）不置位 ⇒ 那种「只走流程」的卸载也不自删。
    g_uninstallDone = ok;
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_PROGRESS, 100, 0);
    if (g_hwnd) PostMessageW(g_hwnd, WM_LK_DONE, 0, 0);
    CoUninitialize();
}

static void StartUninstall()
{
    // 帧 3 无取消（E-卸载屏 设计点③）：开跑之后再来的触发一律吞掉
    if (InterlockedExchange(&g_unBusy, 1) != 0) return;
    bool keep = g_unKeep != 0;
    std::thread(UninstallWorker, keep).detach();
}

/** 无界面卸载（ARP `QuietUninstallString = … --uninstall /S`）。不建窗、不碰 WebView2。
 *  🔴 keep 恒 = true：**静默通道永不删用户数据**（02 §二幕⑨「现状行为显性化：NSIS 卸载
 *  从不碰 userData」）——删数据必须是用户在界面上亲眼确认过的那一次。 */
static int RunSilentUninstall()
{
    HRESULT hrCom = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    UninstallWorker(true);
    if (SUCCEEDED(hrCom)) CoUninitialize();
    return 0;
}

/** g_selfPath 的文件名是不是 name（大小写不敏感）——「本进程是不是 INSTDIR 里那份卸载器副本」
 *  的唯一判据，wWinMain（双击即卸载）与 SpawnSelfDelete（自删闸①）共用。 */
static bool SelfBaseNameIs(const wchar_t* name)
{
    const wchar_t* base = g_selfPath.c_str();
    for (const wchar_t* q = g_selfPath.c_str(); *q; ++q)
        if (*q == L'\\' || *q == L'/') base = q + 1;
    return _wcsicmp(base, name) == 0;
}

/** 卸载器自删（05 §4.3：子进程 `cmd /c ping -n 2 … & del <自身>`）。
 *  🔴 三道闸，缺一条都会出事：
 *   ① 名 = `uninstall.exe`（写侧 `UninstallerExeName()` 那一份）——开发壳 bootstrapper.exe、
 *      测试动过的副本一律不删，否则测试一次就把 out\ 自己端了；
 *   ② 本进程**没有 7z 载荷**——用户手里的安装包本体（不管叫什么名）绝不删；
 *   ③ `g_uninstallDone`——**只有卸载真跑完**才删。用户点 ✕（帧 1/2 退出、一个字节都没写）
 *      不许删：0.2.35 漏的正是这道闸，实机一按 ✕ 卸载入口就没了（台账 §三 #6）。
 *  ping 延时给本进程留出退出时间；rd 只收已空的目录。 */
static void SpawnSelfDelete()
{
    if (!SelfBaseNameIs(UninstallerExeName())) return;
    if (g_hasPayload) return;
    if (!g_uninstallDone) return;
    std::wstring cmd = L"cmd.exe /c ping -n 3 127.0.0.1 >nul & del /f /q \"" + g_selfPath
                     + L"\" & rd /q \"" + ExeDir() + L"\"";
    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {};
    if (CreateProcessW(nullptr, cmd.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
                       nullptr, nullptr, &si, &pi)) {
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
    }
}

// ── UI 资源根（件 2a）：单文件安装包旁边没有 app.html，页面必须从内嵌资源摊出来 ────
// id 契约与 tools/gen-ui-rc.mjs 同一份：3 = 清单（UTF-8 文本，每行 `id<TAB>相对路径`），10+ = 文件本体。
static const int kUiManifestRes = 3;
static const int kUiFileResBase  = 10;
static std::wstring g_uiTempDir;   // 摊出来的临时目录（dev 态为空 = 退出时不用清）

/** 删一遍目录树；返回 false = 还有没删掉的（交给外面重试）。 */
static bool RemoveTreeOnce(const std::wstring& dir)
{
    if (GetFileAttributesW(dir.c_str()) == INVALID_FILE_ATTRIBUTES) return true;   // 不存在 = 已达成
    bool allOk = true;
    WIN32_FIND_DATAW fd = {};
    HANDLE h = FindFirstFileW((dir + L"\\*").c_str(), &fd);
    if (h != INVALID_HANDLE_VALUE) {
        do {
            if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
            std::wstring p = dir + L"\\" + fd.cFileName;
            if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
                if (!RemoveTreeOnce(p)) allOk = false;
            } else {
                SetFileAttributesW(p.c_str(), FILE_ATTRIBUTE_NORMAL);
                if (!DeleteFileW(p.c_str())) allOk = false;
            }
        } while (FindNextFileW(h, &fd));
        FindClose(h);
    }
    if (!RemoveDirectoryW(dir.c_str()) && GetLastError() != ERROR_FILE_NOT_FOUND) allOk = false;
    return allOk;
}

/** 递归删目录（退出时清临时 UI）。
 *  🔴 **带回试**（台账 §五 H 实机所见）：退出瞬间 msedgewebview2.exe 还在退场，摊出来的
 *     app.* / fonts 被占着 ⇒ 原来那种"删一遍就不管"会让 `%TEMP%\linkdesk-bootstrapper-<pid>`
 *     成片留下。现在：删不干净就 `Sleep` 200ms 再来，最多 10 次（2s 窗口）。
 *  ⛔ **不要**为此去枚举/等待 `msedgewebview2.exe` 进程——那等于把清理绑死在别人的进程名上，
 *     WebView2 一改名/一换实现就烂；「重试几秒，还不行算了」自己能好（%TEMP% 系统会回收）。 */
static void RemoveTree(const std::wstring& dir)
{
    for (int i = 0; i < 10; ++i) {
        if (RemoveTreeOnce(dir)) return;
        Sleep(200);
    }
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

    // 台账 §五 H：**先清旧、再建新**。历史版本的"删一遍不管"在 %TEMP% 里攒下一堆
    // linkdesk-bootstrapper-<pid>；新 pid 与它们不同名，只清自己那条是扫不到的。
    // 这里把同前缀的都清一遍（别的安装器实例正在用？句柄被占 ⇒ 删不掉就跳过，不阻塞本次安装）。
    std::wstring base = TempBase();
    WIN32_FIND_DATAW sf = {};
    HANDLE sh = FindFirstFileW((base + L"\\linkdesk-bootstrapper-*").c_str(), &sf);
    if (sh != INVALID_HANDLE_VALUE) {
        do {
            if (sf.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) RemoveTree(base + L"\\" + sf.cFileName);
        } while (FindNextFileW(sh, &sf));
        FindClose(sh);
    }
    std::wstring dir = base + L"\\linkdesk-bootstrapper-" + std::to_wstring(GetCurrentProcessId());
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
        if (wcsncmp(argv[i], L"--capture-delay=", 16) == 0) {
            int ms = _wtoi(argv[i] + 16);
            if (ms > 0) g_captureDelayMs = (UINT)ms;   // 非法值静默保持默认，取图口不值得为它报错
        }
        if (wcsncmp(argv[i], L"--preview=", 10) == 0) g_previewQuery = argv[i] + 10;
        if (wcsncmp(argv[i], L"--log=", 6) == 0) g_logPath = argv[i] + 6;
    }
    if (argv) LocalFree(argv);

    g_selfPath = [] { wchar_t p[MAX_PATH] = {}; GetModuleFileNameW(nullptr, p, MAX_PATH); return std::wstring(p); }();
    g_hasPayload = FindPayload();

    // 🔴 双击即卸载（2026-10-03 用户拍板，台账 §三 #4 改判）：INSTDIR 里那份副本就叫
    //    `uninstall.exe`，**用户双击它、不带任何参数**，必须直接进我们自绘的卸载界面
    //    （老卸载体验就是「点开就有界面」——不能要求用户自己会加开关）。
    //    判据两条**都要**：① 文件名 = `uninstall.exe`（UninstallerExeName() 那份，唯一真相源）
    //    ② 本进程**没有 7z 载荷**（纯壳副本才够格；用户手里的安装包哪怕改名成这个，有载荷 ⇒ 照旧当安装包）。
    //    ⚠️ 必须在 FindPayload 之后判（② 就是它），也必须排在下面所有 g_uninstall 分支之前。
    if (!g_uninstall && !g_hasPayload && SelfBaseNameIs(UninstallerExeName())) g_uninstall = true;
    if (g_uninstall) { kWinW = 720; kWinH = 540; }   // 卸载窗比安装窗略小（E-卸载屏 mockup）

    // 件 2d：静默卸载（ARP「应用和功能」的静默卸载 = QuietUninstallString `--uninstall /S`）。
    // 不建窗、不碰 WebView2；keep 恒 true（静默永不删用户数据，见 RunSilentUninstall）。
    if (g_silent && g_uninstall) {
        int rc = RunSilentUninstall();
        SpawnSelfDelete();
        return rc;
    }
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
    // 件 2c：Win11 原生圆角。无边框窗（WS_POPUP）系统不给圆角，画出来的四角是直角，
    // 和自绘界面里那一圈 12px 圆角对不上。⚠️ Win10 及更老没有这个属性号 ⇒ DwmSetWindowAttribute
    // 返 E_INVALIDARG，**忽略即可**（那边本来就该是直角，不退回自绘圆角）。
    // 件 3d-2（3d #2）后：这一档只在「WebView2 透明没做成」时还起作用——真透明成事时会翻成
    // DONOTROUND（见下方 onCtrl 那段），轮廓交给页面里 .shell 的 32px 弧线。
    {
        DWORD pref = kDwmCornerRound;
        DwmSetWindowAttribute(g_hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &pref, sizeof(pref));
    }
    // 件 3d-2（3d #2，用户 2026-10-02「可以改」）：把真窗口做成逐像素透明——窗口轮廓改由页面里
    // .shell 的 32px 弧线决定 ⇒ 系统那圈 ≈8px 小圆角（DWMWCP_ROUND，半径不可设）与它露出的 --desk
    // 灰楔形一并消失。配方＝DWM「一块玻璃」：WS_EX_LAYERED ＋ 整体 alpha 255（不做整体降透明）
    // ＋ 边框延伸到整个客户区（-1,-1,-1,-1）。**另一半在 WebView2 侧**（put_DefaultBackgroundColor
    // 全透明，见 onCtrl 那段）——缺任何一半，客户区都是实心白。
    // ⚠️ 无边框窗本来就没有系统阴影，透明后依旧没有（评审页那层阴影是页面自己加的参照，不是真机行为）。
    // ⚠️ 窗外那圈透明楔形仍会吃鼠标点击（LWA_ALPHA 不做点击穿透；穿透要 LWA_COLORKEY，会啃烂抗锯齿的弧线）。
    {
        SetWindowLongPtrW(g_hwnd, GWL_EXSTYLE, GetWindowLongPtrW(g_hwnd, GWL_EXSTYLE) | WS_EX_LAYERED);
        BOOL layered = SetLayeredWindowAttributes(g_hwnd, 0, 255, LWA_ALPHA);
        MARGINS mg = {-1, -1, -1, -1};
        // 三段都必须成：任何一段失败 ⇒ g_alphaOk 保持 false，页面那边就不翻透明、原样退回（不透明＋系统圆角）。
        // 只信返回值、不信「调过就算」——半成状态下页面若先翻了透明，客户区会露出未绘制像素（黑角），比现状难看。
        g_alphaOk = (layered != FALSE) &&
                    SUCCEEDED(DwmExtendFrameIntoClientArea(g_hwnd, &mg));
    }
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

                    // 件 3d-2（3d #2）：WebView2 底色全透明——逐像素 alpha 的另一半（窗体那半见
                    // CreateWindowEx 之后那段）。**两半都成**才给页面挂 data-alpha：app.css 那段据此把
                    // --desk 画进 .frame 的 32px 弧内、窗外留透明，并把系统圆角关掉（轮廓已由页面自己画）。
                    // 缺任一半（老 WebView2 运行时/老 SDK/层或玻璃没设上）什么都不动 ⇒ 页面保持今天的
                    // 不透明样子（qw 已铺满整窗，窗前只多一圈透明楔形）：不白不黑，不退回坏相。
                    if (c && g_alphaOk) {
                        Microsoft::WRL::ComPtr<ICoreWebView2Controller2> c2;
                        if (SUCCEEDED(c->QueryInterface(IID_PPV_ARGS(c2.GetAddressOf()))) && c2) {
                            COREWEBVIEW2_COLOR clear = {0, 0, 0, 0};   // A=0 ⇒ 全透明（结构体序是 A/R/G/B）
                            if (SUCCEEDED(c2->put_DefaultBackgroundColor(clear))) {
                                DWORD none = kDwmCornerNone;
                                DwmSetWindowAttribute(g_hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &none, sizeof(none));
                                web->AddScriptToExecuteOnDocumentCreated(
                                    L"document.documentElement.setAttribute('data-alpha','1');", nullptr);
                            }
                        }
                    }

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
                    //   {"type":"open-license"} → 用系统默认浏览器打开许可协议（台账 §五 A，
                    //                             地址见 kLicenseUrl）
                    //   {"type":"cancel"} → 取消安装（件 2a；回滚归 2c）
                    // ── 件 2c 新增 ────────────────────────────────────────────────
                    //   {"type":"install-start","allowOlder":true} → 版本守卫屏上点了「仍要安装」
                    //   {"type":"uninstall-start"} → 查有没有在跑的 LinkDesk，回 `uninstall-running` / `uninstall-norun`
                    //   {"type":"uninstall-run"}   → 帧 2「关闭并继续」：优雅关（WM_CLOSE，**不 taskkill**）
                    //                                关掉了回 `uninstall-closed`，10s 没关掉回 `uninstall-close-timeout`
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
                                // 件 2c：版本守卫屏的「仍要安装」——放行位只对本次点击有效，
                                // 由 StartInstall 消费后 **不清零**：守卫就发生在同一次调用的最前头。
                                if (JsonGetBool(m, L"allowOlder", false)) g_versionAck = true;
                                StartInstall(JsonGetString(m, L"dir"), o);
                            } else if (m.find(L"\"uninstall-start\"") != std::wstring::npos) {
                                // 件 2c（02 §三）：有实例在跑 ⇒ 帧 2 问一句「关闭并继续 / 稍后」；
                                // 没在跑 ⇒ 直接推帧 3。**不静默杀进程**（taskkill 一律禁止）。
                                PostJson(IsAppRunning() ? L"{\"type\":\"uninstall-running\"}"
                                                        : L"{\"type\":\"uninstall-norun\"}");
                            } else if (m.find(L"\"uninstall-run\"") != std::wstring::npos) {
                                // 帧 2「关闭并继续」：keep 一并带过来（「保留我的数据」默认勾，
                                // 勾掉 = 界面上做过行内二次确认后才到这儿）。先请它自己退
                                // （WM_CLOSE，走它自己的保存流程），再靠 kCloseWaitTimer 轮询——
                                // **退净了才开清理**；没在跑就直接开。**不强杀**（05 §4.3）。
                                g_unKeep = JsonGetBool(m, L"keep", true) ? 1 : 0;
                                if (!IsAppRunning()) {
                                    PostJson(L"{\"type\":\"uninstall-closed\"}");
                                    StartUninstall();
                                } else {
                                    RequestAppClose();
                                    g_closeWaitStart = GetTickCount();
                                    SetTimer(g_hwnd, kCloseWaitTimer, 250, nullptr);
                                }
                            } else if (m.find(L"\"browse-dir\"") != std::wstring::npos) {
                                PickInstallDir(JsonGetString(m, L"dir"));
                            } else if (m.find(L"\"open-license\"") != std::wstring::npos) {
                                // 台账 §五 A：页面一直在发这条，宿主**从来没受理** ⇒ 欢迎屏的
                                // 「许可协议」是死按钮（点下去毫无回话）。受理 = 用系统默认浏览器
                                // 打开仓库根那份 LICENSE（地址见 kLicenseUrl）。
                                // ShellExecuteW 不阻塞 UI 线程；打不开也**不弹框**——开浏览器失败
                                // 不是安装流程该管的事，静默即可（别把用户吓一跳）。
                                ShellExecuteW(nullptr, L"open", kLicenseUrl, nullptr, nullptr,
                                              SW_SHOWNORMAL);
                            } else if (m.find(L"\"set-lang\"") != std::wstring::npos) {
                                // 件 2b：语言持久化**写侧**（读侧 1c 已通，见 ReadSavedLanguage）
                                std::wstring code = JsonGetString(m, L"lang");
                                if (!code.empty()) WriteInstallerLanguage(code);
                            } else if (m.find(L"\"cancel\"") != std::wstring::npos) {
                                CancelInstall();
                            } else if (m.find(L"\"install-done\"") != std::wstring::npos) {
                                // 完成屏「运行 LinkDesk」勾了才拉——装完就让人看见东西，别让他自己找图标
                                if (JsonGetBool(m, L"launch", false)) LaunchInstalledApp();
                                CloseWindowNow();
                            } else if (m.find(L"\"close\"") != std::wstring::npos
                                       || m.find(L"\"exit\"") != std::wstring::npos
                                       || m.find(L"\"uninstall-done\"") != std::wstring::npos) {
                                // 件 2c：**必须走 CloseWindowNow**，不能直接 PostMessageW(WM_CLOSE)
                                // —— WM_CLOSE 现在会先回问页面，直接发会变成「页面 → 宿主 → 页面」的死循环。
                                CloseWindowNow();
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
                                SetTimer(g_hwnd, kCaptureTimer, g_captureDelayMs, nullptr);
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
                        if (g_uninstall) {
                            // 件 2d：卸载态的目标 = 本 exe 所在目录（卸载器就装在 INSTDIR），
                            // 不认 ARP（那可能是死指向/别的登记）
                            dir = ExeDir();
                        } else if (dir.empty()) {
                            std::wstring existing = FindInstalledDir();
                            dir = existing.empty() ? DefaultInstallDir() : existing;
                        }
                        params.push_back(L"dir=" + UrlEnc(dir));
                    }
                    // 件 2d：卸载四帧的真数据——体积（MB，四舍去五不入）与 userData 路径
                    if (g_uninstall && g_previewQuery.find(L"usize=") == std::wstring::npos) {
                        wchar_t mb[32] = {};
                        swprintf(mb, 32, L"%llu", DirBytes(ExeDir()) >> 20);
                        params.push_back(L"usize=" + std::wstring(mb));
                    }
                    if (g_uninstall && g_previewQuery.find(L"udata=") == std::wstring::npos)
                        params.push_back(L"udata=" + UrlEnc(UserDataDir()));
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
        Sleep(300);                        // 给 msedgewebview2.exe 一点开始退场的时间；
                                           // 真结束与否不靠等——由 RemoveTree 的重试兜住
        RemoveTree(g_uiTempDir);
    }
    // 件 2d：卸载器自删（三道闸见 SpawnSelfDelete：名对 / 无载荷 / **卸载真跑完**）。
    // 🔴 用户点 ✕「什么都没做」的那条路**不删**——0.2.35 就是在这儿删掉了 INSTDIR 的卸载器，
    //    让 ARP 与开始菜单一起变死链（台账 §三 #6）。安装模式也不能走到这儿（那是用户手里的安装包本体）。
    if (g_uninstall) SpawnSelfDelete();
    return (int)msg.wParam;
}
