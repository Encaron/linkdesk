// 件 2c · 进程守卫实现（见 procguard.h 的规格与设计理由）

#include "procguard.h"
#include <tlhelp32.h>
#include <vector>

const wchar_t* kAppProcessName = L"LinkDesk.exe";

bool IsAppRunning()
{
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return false;   // 拿不到快照 ⇒ 当作没在跑（宁可不拦）
    PROCESSENTRY32W pe = {};
    pe.dwSize = sizeof(pe);
    bool found = false;
    const DWORD self = GetCurrentProcessId();
    if (Process32FirstW(snap, &pe)) {
        do {
            if (pe.th32ProcessID == self) continue;   // 自己不算（万一被改名成同名也不该自我认领）
            if (pe.szExeFile[0] && _wcsicmp(pe.szExeFile, kAppProcessName) == 0) { found = true; break; }
        } while (Process32NextW(snap, &pe));
    }
    CloseHandle(snap);
    return found;
}

/** EnumWindows 回调：把「属于 LinkDesk 进程」的顶层窗口收进 ctx。
 *  EnumWindows 本身只枚举顶层窗（子窗/控件不在其列）——正是 WM_CLOSE 该去的地方。 */
struct CloseCtx { std::vector<HWND> wins; DWORD self; };

static BOOL CALLBACK EnumAppWindows(HWND h, LPARAM lp)
{
    CloseCtx* ctx = reinterpret_cast<CloseCtx*>(lp);
    DWORD pid = 0;
    GetWindowThreadProcessId(h, &pid);
    if (!pid || pid == ctx->self) return TRUE;
    // 认进程名而不是窗口标题：标题是用户可见文案（随语言/版本变），进程名才是契约
    HANDLE p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!p) return TRUE;
    wchar_t exe[MAX_PATH] = {};
    DWORD n = MAX_PATH;
    bool mine = QueryFullProcessImageNameW(p, 0, exe, &n) != FALSE;
    CloseHandle(p);
    if (!mine || n == 0) return TRUE;
    const wchar_t* base = exe;
    for (const wchar_t* q = exe; *q; ++q)
        if (*q == L'\\' || *q == L'/') base = q + 1;
    if (_wcsicmp(base, kAppProcessName) != 0) return TRUE;
    ctx->wins.push_back(h);
    return TRUE;
}

int RequestAppClose()
{
    CloseCtx ctx;
    ctx.self = GetCurrentProcessId();
    EnumWindows(EnumAppWindows, reinterpret_cast<LPARAM>(&ctx));
    for (HWND h : ctx.wins) PostMessageW(h, WM_CLOSE, 0, 0);   // 不 SendMessage：不替对方阻塞
    return (int)ctx.wins.size();
}
