# capture.ps1 — 实机窗口截图（件 1a/1b 验收：无边框窗口在真实桌面上的样子）
#
# 为什么不用 PrintWindow：WebView2 内容走 DirectComposition，PrintWindow 拿到的是全黑。
# 为什么不用 SetWindowPos(HWND_TOPMOST)：引导器是普通权限进程，ZCode 宿主窗口提权，
#   跨完整性级别的置顶被 UIPI 静默丢弃（返回 True 但无效果）。
# 因此用「最小化全部 → 屏幕拷贝 → 还原」。引导器是 WS_POPUP 无 WS_MINIMIZEBOX，
#   MinimizeAll 对它无效 —— 它是唯一留在桌面上的窗口，正好是我们要的那张。
param(
    [string]$ProcName = "bootstrapper",
    [string]$OutPath = "shot-window.png",
    [int]$SettleMs = 1500,
    [switch]$NoMinimize    # 桌面已由调用方清干净时跳过最小化/还原（避免还原动作抢走前台，见 interact-test.ps1）
)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Cap32 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  public struct R { public int L, T, Ri, B; }
}
"@
Add-Type -AssemblyName System.Drawing
[Cap32]::SetProcessDPIAware() | Out-Null

$p = Get-Process -Name $ProcName -ErrorAction Stop |
     Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Error "window not found for $ProcName"; exit 1 }

$r = New-Object Cap32+R
[Cap32]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$w = $r.Ri - $r.L; $h = $r.B - $r.T

$shell = New-Object -ComObject Shell.Application
if (-not $NoMinimize) { $shell.MinimizeAll() }
Start-Sleep -Milliseconds $SettleMs
try {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($r.L, $r.T, 0, 0, (New-Object System.Drawing.Size($w, $h)))
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    "saved $OutPath ${w}x${h}"
} finally {
    if (-not $NoMinimize) { $shell.UndoMinimizeAll() }
}
