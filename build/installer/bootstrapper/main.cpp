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
#include <objidl.h>
#include <string>
#include <vector>
#include <algorithm>
#include <functional>
#include <atomic>
#include <wrl/client.h>
#include <wrl/event.h>

#include "WebView2.h"
#include "WebView2EnvironmentOptions.h"

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
// --capture 落图的延时定时器（件 1c 起 i18n 是异步 fetch：导航完成 ≠ 画面落定）
static const UINT_PTR kCaptureTimer = 1;
static const UINT kCaptureDelayMs = 1200;   // i18n fetch ＋ enter 入场动效 .8s 都在这之前落定

static void DoCapture();   // 定义在 ExeDir() 之后（WndProc 的 WM_TIMER 要用）

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

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, PWSTR, int nCmdShow)
{
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    for (int i = 1; argv && i < argc; ++i) {
        if (wcscmp(argv[i], L"--debug") == 0) g_debug = true;
        if (wcscmp(argv[i], L"--uninstall") == 0) g_uninstall = true;
        if (wcsncmp(argv[i], L"--capture=", 10) == 0) g_capturePath = argv[i] + 10;
        if (wcsncmp(argv[i], L"--preview=", 10) == 0) g_previewQuery = argv[i] + 10;
    }
    if (argv) LocalFree(argv);
    if (g_uninstall) { kWinW = 720; kWinH = 540; }   // 卸载窗比安装窗略小（E-卸载屏 mockup）

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

    // WebView2 环境：用户数据夹放 exe 旁临时目录（安装器不落地用户配置）
    std::wstring exeDir = ExeDir();
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
                    //   {"type":"close"|"exit"|"install-done"|"uninstall-done"} → 关窗（细粒度分流归件 2c）
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
                            } else if (m.find(L"\"close\"") != std::wstring::npos
                                       || m.find(L"\"exit\"") != std::wstring::npos
                                       || m.find(L"\"install-done\"") != std::wstring::npos
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
    return (int)msg.wParam;
}
