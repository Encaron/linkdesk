# interact-test.ps1 — 件 1b 交互验收：拖窗 / Enter 主按钮 / 语言下拉＋Esc / ✕ 退出
#
# 全部用真鼠标键盘事件（SetCursorPos + mouse_event + keybd_event），因为要验的正是「事件进得来」：
#   · 拖窗：无边框窗没有系统标题栏，拖动必须由页面发起 —— 页面 mousedown → postMessage({"type":"drag"})
#     → 宿主 GetCursorPos + ReleaseCapture + WM_NCLBUTTONDOWN/HTCAPTION。断言方式 = 窗口 rect 的位移
#     是否等于鼠标位移（不等就说明桥没通或落点不在拖拽区）。
#   · Enter / ✕ / 下拉：分别验 data-primary 默认主按钮、data-action="close" 的 postMessage 桥、自绘下拉。
# 桌面先 MinimizeAll 清场并保持（本脚本内截图一律 -NoMinimize），否则点击会打到别的前台窗口上。
param(
    [int]$SettleMs = 2500,
    [int]$Dx = 60,          # 拖窗位移（逻辑像素）
    [int]$Dy = 40,
    [switch]$KeepOpen       # 调完不关窗（排查用）
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'out\bootstrapper.exe'
$shot = Join-Path $PSScriptRoot 'capture.ps1'
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class IT {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, IntPtr e);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct R { public int L, T, Ri, B; }
  public const uint DOWN = 0x0002, UP = 0x0004;
}
"@
[IT]::SetProcessDPIAware() | Out-Null

function Rect([IntPtr]$h) { $r = New-Object IT+R; [IT]::GetWindowRect($h, [ref]$r) | Out-Null; return $r }
function Click([int]$x, [int]$y) {
    [IT]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 120
    [IT]::mouse_event([IT]::DOWN, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 60
    [IT]::mouse_event([IT]::UP, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 250
}
function Key([byte]$vk) {
    [IT]::keybd_event($vk, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 60
    [IT]::keybd_event($vk, 0, 2, [IntPtr]::Zero); Start-Sleep -Milliseconds 250
}

if (Get-Process -Name bootstrapper -ErrorAction SilentlyContinue) { throw "已有 bootstrapper 在跑，先关掉" }
Start-Process -FilePath $exe -ArgumentList '--preview="screen=home&dust=0"' | Out-Null
Start-Sleep -Milliseconds $SettleMs
$p = Get-Process -Name bootstrapper | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { throw "窗口没出来" }
$h = $p.MainWindowHandle

$shell = New-Object -ComObject Shell.Application
$shell.MinimizeAll(); Start-Sleep -Milliseconds 800
[IT]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 400

$r0 = Rect $h
$scale = ($r0.Ri - $r0.L) / 780.0
$ok = @()

# ① 拖窗：落点取品牌行的空白处（window 内逻辑 500,66 —— 在 .brand[data-drag] 上，不在任何控件上）
$sx = $r0.L + [int](500 * $scale); $sy = $r0.T + [int](66 * $scale)
[IT]::SetCursorPos($sx, $sy) | Out-Null; Start-Sleep -Milliseconds 200
[IT]::mouse_event([IT]::DOWN, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 250
[IT]::SetCursorPos($sx + [int]($Dx * $scale), $sy + [int]($Dy * $scale)) | Out-Null; Start-Sleep -Milliseconds 350
[IT]::mouse_event([IT]::UP, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 350
$r1 = Rect $h
$mx = $r1.L - $r0.L; $my = $r1.T - $r0.T
$dragOk = ([Math]::Abs($mx - [int]($Dx * $scale)) -le 2) -and ([Math]::Abs($my - [int]($Dy * $scale)) -le 2)
$ok += , @('拖窗（postMessage drag → HTCAPTION）', $dragOk, "rect 位移=($mx,$my) 期望=($([int]($Dx*$scale)),$([int]($Dy*$scale)))")

# ② 语言下拉：点开 → 截图；Esc 只收弹层（不该触发关窗分流）
Click ($r1.L + [int](52 * $scale)) ($r1.T + [int](23 * $scale))
& $shot -OutPath (Join-Path $root 'out\it-01-lang-open.png') -NoMinimize -SettleMs 700 | Out-Null
Key 0x1B
& $shot -OutPath (Join-Path $root 'out\it-02-lang-esc.png') -NoMinimize -SettleMs 700 | Out-Null
$ok += , @('Esc 后进程仍在（只收下拉）', (-not $p.HasExited), "hasExited=$($p.HasExited)")

# ③ ✕（主屏）= 直接退（进度屏的 ✕ 走取消回滚分支，见 app.js closeByStage，故本测只在主屏做）
$r2 = Rect $h
Click ($r2.Ri - [int](31 * $scale)) ($r2.T + [int](29 * $scale))
$exited = $p.WaitForExit(5000)
$ok += , @('主屏 ✕ 关闭进程（postMessage close → WM_CLOSE）', $exited, "exitCode=$(if ($exited) { $p.ExitCode } else { 'n/a' })")

# ④ Enter = 当前屏主按钮：重开一个，主屏按 Enter 应切到进度屏（截图给人看）
Start-Process -FilePath $exe -ArgumentList '--preview="screen=home&dust=0"' | Out-Null
Start-Sleep -Milliseconds $SettleMs
$p2 = Get-Process -Name bootstrapper | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
[IT]::SetForegroundWindow($p2.MainWindowHandle) | Out-Null; Start-Sleep -Milliseconds 400
Key 0x0D
& $shot -OutPath (Join-Path $root 'out\it-03-enter-progress.png') -NoMinimize -SettleMs 900 | Out-Null
if (-not $KeepOpen) { Stop-Process -Name bootstrapper -Force -ErrorAction SilentlyContinue }

$shell.UndoMinimizeAll()

""
"== 交互验收 =="
foreach ($t in $ok) { "{0} {1}   {2}" -f $(if ($t[1]) { 'PASS' } else { 'FAIL' }), $t[0], $t[2] }
"截图：out\it-01-lang-open.png（下拉展开）/ it-02-lang-esc.png（Esc 已收）/ it-03-enter-progress.png（Enter → 进度屏）"
if ($ok | Where-Object { -not $_[1] }) { exit 1 }
